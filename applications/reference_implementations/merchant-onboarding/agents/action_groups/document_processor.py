"""
Document Processor Action Group
Handles Textract OCR + Claude document analysis for the Bedrock Agent.
"""

import json
import boto3
import os

AWS_REGION = os.environ.get("AWS_REGION", "us-east-2")
DOCUMENTS_BUCKET = os.environ.get("DOCUMENTS_BUCKET", "merchant-onboarding-docs")

textract = boto3.client("textract", region_name=AWS_REGION)
bedrock  = boto3.client("bedrock-runtime", region_name=AWS_REGION)
s3       = boto3.client("s3", region_name=AWS_REGION)


def extract_text_with_textract(s3_key: str) -> dict:
    """Run Textract on a document stored in S3."""
    try:
        response = textract.detect_document_text(
            Document={"S3Object": {"Bucket": DOCUMENTS_BUCKET, "Name": s3_key}}
        )
        blocks = response.get("Blocks", [])
        lines  = [b["Text"] for b in blocks if b["BlockType"] == "LINE"]
        return {"success": True, "text": "\n".join(lines), "blockCount": len(blocks)}
    except Exception as exc:
        return {"success": False, "error": str(exc)}


def analyze_document(text: str, document_type: str, merchant_id: str) -> dict:
    """Use Claude to analyze extracted document text."""
    prompt = f"""You are a merchant onboarding specialist reviewing a {document_type} document.

Extracted text:
{text[:4000]}

Merchant ID: {merchant_id}

Analyze this document and provide:
1. Document validity (VALID / INVALID / INCOMPLETE)
2. Key extracted fields (business name, registration number, date, address, etc.)
3. Any concerns or red flags
4. Completeness score (0-100)
5. Recommended next steps

Respond in JSON format."""

    body = {
        "anthropic_version": "bedrock-2023-05-31",
        "max_tokens": 1024,
        "messages": [{"role": "user", "content": prompt}],
    }
    try:
        response = bedrock.invoke_model(
            modelId="us.anthropic.claude-sonnet-4-5-20250929-v1:0",
            body=json.dumps(body),
        )
        result = json.loads(response["body"].read())
        raw = result["content"][0]["text"]
        # Try to parse as JSON; fall back to wrapping in a dict
        try:
            return {"success": True, "analysis": json.loads(raw)}
        except json.JSONDecodeError:
            return {"success": True, "analysis": {"raw": raw}}
    except Exception as exc:
        return {"success": False, "error": str(exc)}


def validate_document_type(filename: str) -> dict:
    """Validate that filename indicates a supported document type."""
    supported = {
        "business_license": ["license", "registration", "certificate"],
        "bank_statement":   ["bank", "statement", "account"],
        "tax_document":     ["tax", "ein", "tin", "w9", "w-9"],
        "identity":         ["passport", "id", "driver", "license"],
        "utility_bill":     ["utility", "bill", "invoice"],
    }
    fn_lower = filename.lower()
    for doc_type, keywords in supported.items():
        if any(kw in fn_lower for kw in keywords):
            return {"valid": True, "detectedType": doc_type}
    return {
        "valid": True,
        "detectedType": "general",
        "warning": "Could not auto-detect document type from filename",
    }


def lambda_handler(event, context):
    """Bedrock Agent action group handler for document processing."""
    action_group = event.get("actionGroup", "")
    api_path     = event.get("apiPath", "")
    parameters   = {p["name"]: p["value"] for p in event.get("parameters", [])}
    body_params  = {}
    if event.get("requestBody"):
        for content in event["requestBody"].get("content", {}).values():
            for prop in content.get("properties", []):
                body_params[prop["name"]] = prop["value"]

    params = {**parameters, **body_params}

    if api_path == "/extract-text":
        result = extract_text_with_textract(params.get("s3Key", ""))
    elif api_path == "/analyze-document":
        result = analyze_document(
            params.get("text", ""),
            params.get("documentType", "general"),
            params.get("merchantId", ""),
        )
    elif api_path == "/validate-document-type":
        result = validate_document_type(params.get("filename", ""))
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
