"""
Lambda function for S3 data retrieval via AgentCore Gateway.

Provides MCP tools for retrieving customer data from S3.
Invoked by AgentCore Gateway which handles the MCP protocol.
"""

import json
import os
import boto3
from typing import Any, Dict

# Configuration from environment
S3_BUCKET = os.environ.get('S3_BUCKET_NAME', '')
DATA_PREFIX = os.environ.get('DATA_PREFIX', 'samples/customer_service')
AWS_REGION = os.environ.get('DEPLOY_REGION', os.environ.get('AWS_REGION', 'us-east-1'))

# Initialize S3 client
s3_client = boto3.client('s3', region_name=AWS_REGION)


def s3_retriever(customer_id: str = "", data_type: str = "profile", key: str = "") -> Dict[str, Any]:
    """Retrieve customer data from S3."""
    if data_type == "document":
        if not key:
            return {"error": "data_type='document' requires a non-empty key"}
        resolved_key = key if key.startswith(DATA_PREFIX + "/") else f"{DATA_PREFIX}/{key}"
        return _get_json_object(resolved_key)

    type_to_file = {
        "profile": "profile.json",
        "transactions": "transactions.json",
        "credit_history": "credit_history.json",
        "compliance": "compliance.json",
        "service_history": "service_history.json",
        "products": "products.json",
    }

    if data_type not in type_to_file:
        return {"error": f"Invalid data_type: {data_type}", "valid_options": list(type_to_file.keys())}

    if not customer_id:
        return {"error": f"data_type='{data_type}' requires customer_id"}

    s3_key = f"{DATA_PREFIX}/{customer_id}/{type_to_file[data_type]}"
    return _get_json_object(s3_key)


def _get_json_object(key: str) -> Dict[str, Any]:
    """Retrieve and parse a JSON object from S3."""
    try:
        response = s3_client.get_object(Bucket=S3_BUCKET, Key=key)
        content = response["Body"].read().decode("utf-8")
        return json.loads(content)
    except s3_client.exceptions.NoSuchKey:
        return {"error": "Data not found", "key": key}
    except Exception as e:
        return {"error": str(e), "key": key}


def handler(event, context):
    """
    Lambda handler for AgentCore Gateway tool invocations.

    Event: Map of input properties (e.g., {"customer_id": "CUST001", "data_type": "profile"})
    Context: Contains tool name in context.client_context.custom['bedrockAgentCoreToolName']
    """
    print(f"[Lambda] Event: {json.dumps(event, default=str)}")

    try:
        # Extract tool name (gateway prefixes with target name)
        delimiter = "___"
        original_tool_name = context.client_context.custom.get('bedrockAgentCoreToolName', '')
        tool_name = original_tool_name.split(delimiter)[-1] if delimiter in original_tool_name else original_tool_name

        print(f"[Lambda] Tool: {tool_name}, Gateway: {context.client_context.custom.get('bedrockAgentCoreGatewayId')}")

        if tool_name == 's3_retriever':
            result = s3_retriever(**event)
        else:
            result = {"error": f"Unknown tool: {tool_name}"}

        print(f"[Lambda] Result keys: {list(result.keys()) if isinstance(result, dict) else 'non-dict'}")
        return result

    except Exception as e:
        import traceback
        print(f"[Lambda] ERROR: {str(e)}")
        traceback.print_exc()
        return {"error": str(e)}
