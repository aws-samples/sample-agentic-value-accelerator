"""
Kill Switch — Revoke/restore Bedrock access for ALL registered agents.

Attaches an inline IAM deny policy to every unique agent execution role,
immediately blocking all bedrock:InvokeModel calls. Reversible by removing
the policy.

Usage:
    python kill_switch.py revoke --reason "Emergency: agents behaving unexpectedly" --admin-user admin@company.com
    python kill_switch.py restore --reason "Issue resolved" --admin-user admin@company.com
    python kill_switch.py status

How it works:
    1. Scans agent-registry DynamoDB for all agents with iam_role_name
    2. Deduplicates IAM roles (100 agents might share 5 roles)
    3. Attaches/removes a deny-all-Bedrock inline policy on each unique role
    4. Updates registry status for all affected agents
    5. Cascades to signal tables (last_action = access_revoked/access_restored)
    6. Logs every action to intervention-log DynamoDB
"""

import argparse
import json
import logging
import os
import uuid
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone

import boto3
from botocore.config import Config
from botocore.exceptions import ClientError

logging.basicConfig(level=logging.INFO, format="%(levelname)s %(message)s")
logger = logging.getLogger(__name__)

REGION = os.environ.get("AWS_REGION", os.environ.get("REGION", "us-east-1"))
REGISTRY_TABLE = os.environ.get("REGISTRY_TABLE", "agent-registry")
INTERVENTION_TABLE = os.environ.get("INTERVENTION_TABLE", "intervention-log")
COST_SIGNALS_TABLE = os.environ.get("COST_SIGNALS_TABLE", "cost-signals")
OBS_SIGNALS_TABLE = os.environ.get("OBS_SIGNALS_TABLE", "observability-signals")
EVAL_SIGNALS_TABLE = os.environ.get("EVAL_SIGNALS_TABLE", "evaluation-signals")

KILL_SWITCH_POLICY_NAME = "AgentSafety-KillSwitch"
KILL_SWITCH_POLICY_DOC = json.dumps({
    "Version": "2012-10-17",
    "Statement": [{
        "Sid": "AgentSafetyKillSwitch",
        "Effect": "Deny",
        "Action": [
            "bedrock:InvokeModel",
            "bedrock:InvokeModelWithResponseStream",
        ],
        "Resource": "*",
    }],
})

retry_config = Config(retries={"max_attempts": 3, "mode": "adaptive"})


class KillSwitch:
    """Revoke/restore Bedrock access for all registered agents."""

    def __init__(self, region: str = REGION):
        session = boto3.Session(region_name=region)
        self.iam = session.client("iam", config=retry_config)
        self.dynamodb = session.resource("dynamodb", region_name=region)
        self.region = region

    # ------------------------------------------------------------------
    # Internal helpers
    # ------------------------------------------------------------------

    def _get_all_agents(self) -> list[dict]:
        """Get all agents from registry."""
        table = self.dynamodb.Table(REGISTRY_TABLE)
        items = []
        try:
            resp = table.scan()
            items.extend(resp.get("Items", []))
            while "LastEvaluatedKey" in resp:
                resp = table.scan(ExclusiveStartKey=resp["LastEvaluatedKey"])
                items.extend(resp.get("Items", []))
        except ClientError as e:
            logger.error(f"Failed to scan registry: {e}")
        # Filter out internal items (e.g. _settings) that are not real agents
        return [i for i in items if not i.get("agent_name", "").startswith("_")]

    def _get_unique_roles(self, agents: list[dict]) -> dict[str, list[str]]:
        """Map unique IAM role names to their agent names.
        Returns {role_name: [agent_name1, agent_name2, ...]}"""
        role_map: dict[str, list[str]] = {}
        for agent in agents:
            role = agent.get("iam_role_name", "")
            if not role:
                logger.warning(f"[SKIP] {agent.get('agent_name', '?')} — no iam_role_name in registry")
                continue
            role_map.setdefault(role, []).append(agent.get("agent_name", ""))
        return role_map

    def _attach_deny_policy(self, role_name: str) -> str:
        """Attach kill switch deny policy to a role. Returns status."""
        try:
            self.iam.put_role_policy(
                RoleName=role_name,
                PolicyName=KILL_SWITCH_POLICY_NAME,
                PolicyDocument=KILL_SWITCH_POLICY_DOC,
            )
            return "revoked"
        except ClientError as e:
            code = e.response["Error"]["Code"]
            if code == "NoSuchEntity":
                return "role_not_found"
            logger.error(f"Failed to attach policy to {role_name}: {e}")
            return "error"

    def _remove_deny_policy(self, role_name: str) -> str:
        """Remove kill switch deny policy from a role. Returns status."""
        try:
            self.iam.delete_role_policy(
                RoleName=role_name,
                PolicyName=KILL_SWITCH_POLICY_NAME,
            )
            return "restored"
        except ClientError as e:
            code = e.response["Error"]["Code"]
            if code == "NoSuchEntity":
                return "not_revoked"
            logger.error(f"Failed to remove policy from {role_name}: {e}")
            return "error"

    def _check_role_revoked(self, role_name: str) -> bool:
        """Check if a role has the kill switch policy attached."""
        try:
            self.iam.get_role_policy(
                RoleName=role_name,
                PolicyName=KILL_SWITCH_POLICY_NAME,
            )
            return True
        except ClientError:
            return False

    def _update_registry_status(self, agent_names: list[str], status: str):
        """Update registry status for agents."""
        table = self.dynamodb.Table(REGISTRY_TABLE)
        now = datetime.now(timezone.utc).isoformat()
        for name in agent_names:
            try:
                table.update_item(
                    Key={"agent_name": name},
                    UpdateExpression="SET #s = :status, updated_at = :now, kill_switch_at = :now",
                    ExpressionAttributeNames={"#s": "status"},
                    ExpressionAttributeValues={":status": status, ":now": now},
                )
            except ClientError:
                pass

    def _cascade_signals(self, agent_names: list[str], action: str):
        """Update all signal tables with the kill switch action."""
        now_iso = datetime.now(timezone.utc).isoformat()

        for agent_name in agent_names:
            # Cost signals
            try:
                self.dynamodb.Table(COST_SIGNALS_TABLE).update_item(
                    Key={"agent_name": agent_name},
                    UpdateExpression="SET last_action = :a, last_action_at = :t",
                    ExpressionAttributeValues={":a": action, ":t": now_iso},
                )
            except ClientError:
                pass

            # Obs signals
            try:
                items = self.dynamodb.Table(OBS_SIGNALS_TABLE).scan().get("Items", [])
                for item in items:
                    if item.get("agent_name") == agent_name:
                        self.dynamodb.Table(OBS_SIGNALS_TABLE).update_item(
                            Key={"agent_name": item["agent_name"], "signal_key": item["signal_key"]},
                            UpdateExpression="SET last_action = :a, last_action_at = :t",
                            ExpressionAttributeValues={":a": action, ":t": now_iso},
                        )
            except ClientError:
                pass

            # Eval signals
            try:
                items = self.dynamodb.Table(EVAL_SIGNALS_TABLE).scan().get("Items", [])
                for item in items:
                    if item.get("agent_name") == agent_name:
                        self.dynamodb.Table(EVAL_SIGNALS_TABLE).update_item(
                            Key={"agent_name": item["agent_name"], "signal_key": item["signal_key"]},
                            UpdateExpression="SET last_action = :a, last_action_at = :t",
                            ExpressionAttributeValues={":a": action, ":t": now_iso},
                        )
            except ClientError:
                pass

    def _log_intervention(self, agent_names: list[str], action: str, reason: str,
                          admin_user: str, role_results: dict[str, str]) -> list[str]:
        """Log kill switch action to intervention-log. Returns intervention IDs."""
        table = self.dynamodb.Table(INTERVENTION_TABLE)
        now = datetime.now(timezone.utc).isoformat()
        intervention_ids = []

        for name in agent_names:
            iid = str(uuid.uuid4())
            try:
                table.put_item(Item={
                    "intervention_id": iid,
                    "timestamp": now,
                    "agent_name": name,
                    "action": action,
                    "triggered_by": "human",
                    "reason": reason,
                    "admin_user": admin_user,
                    "role_results": role_results,
                    "rollback_status": "none",
                })
                intervention_ids.append(iid)
            except ClientError as e:
                logger.warning(f"Failed to log intervention for {name}: {e}")

        return intervention_ids

    # ------------------------------------------------------------------
    # Public API
    # ------------------------------------------------------------------

    def revoke_all(self, reason: str, admin_user: str) -> dict:
        """Revoke Bedrock access for ALL registered agents."""
        return self._revoke_or_restore(reason, admin_user, action="revoke", agent_name=None)

    def restore_all(self, reason: str, admin_user: str) -> dict:
        """Restore Bedrock access for ALL registered agents."""
        return self._revoke_or_restore(reason, admin_user, action="restore", agent_name=None)

    def revoke_agent(self, agent_name: str, reason: str, admin_user: str) -> dict:
        """Revoke Bedrock access for a SINGLE agent."""
        return self._revoke_or_restore(reason, admin_user, action="revoke", agent_name=agent_name)

    def restore_agent(self, agent_name: str, reason: str, admin_user: str) -> dict:
        """Restore Bedrock access for a SINGLE agent."""
        return self._revoke_or_restore(reason, admin_user, action="restore", agent_name=agent_name)

    def _revoke_or_restore(self, reason: str, admin_user: str, action: str, agent_name: str | None) -> dict:
        """Shared logic for revoke/restore — all agents or a single agent.

        1. Scan registry → get agents (all or filtered by name)
        2. Deduplicate IAM roles
        3. Attach or remove deny policy on each unique role (parallel)
        4. Update registry status
        5. Cascade to signal tables
        6. Log to intervention-log
        """
        if not reason or not admin_user:
            return {"status": "error", "detail": "reason and admin_user are required"}

        all_agents = self._get_all_agents()
        if agent_name:
            norm = agent_name.lower().replace("-", "").replace("_", "")
            agents = [a for a in all_agents if a.get("agent_name", "").lower().replace("-", "").replace("_", "") == norm]
            if not agents:
                return {"status": "error", "detail": f"Agent '{agent_name}' not found in registry",
                        "roles_affected": 0, "agents_affected": 0}
        else:
            agents = all_agents

        if not agents:
            return {"status": "ok", "detail": "no agents in registry", "roles_affected": 0, "agents_affected": 0}

        role_map = self._get_unique_roles(agents)
        if not role_map:
            detail = f"agent '{agent_name}' has no iam_role_name set" if agent_name else "no agents have iam_role_name set"
            return {"status": "warning", "detail": detail,
                    "roles_affected": 0, "agents_affected": 0}

        is_revoke = action == "revoke"
        policy_fn = self._attach_deny_policy if is_revoke else self._remove_deny_policy
        new_status = "revoked" if is_revoke else "active"
        signal_action = "access_revoked" if is_revoke else "access_restored"
        log_action = "revoke_access" if is_revoke else "restore_access"
        success_states = {"revoked"} if is_revoke else {"restored", "not_revoked"}

        # Apply policy to each unique role in parallel
        role_results: dict[str, str] = {}
        with ThreadPoolExecutor(max_workers=20) as pool:
            futures = {pool.submit(policy_fn, role): role for role in role_map}
            for future in futures:
                role = futures[future]
                role_results[role] = future.result()

        # Collect affected agent names
        affected_names = []
        for role, names in role_map.items():
            if role_results.get(role) in success_states:
                affected_names.extend(names)

        # Update registry, cascade signals, log interventions
        self._update_registry_status(affected_names, new_status)
        self._cascade_signals(affected_names, signal_action)
        intervention_ids = self._log_intervention(affected_names, log_action, reason, admin_user, role_results)

        affected_count = sum(1 for s in role_results.values() if s in success_states)
        scope = f"agent '{agent_name}'" if agent_name else "ALL agents"
        logger.info(f"KILL SWITCH {action.upper()} ({scope}) | Roles: {affected_count}/{len(role_map)} | "
                     f"Agents: {len(affected_names)} | By: {admin_user}")

        return {
            "status": new_status if is_revoke else "restored",
            "roles_affected": affected_count,
            "roles_total": len(role_map),
            "agents_affected": len(affected_names),
            "agents_total": len(agents),
            "role_results": role_results,
            "intervention_ids": intervention_ids,
            "reason": reason,
            "admin_user": admin_user,
            "agent_name": agent_name or "(all agents)",
            "timestamp": datetime.now(timezone.utc).isoformat(),
        }

    def get_status(self) -> dict:
        """Check kill switch status for all agents.

        Returns which agents are revoked vs active based on
        whether their IAM role has the kill switch policy.
        """
        agents = self._get_all_agents()
        if not agents:
            return {"kill_switch_active": False, "agents": [], "roles_checked": 0}

        role_map = self._get_unique_roles(agents)

        # Check each unique role in parallel
        role_revoked: dict[str, bool] = {}
        with ThreadPoolExecutor(max_workers=20) as pool:
            futures = {pool.submit(self._check_role_revoked, role): role for role in role_map}
            for future in futures:
                role = futures[future]
                role_revoked[role] = future.result()

        # Build per-agent status
        agent_statuses = []
        any_revoked = False
        all_revoked = True if role_map else False

        for agent in agents:
            role = agent.get("iam_role_name", "")
            is_revoked = role_revoked.get(role, False) if role else False
            if is_revoked:
                any_revoked = True
            else:
                all_revoked = False
            agent_statuses.append({
                "agent_name": agent.get("agent_name", ""),
                "iam_role_name": role,
                "revoked": is_revoked,
                "registry_status": agent.get("status", ""),
                "team": agent.get("team", ""),
            })

        return {
            "kill_switch_active": all_revoked and any_revoked,
            "any_revoked": any_revoked,
            "all_revoked": all_revoked,
            "agents": agent_statuses,
            "roles_checked": len(role_map),
            "total_agents": len(agents),
            "revoked_agents": sum(1 for a in agent_statuses if a["revoked"]),
            "timestamp": datetime.now(timezone.utc).isoformat(),
        }


# ======================================================================
# Lambda handler — invoked by dashboard
# ======================================================================

def handler(event, context):
    """Lambda handler for kill switch operations.

    Input event:
      {"action": "revoke"|"restore"|"status", "reason": "...", "admin_user": "...", "agent_name": "..."}
      When agent_name is provided, only that agent is affected.
      When agent_name is omitted, ALL agents are affected.
    """
    action = event.get("action", "")
    reason = event.get("reason", "")
    admin_user = event.get("admin_user", "")
    agent_name = event.get("agent_name", "")

    ks = KillSwitch(region=REGION)

    if action == "revoke":
        if not reason or not admin_user:
            return {"statusCode": 400, "body": json.dumps({"error": "reason and admin_user required"})}
        if agent_name:
            result = ks.revoke_agent(agent_name, reason, admin_user)
        else:
            result = ks.revoke_all(reason, admin_user)
        return {"statusCode": 200, "body": json.dumps(result, default=str)}

    elif action == "restore":
        if not reason or not admin_user:
            return {"statusCode": 400, "body": json.dumps({"error": "reason and admin_user required"})}
        if agent_name:
            result = ks.restore_agent(agent_name, reason, admin_user)
        else:
            result = ks.restore_all(reason, admin_user)
        return {"statusCode": 200, "body": json.dumps(result, default=str)}

    elif action == "status":
        result = ks.get_status()
        return {"statusCode": 200, "body": json.dumps(result, default=str)}

    return {"statusCode": 400, "body": json.dumps({"error": f"Unknown action: {action}"})}


# ======================================================================
# CLI
# ======================================================================

def main() -> None:
    parser = argparse.ArgumentParser(description="Agent Safety Kill Switch CLI")
    parser.add_argument("--region", default=REGION)
    sub = parser.add_subparsers(dest="command")

    rev = sub.add_parser("revoke", help="Revoke Bedrock access for ALL agents")
    rev.add_argument("--reason", required=True, help="Why are you activating the kill switch?")
    rev.add_argument("--admin-user", required=True, help="Your username/email")

    res = sub.add_parser("restore", help="Restore Bedrock access for ALL agents")
    res.add_argument("--reason", required=True, help="Why are you restoring access?")
    res.add_argument("--admin-user", required=True, help="Your username/email")

    sub.add_parser("status", help="Check kill switch status")

    args = parser.parse_args()
    if not args.command:
        parser.print_help()
        return

    ks = KillSwitch(region=args.region)

    if args.command == "revoke":
        print("\n⚠️  ACTIVATING KILL SWITCH — This will revoke Bedrock access for ALL agents!")
        confirm = input("Type 'CONFIRM' to proceed: ")
        if confirm != "CONFIRM":
            print("Cancelled.")
            return
        result = ks.revoke_all(args.reason, args.admin_user)
        print(f"\n🔴 Kill switch ACTIVATED")
        print(f"   Roles affected: {result['roles_affected']}/{result['roles_total']}")
        print(f"   Agents affected: {result['agents_affected']}/{result['agents_total']}")
        print(json.dumps(result.get("role_results", {}), indent=2))

    elif args.command == "restore":
        result = ks.restore_all(args.reason, args.admin_user)
        print(f"\n🟢 Kill switch DEACTIVATED")
        print(f"   Roles restored: {result['roles_affected']}/{result['roles_total']}")
        print(f"   Agents restored: {result['agents_affected']}/{result['agents_total']}")

    elif args.command == "status":
        result = ks.get_status()
        active = "🔴 ACTIVE" if result["kill_switch_active"] else "🟢 INACTIVE"
        print(f"\nKill Switch: {active}")
        print(f"Agents: {result['revoked_agents']}/{result['total_agents']} revoked")
        for a in result["agents"]:
            icon = "🔴" if a["revoked"] else "🟢"
            print(f"  {icon} {a['agent_name']:30s} | role: {a['iam_role_name']:30s} | {a['registry_status']}")


if __name__ == "__main__":
    main()
