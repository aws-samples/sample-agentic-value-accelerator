"""
Lambda function for Alert Investigation Summary Management via AgentCore Gateway
Provides tools for saving and retrieving investigation summaries

Note: This Lambda is invoked by AgentCore Gateway which handles the MCP protocol.
The Lambda just needs to return simple tool results.
"""

import json
import os
import boto3
from datetime import datetime
from decimal import Decimal
from typing import Dict, Any, List


def convert_floats_to_decimal(obj: Any) -> Any:
    """
    Recursively convert all float values to Decimal for DynamoDB compatibility.
    
    Args:
        obj: Object to convert (can be dict, list, float, or any other type)
    
    Returns:
        Object with all floats converted to Decimal
    """
    if isinstance(obj, float):
        return Decimal(str(obj))
    elif isinstance(obj, dict):
        return {k: convert_floats_to_decimal(v) for k, v in obj.items()}
    elif isinstance(obj, list):
        return [convert_floats_to_decimal(item) for item in obj]
    else:
        return obj


# Initialize DynamoDB client
dynamodb = boto3.resource('dynamodb')

# Get table name from environment variable
SUMMARIES_TABLE = os.environ.get('SUMMARIES_TABLE')

# Initialize table
summaries_table = dynamodb.Table(SUMMARIES_TABLE) if SUMMARIES_TABLE else None


class DecimalEncoder(json.JSONEncoder):
    """Helper class to convert DynamoDB Decimal types to JSON"""
    def default(self, obj):
        if isinstance(obj, Decimal):
            return int(obj) if obj % 1 == 0 else float(obj)
        return super(DecimalEncoder, self).default(obj)


def get_latest_summary(alertId: str) -> Dict[str, Any]:
    """
    Retrieve the latest investigation summary for an alert.
    Queries all summaries for the alert and returns the one with the most recent generatedAt.
    
    Args:
        alertId: The unique identifier of the alert
    
    Returns:
        Dictionary containing the summary or error
    """
    
    if not summaries_table:
        return {
            "error": "Summaries table not configured",
            "alertId": alertId
        }
    
    if not alertId:
        return {"error": "alertId is required"}
    
    try:
        print(f"[MCP Tool] get_latest_summary called for alertId: {alertId}")
        
        # Query all summaries for this alert
        # Note: We can't use ScanIndexForward since SK is investigation_id (UUID), not timestamp
        # We need to fetch all and sort by generatedAt attribute
        result = summaries_table.query(
            KeyConditionExpression='PK = :pk',
            ExpressionAttributeValues={
                ':pk': alertId
            }
        )
        
        items = result.get('Items', [])
        
        if not items:
            print(f"[MCP Tool] No summary found for alertId: {alertId}")
            return {
                "alertId": alertId,
                "found": False,
                "message": "No previous investigation summary found for this alert. This appears to be the first investigation."
            }
        
        # Sort by generatedAt to get the latest (most recent timestamp)
        sorted_items = sorted(items, key=lambda x: x.get('generatedAt', ''), reverse=True)
        summary = sorted_items[0]
        
        print(f"[MCP Tool] Found summary for alertId: {alertId}, investigationId: {summary.get('investigationId', 'N/A')}, version: {summary.get('version', 1)}")
        
        # Format response - convert Decimals to native types
        response_data = {
            "alertId": alertId,
            "found": True,
            "summaryText": summary.get('summaryText', ''),
            "findings": summary.get('findings', []),
            "recommendations": summary.get('recommendations', []),
            "generatedAt": summary.get('generatedAt', ''),
            "generatedBy": summary.get('generatedBy', 'unknown'),
            "version": int(summary.get('version', 1)),
            "investigationId": summary.get('investigationId', ''),
            "asyncAuditTrail": summary.get('asyncAuditTrail', [])
        }
        
        return response_data
    
    except Exception as e:
        print(f"[MCP Tool] Error retrieving summary: {str(e)}")
        import traceback
        traceback.print_exc()
        return {
            "error": f"Failed to retrieve summary: {str(e)}",
            "alertId": alertId
        }


def save_summary(
    alertId: str,
    investigationId: str,
    summaryText: str,
    findings: List[str],
    recommendations: List[str],
    asyncAuditTrail: List[Dict[str, Any]] = None,
    generatedBy: str = "async-agent",
    version: int = 1,
    status: str = "completed"
) -> Dict[str, Any]:
    """
    Save a comprehensive investigation summary for an alert.
    
    This function handles both new summaries and updates to existing pending summaries.
    The investigationId is used as the Sort Key for stable, unique identification.
    
    Args:
        alertId: The unique identifier of the alert (REQUIRED)
        investigationId: Investigation identifier used as SK (REQUIRED)
        summaryText: Comprehensive narrative summary (REQUIRED)
        findings: Array of specific findings (REQUIRED)
        recommendations: Array of actionable recommendations (REQUIRED)
        asyncAuditTrail: Complete audit trail (optional)
        generatedBy: Generator identifier (optional, default: "async-agent")
        version: Summary version (optional, default: 1)
        status: Summary status (optional, default: "completed")
    
    Returns:
        Dictionary confirming success or error
    """
    
    if not summaries_table:
        return {
            "error": "Summaries table not configured",
            "alertId": alertId
        }
    
    # Validate required fields
    if not alertId:
        return {"error": "alertId is required"}
    if not investigationId:
        return {"error": "investigationId is required"}
    if not summaryText:
        return {"error": "summaryText is required"}
    if not findings or not isinstance(findings, list):
        return {"error": "findings must be a non-empty array"}
    if not recommendations or not isinstance(recommendations, list):
        return {"error": "recommendations must be a non-empty array"}
    
    try:
        print(f"[MCP Tool] save_summary called for alertId: {alertId}")
        print(f"[MCP Tool] Investigation ID (SK): {investigationId}")
        print(f"[MCP Tool] Status: {status}")
        print(f"[MCP Tool] Summary text length: {len(summaryText)} chars")
        print(f"[MCP Tool] Findings count: {len(findings)}")
        print(f"[MCP Tool] Recommendations count: {len(recommendations)}")
        
        # Check if we're updating an existing pending summary
        update_existing = False
        existing_item = None
        try:
            existing = summaries_table.get_item(
                Key={
                    'PK': alertId,
                    'SK': investigationId
                }
            )
            if 'Item' in existing:
                existing_item = existing['Item']
                if existing_item.get('status') == 'pending':
                    update_existing = True
                    print(f"[MCP Tool] Updating existing pending summary")
                else:
                    print(f"[MCP Tool] WARNING: Summary already exists with status: {existing_item.get('status')}")
        except Exception as check_error:
            print(f"[MCP Tool] Could not check for existing summary: {check_error}")
        
        # Generate timestamp
        current_timestamp = datetime.utcnow().isoformat() + 'Z'
        
        # Build item
        item = {
            'PK': alertId,
            'SK': investigationId,
            'alertId': alertId,
            'investigationId': investigationId,
            'summaryText': summaryText,
            'findings': findings,
            'recommendations': recommendations,
            'generatedAt': current_timestamp,
            'completedAt': current_timestamp,
            'status': status,
            'version': version,
            'generatedBy': generatedBy
        }
        
        # Preserve audit fields from pending summary if updating
        if update_existing and existing_item:
            # Preserve triggeredBy, triggeredAt, triggeredByUser, generatedAt from pending entry
            if 'triggeredBy' in existing_item:
                item['triggeredBy'] = existing_item['triggeredBy']
            if 'triggeredAt' in existing_item:
                item['triggeredAt'] = existing_item['triggeredAt']
            if 'triggeredByUser' in existing_item:
                item['triggeredByUser'] = existing_item['triggeredByUser']
                print(f"[MCP Tool] Preserving triggeredByUser: {existing_item['triggeredByUser']}")
            if 'generatedAt' in existing_item:
                item['generatedAt'] = existing_item['generatedAt']
                print(f"[MCP Tool] Preserving original generatedAt: {existing_item['generatedAt']}")
        
        # Add async audit trail if provided
        if asyncAuditTrail:
            # Convert any float values to Decimal for DynamoDB compatibility
            item['asyncAuditTrail'] = convert_floats_to_decimal(asyncAuditTrail)
            print(f"[MCP Tool] Audit trail entries: {len(asyncAuditTrail)}")
        
        # Add TTL (7 years from now for regulatory compliance)
        ttl_seconds = int(datetime.utcnow().timestamp()) + (7 * 365 * 24 * 60 * 60)
        item['ttl'] = ttl_seconds
        
        # Convert the entire item to ensure no floats remain
        item = convert_floats_to_decimal(item)
        
        # Save to DynamoDB
        summaries_table.put_item(Item=item)
        
        if update_existing:
            print(f"[MCP Tool] Pending summary updated to completed for alertId: {alertId}, investigationId: {investigationId}")
        else:
            print(f"[MCP Tool] New summary saved successfully for alertId: {alertId}, investigationId: {investigationId}")
        
        return {
            "success": True,
            "message": "Summary saved successfully" if not update_existing else "Summary updated successfully",
            "alertId": alertId,
            "investigationId": investigationId,
            "version": version,
            "status": status
        }
    
    except Exception as e:
        print(f"[MCP Tool] Error saving summary: {str(e)}")
        import traceback
        traceback.print_exc()
        return {
            "error": f"Failed to save summary: {str(e)}",
            "alertId": alertId
        }


def handler(event, context):
    """
    Lambda handler for AgentCore Gateway tool invocations
    
    Event: Map of input properties (e.g., {"alertId": "123"})
    Context: Contains metadata including tool name in context.client_context.custom
    """
    print(f"[Lambda] ===== NEW INVOCATION =====")
    print(f"[Lambda] Event: {json.dumps(event, default=str)}")
    
    try:
        # Extract tool name from context (includes target prefix like "targetName___toolName")
        delimiter = "___"
        original_tool_name = context.client_context.custom.get('bedrockAgentCoreToolName', '')
        
        # Strip target prefix to get actual tool name
        if delimiter in original_tool_name:
            tool_name = original_tool_name[original_tool_name.index(delimiter) + len(delimiter):]
        else:
            tool_name = original_tool_name
        
        print(f"[Lambda] Original tool name: {original_tool_name}")
        print(f"[Lambda] Extracted tool name: {tool_name}")
        print(f"[Lambda] Gateway ID: {context.client_context.custom.get('bedrockAgentCoreGatewayId')}")
        print(f"[Lambda] Target ID: {context.client_context.custom.get('bedrockAgentCoreTargetId')}")
        
        # Event is already the arguments map - use it directly
        arguments = event
        print(f"[Lambda] Arguments: {json.dumps(arguments, default=str)}")
        
        # Route to appropriate tool function
        if tool_name == 'get_latest_summary':
            result = get_latest_summary(**arguments)
        elif tool_name == 'save_summary':
            result = save_summary(**arguments)
        else:
            result = {"error": f"Unknown tool: {tool_name}"}
        
        print(f"[Lambda] Result: {json.dumps(result, cls=DecimalEncoder)}")
        print(f"[Lambda] ===== END INVOCATION =====")
        
        # Return result - Gateway will wrap this in MCP protocol
        return result
        
    except Exception as e:
        error_msg = f"Lambda error: {str(e)}"
        print(f"[Lambda] EXCEPTION: {error_msg}")
        import traceback
        traceback.print_exc()
        return {
            "error": error_msg,
            "traceback": traceback.format_exc()
        }
