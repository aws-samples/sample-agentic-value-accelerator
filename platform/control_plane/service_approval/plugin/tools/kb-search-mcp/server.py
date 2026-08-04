"""
Knowledge Base Search MCP Server

Thin wrapper around Bedrock Retrieve API that exposes organization Knowledge Bases
as MCP tools. Replaces the 5 KB tool functions from the hosted solution.

Usage:
    python3 server.py

Requires: pip install mcp boto3
"""

import json
import logging
import os

import boto3
from mcp.server.fastmcp import FastMCP

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

mcp = FastMCP("kb-search", host="127.0.0.1", port=0)

_client = boto3.client(
    "bedrock-agent-runtime",
    region_name=os.environ.get("AWS_REGION", "us-east-1"),
)

# KB IDs — set via environment variables or hardcode after deployment
KB_MAP = {
    "security_accelerators": os.environ.get("SERVICE_SECURITY_KB_ID", ""),
    "threat_models": os.environ.get("THREAT_MODELS_KB_ID", ""),
    "compliance_frameworks": os.environ.get("ENABLEMENT_GUIDES_KB_ID", ""),
    "customer_requirements": os.environ.get("CUSTOMER_REQUIREMENTS_KB_ID", ""),
    "iam_personas": os.environ.get("IAM_PERSONAS_KB_ID", ""),
}


def _retrieve(kb_id: str, query: str, max_results: int = 5) -> list[dict]:
    """Call Bedrock Retrieve API and return formatted results."""
    try:
        resp = _client.retrieve(
            knowledgeBaseId=kb_id,
            retrievalQuery={"text": query},
            retrievalConfiguration={
                "vectorSearchConfiguration": {"numberOfResults": max_results}
            },
        )
        results = []
        for r in resp.get("retrievalResults", []):
            loc = r.get("location", {})
            source = "unknown"
            if "s3Location" in loc:
                source = loc["s3Location"].get("uri", "unknown")
            results.append(
                {
                    "text": r.get("content", {}).get("text", ""),
                    "source": source,
                    "score": r.get("score", 0),
                }
            )
        return results
    except Exception as e:
        logger.error(f"KB retrieve error: {e}")
        return [{"text": f"Error querying knowledge base: {e}", "source": "error", "score": 0}]


@mcp.tool()
def search_security_accelerators_kb(query: str) -> str:
    """Search the Security Accelerators Knowledge Base for AWS-specific security
    controls, IAM policy templates, SCPs, and approval workflows.

    Args:
        query: What security accelerator information to find.
    """
    kb_id = KB_MAP.get("security_accelerators", "")
    if not kb_id:
        return json.dumps({"note": "Security Accelerators KB not configured", "results": []})
    results = _retrieve(kb_id, query)
    return json.dumps({"source": "KB: Security Accelerators", "results": results}, indent=2)


@mcp.tool()
def search_threat_models_kb(query: str) -> str:
    """Search the Threat Models Knowledge Base for STRIDE analyses, attack vectors,
    risk assessments, and mitigation strategies.

    Args:
        query: What threat model information to find.
    """
    kb_id = KB_MAP.get("threat_models", "")
    if not kb_id:
        return json.dumps({"note": "Threat Models KB not configured", "results": []})
    results = _retrieve(kb_id, query)
    return json.dumps({"source": "KB: Threat Models", "results": results}, indent=2)


@mcp.tool()
def search_compliance_frameworks_kb(query: str) -> str:
    """Search the Compliance Frameworks Knowledge Base for NIST 800-53, SOC2,
    FedRAMP, PCI-DSS control mappings and audit requirements.

    Args:
        query: What compliance framework information to find.
    """
    kb_id = KB_MAP.get("compliance_frameworks", "")
    if not kb_id:
        return json.dumps({"note": "Compliance Frameworks KB not configured", "results": []})
    results = _retrieve(kb_id, query)
    return json.dumps({"source": "KB: Compliance Frameworks", "results": results}, indent=2)


@mcp.tool()
def search_customer_requirements_kb(query: str) -> str:
    """Search the Customer Requirements Knowledge Base for organization-specific
    security questionnaires, standards, and compliance policies.

    Args:
        query: What customer requirements to find.
    """
    kb_id = KB_MAP.get("customer_requirements", "")
    if not kb_id:
        return json.dumps({"note": "Customer Requirements KB not configured", "results": []})
    results = _retrieve(kb_id, query)
    return json.dumps({"source": "KB: Customer Requirements", "results": results}, indent=2)


@mcp.tool()
def search_iam_personas_kb(query: str) -> str:
    """Search the IAM Personas Knowledge Base for persona definitions, RACI matrices,
    persona-to-role mappings, and least-privilege IAM templates.

    Args:
        query: What IAM persona information to find.
    """
    kb_id = KB_MAP.get("iam_personas", "")
    if not kb_id:
        return json.dumps({"note": "IAM Personas KB not configured", "results": []})
    results = _retrieve(kb_id, query)
    return json.dumps({"source": "KB: IAM Personas", "results": results}, indent=2)


if __name__ == "__main__":
    mcp.run(transport="stdio")
