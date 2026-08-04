#!/usr/bin/env python3
"""Seed demo AgentCore tools + Cedar policy onto a use-case gateway.

Makes the "tool access control" demo reproducible: it recreates, idempotently,
exactly what shows AgentCore Gateway governing which tools an agent may call.

For the target use case's gateway (default: economic-research-gateway) it:
  1. Deploys a demo Lambda (two tools: get_gdp_data, get_inflation_data)
  2. Registers the Lambda as an MCP gateway target ("econ-tools")
  3. Attaches the platform policy engine to the gateway in ENFORCE mode
  4. Creates a Cedar policy that PERMITS get_gdp_data (when country=="US") — so
     get_inflation_data is denied by AgentCore's default-deny.

Demo (all names carry a "demo" marker so they're obvious in the console):
  - allowed:  tools/call econ-tools___get_gdp_data      {"country":"US"}
  - denied:   tools/call econ-tools___get_inflation_data {"country":"US"}

AgentCore Cedar validation rejects unconditional permit/forbid rules ("overly
permissive/restrictive"); the permit therefore carries a value condition, and
the block is expressed as default-deny rather than a standalone forbid. This
mirrors the platform's own allow-list posture.

Usage:
  python3 seed_demo_agentcore.py                       # economic-research-gateway
  python3 seed_demo_agentcore.py --gateway-name X-gateway
  python3 seed_demo_agentcore.py --region us-west-2
  python3 seed_demo_agentcore.py --teardown            # remove everything it created

Idempotent: re-running reuses existing resources instead of erroring.
"""

import argparse
import io
import json
import sys
import time
import zipfile

import boto3
from botocore.exceptions import ClientError

# --- Demo constants (marked so they're recognizable in the console) ---
LAMBDA_NAME = "econ-tools-demo"
LAMBDA_ROLE = "econ-tools-demo-lambda-role"
TARGET_NAME = "econ-tools"           # -> tools named econ-tools___<tool>
POLICY_NAME = "permit_gdp_us_only"   # Cedar names must match ^[A-Za-z][A-Za-z0-9_]*$
ALLOWED_TOOL = "get_gdp_data"
DENIED_TOOL = "get_inflation_data"

TOOL_SCHEMA = [
    {
        "name": ALLOWED_TOOL,
        "description": "Returns GDP growth data for a country (demo data)",
        "inputSchema": {
            "type": "object",
            "properties": {"country": {"type": "string", "description": "Country code, e.g. US"}},
            "required": ["country"],
        },
    },
    {
        "name": DENIED_TOOL,
        "description": "Returns inflation (CPI) data for a country (demo data)",
        "inputSchema": {
            "type": "object",
            "properties": {"country": {"type": "string", "description": "Country code, e.g. US"}},
            "required": ["country"],
        },
    },
]


def log(msg):
    print(f"  {msg}", flush=True)


def _zip_handler():
    """Zip lambda_handler.py (sibling file) into an in-memory deployment package."""
    import os
    here = os.path.dirname(os.path.abspath(__file__))
    src = os.path.join(here, "lambda_handler.py")
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as z:
        z.write(src, "lambda_handler.py")
    buf.seek(0)
    return buf.read()


def ensure_lambda_role(iam, account_id):
    trust = {
        "Version": "2012-10-17",
        "Statement": [{"Effect": "Allow", "Principal": {"Service": "lambda.amazonaws.com"},
                       "Action": "sts:AssumeRole"}],
    }
    try:
        arn = iam.create_role(
            RoleName=LAMBDA_ROLE,
            AssumeRolePolicyDocument=json.dumps(trust),
            Description="Demo econ-tools Lambda execution role (AgentCore tool-access demo)",
        )["Role"]["Arn"]
        iam.attach_role_policy(
            RoleName=LAMBDA_ROLE,
            PolicyArn="arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole",
        )
        log(f"created role {LAMBDA_ROLE}; waiting for propagation...")
        time.sleep(12)
        return arn
    except ClientError as e:
        if e.response["Error"]["Code"] == "EntityAlreadyExists":
            log(f"role {LAMBDA_ROLE} exists — reusing")
            return iam.get_role(RoleName=LAMBDA_ROLE)["Role"]["Arn"]
        raise


def ensure_lambda(lam, role_arn, region):
    code = _zip_handler()
    try:
        arn = lam.create_function(
            FunctionName=LAMBDA_NAME,
            Runtime="python3.12",
            Handler="lambda_handler.lambda_handler",
            Role=role_arn,
            Code={"ZipFile": code},
            Timeout=15,
            Description="Demo AgentCore tools (get_gdp_data / get_inflation_data)",
        )["FunctionArn"]
        log(f"created lambda {LAMBDA_NAME}")
    except ClientError as e:
        if e.response["Error"]["Code"] == "ResourceConflictException":
            lam.update_function_code(FunctionName=LAMBDA_NAME, ZipFile=code)
            arn = lam.get_function(FunctionName=LAMBDA_NAME)["Configuration"]["FunctionArn"]
            log(f"lambda {LAMBDA_NAME} exists — updated code")
        else:
            raise
    # Allow AgentCore to invoke it (idempotent).
    try:
        acct = arn.split(":")[4]
        lam.add_permission(
            FunctionName=LAMBDA_NAME, StatementId="agentcore-gw-invoke",
            Action="lambda:InvokeFunction", Principal="bedrock-agentcore.amazonaws.com",
            SourceAccount=acct,
        )
    except ClientError as e:
        if e.response["Error"]["Code"] != "ResourceConflictException":
            raise
    return arn


def find_gateway(agentcore, gateway_name):
    for gw in agentcore.list_gateways().get("items", []):
        if gw.get("name") == gateway_name and gw.get("status") not in ("DELETING", "DELETE_FAILED"):
            return gw["gatewayId"]
    return None


def ensure_target(agentcore, gateway_id, lambda_arn):
    for t in agentcore.list_gateway_targets(gatewayIdentifier=gateway_id).get("items", []):
        if t.get("name") == TARGET_NAME:
            log(f"gateway target {TARGET_NAME} exists — reusing ({t['targetId']})")
            return t["targetId"]
    resp = agentcore.create_gateway_target(
        gatewayIdentifier=gateway_id,
        name=TARGET_NAME,
        targetConfiguration={"mcp": {"lambda": {
            "lambdaArn": lambda_arn,
            "toolSchema": {"inlinePayload": TOOL_SCHEMA},
        }}},
        credentialProviderConfigurations=[{"credentialProviderType": "GATEWAY_IAM_ROLE"}],
    )
    tid = resp["targetId"]
    log(f"created gateway target {TARGET_NAME} ({tid})")
    return tid


def attach_policy_engine(agentcore, gateway_id, engine_arn, region):
    gw = agentcore.get_gateway(gatewayIdentifier=gateway_id)
    agentcore.update_gateway(
        gatewayIdentifier=gateway_id,
        name=gw["name"], roleArn=gw["roleArn"],
        protocolType=gw.get("protocolType", "MCP"),
        authorizerType=gw.get("authorizerType", "NONE"),
        policyEngineConfiguration={"arn": engine_arn, "mode": "ENFORCE"},
    )
    log(f"attached policy engine to gateway in ENFORCE mode")


def ensure_policy(agentcore, engine_id, gateway_arn):
    # Conditional permit on the allowed tool; everything else is default-deny.
    statement = (
        'permit(\n'
        '  principal,\n'
        f'  action == AgentCore::Action::"{TARGET_NAME}___{ALLOWED_TOOL}",\n'
        f'  resource == AgentCore::Gateway::"{gateway_arn}"\n'
        ') when {\n'
        '  context.input.country == "US"\n'
        '};'
    )
    for p in agentcore.list_policies(policyEngineId=engine_id).get("items", []):
        if p.get("name") == POLICY_NAME:
            log(f"policy {POLICY_NAME} exists — reusing")
            return p["policyId"]
    pid = agentcore.create_policy(
        name=POLICY_NAME, policyEngineId=engine_id,
        definition={"cedar": {"statement": statement}},
    )["policyId"]
    log(f"created Cedar policy {POLICY_NAME} ({pid}) — waiting for ACTIVE...")
    for _ in range(12):
        st = agentcore.get_policy(policyEngineId=engine_id, policyId=pid)["status"]
        if st == "ACTIVE":
            break
        if st == "CREATE_FAILED":
            reasons = agentcore.get_policy(policyEngineId=engine_id, policyId=pid).get("statusReasons")
            raise RuntimeError(f"policy {POLICY_NAME} CREATE_FAILED: {reasons}")
        time.sleep(5)
    return pid


def seed(args):
    region = args.region
    sess = boto3.Session(region_name=region)
    sts = sess.client("sts")
    account_id = sts.get_caller_identity()["Account"]
    iam = sess.client("iam")
    lam = sess.client("lambda")
    agentcore = sess.client("bedrock-agentcore-control")

    print(f"Seeding demo AgentCore tools+policy (account {account_id}, {region})")

    gateway_id = find_gateway(agentcore, args.gateway_name)
    if not gateway_id:
        sys.exit(f"ERROR: gateway '{args.gateway_name}' not found. Add it via the "
                 f"'Add Gateway' button on the use case first.")
    gateway_arn = f"arn:aws:bedrock-agentcore:{region}:{account_id}:gateway/{gateway_id}"
    log(f"gateway: {gateway_id}")

    engines = agentcore.list_policy_engines().get("policyEngines", [])
    if not engines:
        sys.exit("ERROR: no policy engine found in this account/region.")
    engine = engines[0]
    engine_id, engine_arn = engine["policyEngineId"], engine["policyEngineArn"]
    log(f"policy engine: {engine_id}")

    role_arn = ensure_lambda_role(iam, account_id)
    lambda_arn = ensure_lambda(lam, role_arn, region)
    ensure_target(agentcore, gateway_id, lambda_arn)
    attach_policy_engine(agentcore, gateway_id, engine_arn, region)
    ensure_policy(agentcore, engine_id, gateway_arn)

    gw_url = f"https://{gateway_id}.gateway.bedrock-agentcore.{region}.amazonaws.com/mcp"
    print("\nDone. Demo the allow/deny with:")
    print(f"  # ALLOWED:")
    print(f"  curl -X POST {gw_url} -H 'Content-Type: application/json' \\")
    print(f"    -d '{{\"jsonrpc\":\"2.0\",\"id\":1,\"method\":\"tools/call\",\"params\":"
          f"{{\"name\":\"{TARGET_NAME}___{ALLOWED_TOOL}\",\"arguments\":{{\"country\":\"US\"}}}}}}'")
    print(f"  # DENIED (policy enforcement):")
    print(f"  curl -X POST {gw_url} -H 'Content-Type: application/json' \\")
    print(f"    -d '{{\"jsonrpc\":\"2.0\",\"id\":2,\"method\":\"tools/call\",\"params\":"
          f"{{\"name\":\"{TARGET_NAME}___{DENIED_TOOL}\",\"arguments\":{{\"country\":\"US\"}}}}}}'")


def teardown(args):
    region = args.region
    sess = boto3.Session(region_name=region)
    agentcore = sess.client("bedrock-agentcore-control")
    lam = sess.client("lambda")
    iam = sess.client("iam")

    print(f"Tearing down demo AgentCore tools+policy ({region})")
    gateway_id = find_gateway(agentcore, args.gateway_name)
    if gateway_id:
        for t in agentcore.list_gateway_targets(gatewayIdentifier=gateway_id).get("items", []):
            if t.get("name") == TARGET_NAME:
                agentcore.delete_gateway_target(gatewayIdentifier=gateway_id, targetId=t["targetId"])
                log(f"deleted gateway target {TARGET_NAME}")
    for e in agentcore.list_policy_engines().get("policyEngines", []):
        for p in agentcore.list_policies(policyEngineId=e["policyEngineId"]).get("items", []):
            if p.get("name") == POLICY_NAME:
                agentcore.delete_policy(policyEngineId=e["policyEngineId"], policyId=p["policyId"])
                log(f"deleted policy {POLICY_NAME}")
    try:
        lam.delete_function(FunctionName=LAMBDA_NAME)
        log(f"deleted lambda {LAMBDA_NAME}")
    except ClientError:
        pass
    try:
        iam.detach_role_policy(RoleName=LAMBDA_ROLE,
                               PolicyArn="arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole")
        iam.delete_role(RoleName=LAMBDA_ROLE)
        log(f"deleted role {LAMBDA_ROLE}")
    except ClientError:
        pass
    print("Teardown complete. (Gateway + policy engine themselves are left intact.)")


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--region", default="us-west-2", help="AWS region (default us-west-2)")
    ap.add_argument("--gateway-name", default="economic-research-gateway",
                    help="Use-case gateway name (default economic-research-gateway)")
    ap.add_argument("--teardown", action="store_true", help="Remove everything this script created")
    args = ap.parse_args()
    (teardown if args.teardown else seed)(args)


if __name__ == "__main__":
    main()
