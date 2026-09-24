#!/usr/bin/env python3
"""Local test script for the Govern Compliance Agent.

Run from the fsi_foundry directory:
    cd applications/fsi_foundry
    python -m use_cases.govern_compliance_agent.test_local

Or with explicit PYTHONPATH:
    PYTHONPATH=foundations/src:use_cases/govern_compliance_agent/src python use_cases/govern_compliance_agent/test_local.py
"""

import asyncio
import json
import os
import sys

# Add paths for local imports
script_dir = os.path.dirname(os.path.abspath(__file__))
fsi_foundry_dir = os.path.dirname(os.path.dirname(script_dir))
sys.path.insert(0, os.path.join(fsi_foundry_dir, "foundations", "src"))
sys.path.insert(0, os.path.join(script_dir, "src"))

# Set local mode for graceful degradation
os.environ.setdefault("LOCAL_MODE", "true")
os.environ.setdefault("AWS_REGION", "us-east-1")


async def test_individual_tools():
    """Test the tools individually."""
    print("\n" + "="*60)
    print("Testing Individual Tools")
    print("="*60)

    # Test AgentCore tools
    print("\n--- Testing AgentCore Tools ---")
    try:
        from langchain_langgraph.tools.agentcore_tools import (
            list_agents_tool,
            get_agent_posture_tool,
            get_agent_metrics_tool,
        )

        print("\n1. list_agents_tool:")
        result = list_agents_tool.invoke({"region": "us-east-1"})
        data = json.loads(result)
        print(f"   Live: {data.get('live')}, Total agents: {data.get('total')}")
        if data.get('agents'):
            for a in data['agents'][:3]:
                print(f"   - {a.get('name')} ({a.get('platform')}): {a.get('status')}")

        print("\n2. get_agent_posture_tool:")
        result = get_agent_posture_tool.invoke({"region": "us-east-1"})
        data = json.loads(result)
        print(f"   Live: {data.get('live')}")
        for cat in data.get('categories', [])[:3]:
            print(f"   - {cat.get('label')}: {cat.get('total')} total, {cat.get('ready')} ready")

        print("\n3. get_agent_metrics_tool:")
        result = get_agent_metrics_tool.invoke({"region": "us-east-1", "days": 7})
        data = json.loads(result)
        print(f"   Live: {data.get('live')}, Agents with traffic: {len(data.get('by_agent', []))}")

    except Exception as e:
        print(f"   Error: {e}")

    # Test Security tools
    print("\n--- Testing Security Tools ---")
    try:
        from langchain_langgraph.tools.security_tools import (
            get_guardduty_findings_tool,
            get_security_hub_inventory_tool,
        )

        print("\n4. get_guardduty_findings_tool:")
        result = get_guardduty_findings_tool.invoke({"region": "us-east-1", "limit": 10})
        data = json.loads(result)
        print(f"   Live: {data.get('live')}, Total findings: {data.get('total')}")
        print(f"   Note: {data.get('note')}")

        print("\n5. get_security_hub_inventory_tool:")
        result = get_security_hub_inventory_tool.invoke({"region": "us-east-1"})
        data = json.loads(result)
        print(f"   Live: {data.get('live')}, Total AI assets: {data.get('total')}")
        print(f"   Bedrock models: {data.get('bedrock_models')}, agents: {data.get('bedrock_agents')}, guardrails: {data.get('bedrock_guardrails')}")

    except Exception as e:
        print(f"   Error: {e}")

    # Test Guardrail tools
    print("\n--- Testing Guardrail Tools ---")
    try:
        from langchain_langgraph.tools.guardrail_tools import list_guardrails_tool

        print("\n6. list_guardrails_tool:")
        result = list_guardrails_tool.invoke({"region": "us-east-1"})
        data = json.loads(result)
        print(f"   Live: {data.get('live')}, Total guardrails: {data.get('total')}, Active: {data.get('active')}")
        for gr in data.get('guardrails', [])[:3]:
            print(f"   - {gr.get('name')} ({gr.get('status')})")

    except Exception as e:
        print(f"   Error: {e}")


async def test_policy_auditor():
    """Test the PolicyAuditor agent."""
    print("\n" + "="*60)
    print("Testing PolicyAuditor Agent")
    print("="*60)

    try:
        from langchain_langgraph.agents.policy_auditor import audit_policies

        print("\nRunning policy audit...")
        result = await audit_policies()
        print(f"\nAgent: {result.get('agent')}")
        analysis = result.get('analysis', '')[:2000]
        # Handle Windows console encoding issues with emojis
        print(f"\nAnalysis:\n{analysis.encode('ascii', 'replace').decode('ascii')}")

    except Exception as e:
        print(f"Error: {e}")
        import traceback
        traceback.print_exc()


async def test_security_scanner():
    """Test the SecurityScanner agent."""
    print("\n" + "="*60)
    print("Testing SecurityScanner Agent")
    print("="*60)

    try:
        from langchain_langgraph.agents.security_scanner import scan_security

        print("\nRunning security scan...")
        result = await scan_security(region="us-east-1")
        print(f"\nAgent: {result.get('agent')}")
        print(f"Region: {result.get('region')}")
        print(f"\nAnalysis:\n{result.get('analysis', '')[:2000]}")

    except Exception as e:
        print(f"Error: {e}")
        import traceback
        traceback.print_exc()


async def test_full_audit():
    """Test the full compliance audit orchestrator."""
    print("\n" + "="*60)
    print("Testing Full Compliance Audit")
    print("="*60)

    try:
        from langchain_langgraph.orchestrator import run_compliance_audit
        from langchain_langgraph.models import ComplianceAuditRequest

        request = ComplianceAuditRequest(
            scope="all",
            include_remediation=True,
            auto_remediate=False,
            dry_run=True,
        )

        print(f"\nRunning audit with scope: {request.scope}")
        print(f"Include remediation: {request.include_remediation}")
        print(f"Auto remediate: {request.auto_remediate}")

        result = await run_compliance_audit(request)

        print(f"\n--- Audit Results ---")
        print(f"Audit ID: {result.audit_id}")
        print(f"Violations found: {result.violations_found}")
        print(f"  Critical: {result.critical_count}")
        print(f"  High: {result.high_count}")
        print(f"  Medium: {result.medium_count}")
        print(f"  Low: {result.low_count}")
        print(f"\nSummary: {result.summary[:500] if result.summary else 'N/A'}")
        print(f"\nRecommendations:")
        for rec in result.recommendations[:5]:
            print(f"  - {rec}")

    except Exception as e:
        print(f"Error: {e}")
        import traceback
        traceback.print_exc()


async def main():
    """Run all tests."""
    print("="*60)
    print("Govern Compliance Agent - Local Test")
    print("="*60)
    print(f"\nAWS Region: {os.environ.get('AWS_REGION', 'us-east-1')}")
    print(f"Local Mode: {os.environ.get('LOCAL_MODE', 'false')}")

    # Test 1: Individual tools
    await test_individual_tools()

    # Test 2: Single agent (PolicyAuditor)
    await test_policy_auditor()

    # Test 3: Single agent (SecurityScanner)
    # Uncomment to test:
    # await test_security_scanner()

    # Test 4: Full orchestrator
    # Uncomment to test:
    # await test_full_audit()

    print("\n" + "="*60)
    print("Tests Complete")
    print("="*60)


if __name__ == "__main__":
    asyncio.run(main())
