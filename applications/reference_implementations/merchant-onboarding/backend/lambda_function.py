"""
Merchant Onboarding - Lambda API Handler
REST API for merchant lifecycle: registration, document upload, review, approval.
"""

import json
import uuid
import boto3
import os
import base64
from datetime import datetime
from decimal import Decimal
from boto3.dynamodb.conditions import Key

CUSTOMERS_TABLE = os.environ.get("CUSTOMERS_TABLE", "merchant-onboarding-customers")
DOCUMENTS_TABLE = os.environ.get("DOCUMENTS_TABLE", "merchant-onboarding-documents")
WORKFLOW_TABLE  = os.environ.get("WORKFLOW_TABLE",  "merchant-onboarding-workflow")
DOCUMENTS_BUCKET = os.environ.get("DOCUMENTS_BUCKET", "merchant-onboarding-docs")
BEDROCK_AGENT_ID = os.environ.get("BEDROCK_AGENT_ID", "")
BEDROCK_AGENT_ALIAS = os.environ.get("BEDROCK_AGENT_ALIAS", "TSTALIASID")
AWS_REGION = os.environ.get("AWS_REGION", "us-east-2")

dynamodb = boto3.resource("dynamodb", region_name=AWS_REGION)
s3 = boto3.client("s3", region_name=AWS_REGION)
bedrock_agent = boto3.client("bedrock-agent-runtime", region_name=AWS_REGION)

CORS_HEADERS = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization, x-document-type, x-filename",
}


class DecimalEncoder(json.JSONEncoder):
    def default(self, obj):
        if isinstance(obj, Decimal):
            return float(obj)
        return super().default(obj)


def respond(status_code: int, body: dict) -> dict:
    return {
        "statusCode": status_code,
        "headers": {**CORS_HEADERS, "Content-Type": "application/json"},
        "body": json.dumps(body, cls=DecimalEncoder),
    }


# ---------------------------------------------------------------------------
# Merchant (customer) operations
# ---------------------------------------------------------------------------

def create_merchant(body: dict) -> dict:
    table = dynamodb.Table(CUSTOMERS_TABLE)
    merchant_id = str(uuid.uuid4())
    now = datetime.utcnow().isoformat()
    item = {
        "customerId": merchant_id,
        "businessName": body.get("businessName", ""),
        "contactEmail": body.get("contactEmail", ""),
        "contactPhone": body.get("contactPhone", ""),
        "businessType": body.get("businessType", ""),
        "taxId": body.get("taxId", ""),
        "website": body.get("website", ""),
        "status": "PENDING_DOCUMENTS",
        "workflowStage": 1,
        "createdAt": now,
        "updatedAt": now,
        "riskScore": None,
        "complianceStatus": None,
    }
    table.put_item(Item=item)
    # Initialise workflow record
    wf_table = dynamodb.Table(WORKFLOW_TABLE)
    wf_table.put_item(Item={
        "customerId": merchant_id,
        "stage": 1,
        "stageName": "Document Collection",
        "status": "IN_PROGRESS",
        "createdAt": now,
        "updatedAt": now,
        "approvals": [],
        "notes": [],
    })
    return respond(201, {"merchantId": merchant_id, "status": "PENDING_DOCUMENTS"})


def list_merchants() -> dict:
    table = dynamodb.Table(CUSTOMERS_TABLE)
    result = table.scan()
    items = sorted(result.get("Items", []), key=lambda x: x.get("createdAt", ""), reverse=True)
    return respond(200, {"merchants": items})


def get_merchant(merchant_id: str) -> dict:
    table = dynamodb.Table(CUSTOMERS_TABLE)
    result = table.get_item(Key={"customerId": merchant_id})
    item = result.get("Item")
    if not item:
        return respond(404, {"error": "Merchant not found"})
    # Attach documents
    doc_table = dynamodb.Table(DOCUMENTS_TABLE)
    docs = doc_table.query(KeyConditionExpression=Key("customerId").eq(merchant_id))
    item["documents"] = docs.get("Items", [])
    # Attach workflow
    wf_table = dynamodb.Table(WORKFLOW_TABLE)
    wf = wf_table.get_item(Key={"customerId": merchant_id})
    item["workflow"] = wf.get("Item", {})
    return respond(200, item)


def update_merchant_status(merchant_id: str, body: dict) -> dict:
    table = dynamodb.Table(CUSTOMERS_TABLE)
    now = datetime.utcnow().isoformat()
    update_expr = "SET #s = :s, updatedAt = :u"
    expr_names  = {"#s": "status"}
    expr_values = {":s": body["status"], ":u": now}
    if "workflowStage" in body:
        update_expr += ", workflowStage = :ws"
        expr_values[":ws"] = body["workflowStage"]
    if "riskScore" in body:
        update_expr += ", riskScore = :rs"
        expr_values[":rs"] = Decimal(str(body["riskScore"]))
    if "complianceStatus" in body:
        update_expr += ", complianceStatus = :cs"
        expr_values[":cs"] = body["complianceStatus"]
    table.update_item(
        Key={"customerId": merchant_id},
        UpdateExpression=update_expr,
        ExpressionAttributeNames=expr_names,
        ExpressionAttributeValues=expr_values,
    )
    return respond(200, {"merchantId": merchant_id, "status": body["status"]})


# ---------------------------------------------------------------------------
# Document operations
# ---------------------------------------------------------------------------

def upload_document(merchant_id: str, event: dict) -> dict:
    doc_type = event.get("headers", {}).get("x-document-type", "OTHER")
    filename  = event.get("headers", {}).get("x-filename", f"{uuid.uuid4()}.pdf")
    body_b64  = event.get("body", "")
    is_b64    = event.get("isBase64Encoded", False)

    raw = base64.b64decode(body_b64) if is_b64 else body_b64.encode()
    doc_id  = str(uuid.uuid4())
    s3_key  = f"documents/{merchant_id}/{doc_id}/{filename}"
    now = datetime.utcnow().isoformat()

    s3.put_object(Bucket=DOCUMENTS_BUCKET, Key=s3_key, Body=raw,
                  ContentType="application/pdf")

    doc_table = dynamodb.Table(DOCUMENTS_TABLE)
    doc_table.put_item(Item={
        "customerId": merchant_id,
        "documentId": doc_id,
        "documentType": doc_type,
        "filename": filename,
        "s3Key": s3_key,
        "status": "UPLOADED",
        "uploadedAt": now,
        "analysisResult": None,
    })
    return respond(201, {"documentId": doc_id, "status": "UPLOADED", "s3Key": s3_key})


def list_documents(merchant_id: str) -> dict:
    doc_table = dynamodb.Table(DOCUMENTS_TABLE)
    result = doc_table.query(KeyConditionExpression=Key("customerId").eq(merchant_id))
    return respond(200, {"documents": result.get("Items", [])})


# ---------------------------------------------------------------------------
# Bedrock Agent invocation
# ---------------------------------------------------------------------------

def invoke_agent(merchant_id: str, action: str, payload: dict) -> dict:
    """Invoke the Bedrock onboarding agent for document analysis or compliance check."""
    if not BEDROCK_AGENT_ID:
        return respond(503, {"error": "Bedrock agent not configured"})

    prompt = _build_agent_prompt(action, merchant_id, payload)
    try:
        response = bedrock_agent.invoke_agent(
            agentId=BEDROCK_AGENT_ID,
            agentAliasId=BEDROCK_AGENT_ALIAS,
            sessionId=f"{merchant_id}-{action}",
            inputText=prompt,
        )
        output = ""
        for event in response.get("completion", []):
            chunk = event.get("chunk", {})
            if "bytes" in chunk:
                output += chunk["bytes"].decode("utf-8")

        return respond(200, {"agentResponse": output, "merchantId": merchant_id, "action": action})
    except Exception as exc:
        return respond(500, {"error": str(exc)})


def _build_agent_prompt(action: str, merchant_id: str, payload: dict) -> str:
    if action == "analyze_documents":
        return (
            f"Analyze the uploaded documents for merchant {merchant_id}. "
            f"Extract business information, verify document authenticity, "
            f"and identify any missing or incomplete documents. "
            f"Merchant details: {json.dumps(payload)}"
        )
    if action == "compliance_check":
        return (
            f"Perform a full compliance check for merchant {merchant_id}. "
            f"Run OFAC sanctions screening, assess fraud risk, "
            f"and validate regulatory compliance. "
            f"Merchant details: {json.dumps(payload)}"
        )
    if action == "provision_account":
        return (
            f"Provision a merchant account for {merchant_id}. "
            f"Generate merchant ID, set up payment rails access, "
            f"configure transaction limits, and prepare welcome package. "
            f"Merchant details: {json.dumps(payload)}"
        )
    return f"Process merchant {merchant_id} with action: {action}. Details: {json.dumps(payload)}"


# ---------------------------------------------------------------------------
# Approval workflow
# ---------------------------------------------------------------------------

def submit_approval(merchant_id: str, body: dict) -> dict:
    wf_table = dynamodb.Table(WORKFLOW_TABLE)
    now = datetime.utcnow().isoformat()
    approval = {
        "approver": body.get("approver", "system"),
        "decision": body.get("decision"),  # APPROVED | REJECTED
        "notes": body.get("notes", ""),
        "timestamp": now,
        "stage": body.get("stage", 1),
    }
    wf = wf_table.get_item(Key={"customerId": merchant_id}).get("Item", {})
    approvals = wf.get("approvals", [])
    approvals.append(approval)

    next_stage, next_status = _advance_workflow(
        current_stage=wf.get("stage", 1),
        decision=approval["decision"],
    )
    wf_table.update_item(
        Key={"customerId": merchant_id},
        UpdateExpression="SET approvals = :a, #st = :s, stage = :sg, updatedAt = :u",
        ExpressionAttributeNames={"#st": "status"},
        ExpressionAttributeValues={
            ":a": approvals,
            ":s": next_status,
            ":sg": next_stage,
            ":u": now,
        },
    )
    # Mirror to customers table
    update_merchant_status(merchant_id, {"status": _workflow_stage_to_merchant_status(next_stage, next_status)})
    return respond(200, {"merchantId": merchant_id, "stage": next_stage, "status": next_status})


def _advance_workflow(current_stage: int, decision: str):
    if decision == "REJECTED":
        return current_stage, "REJECTED"
    stage_map = {
        1: (2, "PENDING_COMPLIANCE"),   # Doc review → compliance
        2: (3, "PENDING_PROVISIONING"), # Compliance → account provisioning
        3: (4, "PENDING_ACTIVATION"),   # Provisioning → final activation
        4: (4, "ACTIVE"),               # Final approval → active
    }
    return stage_map.get(current_stage, (current_stage, "COMPLETED"))


def _workflow_stage_to_merchant_status(stage: int, wf_status: str) -> str:
    if wf_status == "REJECTED":
        return "REJECTED"
    mapping = {
        1: "PENDING_DOCUMENTS",
        2: "PENDING_COMPLIANCE",
        3: "PENDING_PROVISIONING",
        4: "ACTIVE" if wf_status == "ACTIVE" else "PENDING_ACTIVATION",
    }
    return mapping.get(stage, "PENDING_DOCUMENTS")


# ---------------------------------------------------------------------------
# Router
# ---------------------------------------------------------------------------

def lambda_handler(event, context):
    method = event.get("httpMethod", "GET")
    path   = event.get("path", "/")

    if method == "OPTIONS":
        return {"statusCode": 200, "headers": CORS_HEADERS, "body": ""}

    try:
        parts = [p for p in path.strip("/").split("/") if p]

        # POST /merchants
        if method == "POST" and parts == ["merchants"]:
            return create_merchant(json.loads(event.get("body") or "{}"))

        # GET /merchants
        if method == "GET" and parts == ["merchants"]:
            return list_merchants()

        # GET /merchants/{id}
        if method == "GET" and len(parts) == 2 and parts[0] == "merchants":
            return get_merchant(parts[1])

        # PUT /merchants/{id}/status
        if method == "PUT" and len(parts) == 3 and parts[0] == "merchants" and parts[2] == "status":
            return update_merchant_status(parts[1], json.loads(event.get("body") or "{}"))

        # POST /merchants/{id}/documents
        if method == "POST" and len(parts) == 3 and parts[0] == "merchants" and parts[2] == "documents":
            return upload_document(parts[1], event)

        # GET /merchants/{id}/documents
        if method == "GET" and len(parts) == 3 and parts[0] == "merchants" and parts[2] == "documents":
            return list_documents(parts[1])

        # POST /merchants/{id}/agent/{action}
        if method == "POST" and len(parts) == 4 and parts[0] == "merchants" and parts[2] == "agent":
            return invoke_agent(parts[1], parts[3], json.loads(event.get("body") or "{}"))

        # POST /merchants/{id}/approvals
        if method == "POST" and len(parts) == 3 and parts[0] == "merchants" and parts[2] == "approvals":
            return submit_approval(parts[1], json.loads(event.get("body") or "{}"))

        return respond(404, {"error": f"Route not found: {method} {path}"})

    except Exception as exc:
        return respond(500, {"error": str(exc)})
