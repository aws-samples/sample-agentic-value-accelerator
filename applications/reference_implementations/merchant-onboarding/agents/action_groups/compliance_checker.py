"""
Compliance Checker Action Group
Handles OFAC sanctions screening + fraud risk assessment.
"""

import json
import boto3
import os
import urllib.request

AWS_REGION = os.environ.get("AWS_REGION", "us-east-2")
SANCTIONS_API_URL = os.environ.get("SANCTIONS_API_URL", "https://api.sanctions.network/v1/check")
SANCTIONS_API_KEY = os.environ.get("SANCTIONS_API_KEY", "")

bedrock = boto3.client("bedrock-runtime", region_name=AWS_REGION)


def check_sanctions(business_name: str, merchant_id: str) -> dict:
    """Screen business name against OFAC/sanctions lists."""
    if not SANCTIONS_API_KEY:
        return {
            "screened": False,
            "warning": "SANCTIONS_API_KEY not configured — using mock response",
            "hits": [],
            "riskLevel": "UNKNOWN",
        }
    try:
        payload  = json.dumps({"name": business_name, "types": ["entity"]}).encode()
        req      = urllib.request.Request(
            SANCTIONS_API_URL,
            data=payload,
            headers={"Content-Type": "application/json", "Authorization": f"Bearer {SANCTIONS_API_KEY}"},
            method="POST",
        )
        with urllib.request.urlopen(req, timeout=10) as resp:
            data = json.loads(resp.read())
        hits = data.get("hits", [])
        return {
            "screened": True,
            "hits": hits,
            "hitCount": len(hits),
            "riskLevel": "HIGH" if hits else "LOW",
        }
    except Exception as exc:
        return {"screened": False, "error": str(exc), "riskLevel": "UNKNOWN"}


def assess_fraud_risk(merchant_data: dict) -> dict:
    """Use Claude to assess fraud risk from merchant profile."""
    prompt = f"""You are a fraud risk analyst reviewing a merchant onboarding application.

Merchant Data:
{json.dumps(merchant_data, indent=2)}

Assess fraud risk and provide:
1. Overall Risk Score (0-100, where 100 = highest risk)
2. Risk Level (LOW / MEDIUM / HIGH / CRITICAL)
3. Risk Factors identified
4. Recommended Due Diligence steps
5. Decision Recommendation (APPROVE / MANUAL_REVIEW / REJECT)

Respond in JSON format with keys: riskScore, riskLevel, riskFactors, dueDiligence, recommendation."""

    body = {
        "anthropic_version": "bedrock-2023-05-31",
        "max_tokens": 1024,
        "messages": [{"role": "user", "content": prompt}],
    }
    try:
        response = bedrock.invoke_model(
            modelId="us.anthropic.claude-sonnet-4-20250514-v1:0",
            body=json.dumps(body),
        )
        result = json.loads(response["body"].read())
        raw = result["content"][0]["text"]
        try:
            return {"success": True, "assessment": json.loads(raw)}
        except json.JSONDecodeError:
            return {"success": True, "assessment": {"raw": raw, "riskLevel": "MEDIUM", "riskScore": 50}}
    except Exception as exc:
        return {"success": False, "error": str(exc)}


def validate_compliance(merchant_id: str, sanctions_result: dict, fraud_result: dict) -> dict:
    """Consolidate sanctions + fraud results into a compliance decision."""
    sanctions_risk = sanctions_result.get("riskLevel", "UNKNOWN")
    fraud_risk     = fraud_result.get("assessment", {}).get("riskLevel", "UNKNOWN")
    fraud_score    = fraud_result.get("assessment", {}).get("riskScore", 50)
    hits           = sanctions_result.get("hits", [])

    if hits or sanctions_risk == "HIGH" or fraud_risk in ("HIGH", "CRITICAL") or fraud_score > 75:
        decision = "REJECT"
        status   = "FAILED"
    elif fraud_risk == "MEDIUM" or fraud_score > 40:
        decision = "MANUAL_REVIEW"
        status   = "NEEDS_REVIEW"
    else:
        decision = "APPROVE"
        status   = "PASSED"

    return {
        "merchantId": merchant_id,
        "complianceStatus": status,
        "decision": decision,
        "sanctionsRisk": sanctions_risk,
        "fraudRisk": fraud_risk,
        "fraudScore": fraud_score,
        "sanctionsHits": len(hits),
    }


def lambda_handler(event, context):
    """Bedrock Agent action group handler for compliance checks."""
    action_group = event.get("actionGroup", "")
    api_path     = event.get("apiPath", "")
    parameters   = {p["name"]: p["value"] for p in event.get("parameters", [])}
    body_params  = {}
    if event.get("requestBody"):
        for content in event["requestBody"].get("content", {}).values():
            for prop in content.get("properties", []):
                body_params[prop["name"]] = prop["value"]
    params = {**parameters, **body_params}

    if api_path == "/check-sanctions":
        result = check_sanctions(params.get("businessName", ""), params.get("merchantId", ""))
    elif api_path == "/assess-fraud-risk":
        merchant_data = json.loads(params.get("merchantData", "{}"))
        result = assess_fraud_risk(merchant_data)
    elif api_path == "/validate-compliance":
        result = validate_compliance(
            params.get("merchantId", ""),
            json.loads(params.get("sanctionsResult", "{}")),
            json.loads(params.get("fraudResult", "{}")),
        )
    else:
        result = {"error": f"Unknown api_path: {api_path}"}

    return {
        "messageVersion": "1.0",
        "response": {
            "actionGroup": action_group,
            "apiPath": api_path,
            "httpMethod": event.get("httpMethod", "POST"),
            "httpStatusCode": 200,
            "responseBody": {"application/json": {"body": json.dumps(result)}},
        },
    }
