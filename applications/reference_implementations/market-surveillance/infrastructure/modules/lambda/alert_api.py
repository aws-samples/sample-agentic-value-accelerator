"""
Lambda function for Alert Investigation API
Handles CRUD operations for alert conversations and summaries
Also handles triggering asynchronous alert investigations
"""

import json
import os
import boto3
import urllib3
import uuid
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime
from decimal import Decimal
from typing import Dict, Any, List

# Initialize clients
dynamodb = boto3.resource('dynamodb')

# Get table names from environment variables
CONVERSATIONS_TABLE = os.environ.get('CONVERSATIONS_TABLE')
SUMMARIES_TABLE = os.environ.get('SUMMARIES_TABLE')
AWS_REGION = os.environ.get('AWS_REGION', 'us-east-1')
AGENTCORE_RUNTIME_ENDPOINT_SSM_KEY = os.environ.get('AGENTCORE_RUNTIME_ENDPOINT_SSM_KEY')

# AgentCore Runtime endpoint - read from SSM Parameter Store
def get_agentcore_runtime_endpoint():
    """Get AgentCore Runtime endpoint from SSM Parameter Store"""
    if not AGENTCORE_RUNTIME_ENDPOINT_SSM_KEY:
        print("[SSM] AGENTCORE_RUNTIME_ENDPOINT_SSM_KEY not configured")
        return None
    
    try:
        ssm = boto3.client('ssm', region_name=AWS_REGION)
        response = ssm.get_parameter(Name=AGENTCORE_RUNTIME_ENDPOINT_SSM_KEY)
        endpoint = response['Parameter']['Value']
        print(f"[SSM] Retrieved AgentCore Runtime endpoint from {AGENTCORE_RUNTIME_ENDPOINT_SSM_KEY}")
        return endpoint
    except Exception as e:
        print(f"[SSM] Failed to get AgentCore Runtime endpoint from {AGENTCORE_RUNTIME_ENDPOINT_SSM_KEY}: {str(e)}")
        return None

# Initialize tables
conversations_table = dynamodb.Table(CONVERSATIONS_TABLE) if CONVERSATIONS_TABLE else None
summaries_table = dynamodb.Table(SUMMARIES_TABLE) if SUMMARIES_TABLE else None

# HTTP client for AgentCore Runtime invocation
http = urllib3.PoolManager()


class DecimalEncoder(json.JSONEncoder):
    """Helper class to convert DynamoDB Decimal types to JSON"""
    def default(self, obj):
        if isinstance(obj, Decimal):
            return int(obj) if obj % 1 == 0 else float(obj)
        return super(DecimalEncoder, self).default(obj)


def cors_headers():
    """Return CORS headers for API responses"""
    return {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type,Authorization',
        'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE,OPTIONS'
    }


def response(status_code: int, body: Dict[str, Any]) -> Dict[str, Any]:
    """Format API Gateway response"""
    return {
        'statusCode': status_code,
        'headers': cors_headers(),
        'body': json.dumps(body, cls=DecimalEncoder)
    }


def error_response(status_code: int, message: str) -> Dict[str, Any]:
    """Format error response"""
    return response(status_code, {'error': message})


def handler(event: Dict[str, Any], context: Any) -> Dict[str, Any]:
    """
    Main Lambda handler for Alert Investigation API
    
    Routes:
    - GET /conversations/{alertId}/{userId} - Get all messages for user's alert
    - POST /conversations - Save a new message
    - GET /summaries/{alertId} - Get latest summary for alert
    - GET /summaries/{alertId}/history - Get all summaries for alert
    - POST /summaries - Save a new summary
    - POST /investigations/trigger - Trigger async investigation for alert(s)
    """
    
    try:
        # Parse request
        http_method = event.get('httpMethod', '')
        path = event.get('path', '')
        path_parameters = event.get('pathParameters', {}) or {}
        query_parameters = event.get('queryStringParameters', {}) or {}
        headers = event.get('headers', {}) or {}
        
        # Extract JWT token from Authorization header
        auth_header = headers.get('Authorization') or headers.get('authorization')
        jwt_token = None
        if auth_header and auth_header.startswith('Bearer '):
            jwt_token = auth_header.replace('Bearer ', '')
        
        # Parse body if present
        body = {}
        if event.get('body'):
            try:
                body = json.loads(event['body'])
            except json.JSONDecodeError:
                return error_response(400, 'Invalid JSON in request body')
        
        print(f"Request: {http_method} {path}")
        print(f"Path params: {path_parameters}")
        print(f"Query params: {query_parameters}")
        
        # Route to appropriate handler
        if '/conversations' in path:
            if http_method == 'GET':
                return get_conversations(path_parameters, query_parameters)
            elif http_method == 'POST':
                return save_message(body)
            else:
                return error_response(405, f'Method {http_method} not allowed')
        
        elif '/summaries' in path:
            if http_method == 'GET':
                if '/history' in path:
                    return get_summary_history(path_parameters)
                else:
                    return get_latest_summary(path_parameters)
            elif http_method == 'POST':
                return save_summary(body)
            else:
                return error_response(405, f'Method {http_method} not allowed')
        
        elif '/investigations/trigger' in path:
            if http_method == 'POST':
                return trigger_investigation(body, jwt_token)
            else:
                return error_response(405, f'Method {http_method} not allowed')
        
        else:
            return error_response(404, 'Route not found')
    
    except Exception as e:
        print(f"Error: {str(e)}")
        import traceback
        traceback.print_exc()
        return error_response(500, f'Internal server error: {str(e)}')


def get_conversations(path_params: Dict[str, str], query_params: Dict[str, str]) -> Dict[str, Any]:
    """
    Get all messages for a user's alert conversation
    
    Path params:
    - alertId: Alert identifier
    - userId: User identifier
    
    Query params:
    - limit: Maximum number of messages to return per page (default: 100)
    - lastEvaluatedKey: Pagination token (for client-side pagination)
    - fetchAll: If "true", fetch all messages automatically (default: false)
    """
    
    if not conversations_table:
        return error_response(500, 'Conversations table not configured')
    
    alert_id = path_params.get('alertId')
    user_id = path_params.get('userId')
    
    if not alert_id or not user_id:
        return error_response(400, 'alertId and userId are required')
    
    try:
        # Build query parameters
        pk = f"ALERT#{alert_id}#USER#{user_id}"
        
        # Check if client wants all messages at once
        fetch_all = query_params.get('fetchAll', '').lower() == 'true'
        
        if fetch_all:
            # Fetch all messages by paginating automatically
            all_messages = []
            last_evaluated_key = None
            
            while True:
                query_kwargs = {
                    'KeyConditionExpression': 'PK = :pk AND begins_with(SK, :sk)',
                    'ExpressionAttributeValues': {
                        ':pk': pk,
                        ':sk': 'MSG#'
                    },
                    'ScanIndexForward': True,  # Chronological order
                    'Limit': 100  # Fetch 100 at a time
                }
                
                # Add pagination token if we have one
                if last_evaluated_key:
                    query_kwargs['ExclusiveStartKey'] = last_evaluated_key
                
                # Query DynamoDB
                result = conversations_table.query(**query_kwargs)
                
                # Add messages to our collection
                all_messages.extend(result.get('Items', []))
                
                # Check if there are more pages
                last_evaluated_key = result.get('LastEvaluatedKey')
                if not last_evaluated_key:
                    break  # No more pages
                
                print(f"Fetched {len(result.get('Items', []))} messages, total so far: {len(all_messages)}")
            
            print(f"Fetched all {len(all_messages)} messages for alert {alert_id}, user {user_id}")
            
            # Format response with all messages
            return response(200, {
                'alertId': alert_id,
                'userId': user_id,
                'messages': all_messages,
                'count': len(all_messages)
            })
        
        else:
            # Single page fetch (original behavior for client-side pagination)
            query_kwargs = {
                'KeyConditionExpression': 'PK = :pk AND begins_with(SK, :sk)',
                'ExpressionAttributeValues': {
                    ':pk': pk,
                    ':sk': 'MSG#'
                },
                'ScanIndexForward': True,  # Chronological order
                'Limit': int(query_params.get('limit', 100))
            }
            
            # Add pagination token if provided
            if query_params.get('lastEvaluatedKey'):
                try:
                    query_kwargs['ExclusiveStartKey'] = json.loads(query_params['lastEvaluatedKey'])
                except:
                    return error_response(400, 'Invalid lastEvaluatedKey format')
            
            # Query DynamoDB
            result = conversations_table.query(**query_kwargs)
            
            # Format response
            response_body = {
                'alertId': alert_id,
                'userId': user_id,
                'messages': result.get('Items', []),
                'count': len(result.get('Items', []))
            }
            
            # Add pagination token if more results available
            if result.get('LastEvaluatedKey'):
                response_body['lastEvaluatedKey'] = json.dumps(result['LastEvaluatedKey'], cls=DecimalEncoder)
            
            return response(200, response_body)
    
    except Exception as e:
        print(f"Error querying conversations: {str(e)}")
        return error_response(500, f'Failed to retrieve conversations: {str(e)}')


def save_message(body: Dict[str, Any]) -> Dict[str, Any]:
    """
    Save a new message to conversations table
    
    Body:
    - alertId: Alert identifier
    - userId: User identifier
    - messageId: Unique message identifier
    - role: "user" or "agent"
    - content: Message text
    - auditTrail: Optional audit trail for agent messages
    - timestamp: ISO 8601 timestamp (optional, will be generated if not provided)
    """
    
    if not conversations_table:
        return error_response(500, 'Conversations table not configured')
    
    # Validate required fields
    required_fields = ['alertId', 'userId', 'messageId', 'role', 'content']
    for field in required_fields:
        if field not in body:
            return error_response(400, f'Missing required field: {field}')
    
    alert_id = body['alertId']
    user_id = body['userId']
    message_id = body['messageId']
    role = body['role']
    content = body['content']
    
    # Validate role
    if role not in ['user', 'agent']:
        return error_response(400, 'role must be "user" or "agent"')
    
    # Generate timestamp if not provided
    timestamp = body.get('timestamp', datetime.utcnow().isoformat() + 'Z')
    
    try:
        # Build item
        item = {
            'PK': f"ALERT#{alert_id}#USER#{user_id}",
            'SK': f"MSG#{timestamp}",
            'messageId': message_id,
            'alertId': alert_id,
            'userId': user_id,
            'timestamp': timestamp,
            'role': role,
            'content': content
        }
        
        # Add audit trail if provided (for agent messages)
        if body.get('auditTrail'):
            item['auditTrail'] = body['auditTrail']
        
        # Add TTL (90 days from now)
        ttl_seconds = int(datetime.utcnow().timestamp()) + (90 * 24 * 60 * 60)
        item['ttl'] = ttl_seconds
        
        # Save to DynamoDB
        conversations_table.put_item(Item=item)
        
        return response(201, {
            'message': 'Message saved successfully',
            'messageId': message_id,
            'timestamp': timestamp
        })
    
    except Exception as e:
        print(f"Error saving message: {str(e)}")
        return error_response(500, f'Failed to save message: {str(e)}')


def get_latest_summary(path_params: Dict[str, str]) -> Dict[str, Any]:
    """
    Get the latest summary and full history for an alert.
    Returns both `summary` (most recent) and `summaries` (all versions) in a
    single response, eliminating the need for a separate /history call.

    Path params:
    - alertId: Alert identifier
    """

    if not summaries_table:
        return error_response(500, 'Summaries table not configured')

    alert_id = path_params.get('alertId')

    if not alert_id:
        return error_response(400, 'alertId is required')

    try:
        # Query all summaries for this alert
        result = summaries_table.query(
            KeyConditionExpression='PK = :pk',
            ExpressionAttributeValues={
                ':pk': alert_id
            }
        )

        items = result.get('Items', [])

        if not items:
            return error_response(404, 'No summary found for this alert')

        # Sort by generatedAt in descending order (newest first)
        sorted_items = sorted(items, key=lambda x: x.get('generatedAt', ''), reverse=True)

        return response(200, {
            'alertId': alert_id,
            'summary': sorted_items[0],
            'summaries': sorted_items,
            'count': len(sorted_items)
        })

    except Exception as e:
        print(f"Error retrieving summary: {str(e)}")
        return error_response(500, f'Failed to retrieve summary: {str(e)}')


def get_summary_history(path_params: Dict[str, str]) -> Dict[str, Any]:
    """
    Get all summaries for an alert (history).
    Kept for backward compatibility — delegates to get_latest_summary which
    now returns both latest and history in one response.
    """
    return get_latest_summary(path_params)


def save_summary(body: Dict[str, Any]) -> Dict[str, Any]:
    """
    Save a new investigation summary
    
    Body:
    - alertId: Alert identifier
    - investigationId: Investigation identifier (used as SK)
    - summaryText: Summary text
    - findings: List of findings
    - recommendations: List of recommendations
    - asyncAuditTrail: Audit trail from async investigation
    - generatedBy: "async-agent" or "user-requested"
    - timestamp: ISO 8601 timestamp (optional, will be generated if not provided)
    """
    
    if not summaries_table:
        return error_response(500, 'Summaries table not configured')
    
    # Validate required fields
    required_fields = ['alertId', 'investigationId', 'summaryText', 'findings', 'recommendations']
    for field in required_fields:
        if field not in body:
            return error_response(400, f'Missing required field: {field}')
    
    alert_id = body['alertId']
    investigation_id = body['investigationId']
    summary_text = body['summaryText']
    findings = body['findings']
    recommendations = body['recommendations']
    
    # Generate timestamp if not provided
    timestamp = body.get('timestamp', datetime.utcnow().isoformat() + 'Z')
    
    try:
        # Determine version: use provided value, or read existing version from the
        # pending record that was created by create_pending_investigation_summary.
        version = body.get('version')
        if not version:
            try:
                existing_item = summaries_table.get_item(
                    Key={'PK': alert_id, 'SK': investigation_id}
                ).get('Item')
                version = existing_item.get('version', 1) if existing_item else 1
            except Exception:
                version = 1

        # Build item - use investigation_id as SK
        item = {
            'PK': alert_id,
            'SK': investigation_id,
            'alertId': alert_id,
            'investigationId': investigation_id,
            'summaryText': summary_text,
            'findings': findings,
            'recommendations': recommendations,
            'generatedAt': timestamp,
            'version': version,
            'generatedBy': body.get('generatedBy', 'async-agent')
        }
        
        # Add async audit trail if provided
        if body.get('asyncAuditTrail'):
            item['asyncAuditTrail'] = body['asyncAuditTrail']
        
        # Add TTL (7 years from now for regulatory compliance)
        ttl_seconds = int(datetime.utcnow().timestamp()) + (7 * 365 * 24 * 60 * 60)
        item['ttl'] = ttl_seconds
        
        # Save to DynamoDB
        summaries_table.put_item(Item=item)
        
        return response(201, {
            'message': 'Summary saved successfully',
            'alertId': alert_id,
            'investigationId': investigation_id,
            'timestamp': timestamp
        })
    
    except Exception as e:
        print(f"Error saving summary: {str(e)}")
        return error_response(500, f'Failed to save summary: {str(e)}')



# ============================================================================
# Async Investigation Trigger Functions
# ============================================================================

def create_pending_investigation_summary(
    alert_id: str,
    investigation_id: str,
    triggered_by: str = "api",
    triggered_by_user: str = None
) -> Dict[str, Any]:
    """
    Create a pending investigation summary entry in DynamoDB
    Uses investigation_id as the Sort Key for stable, unique identification.
    
    Args:
        alert_id: Alert identifier
        investigation_id: Unique investigation identifier (used as SK)
        triggered_by: Source of trigger (api, scheduled, manual)
        triggered_by_user: User ID/email who triggered the investigation (for audit)
        
    Returns:
        Dictionary with summary metadata
    """
    if not summaries_table:
        raise ValueError("Summaries table not configured")
    
    timestamp = datetime.utcnow().isoformat() + 'Z'
    
    try:
        print(f"[Trigger] Creating pending summary for alert {alert_id}, investigation {investigation_id}")
        if triggered_by_user:
            print(f"[Trigger] Triggered by user: {triggered_by_user}")

        # Auto-increment version by counting existing summaries for this alert
        version = 1
        try:
            existing = summaries_table.query(
                KeyConditionExpression='PK = :pk',
                ExpressionAttributeValues={':pk': alert_id},
                Select='COUNT'
            )
            version = existing.get('Count', 0) + 1
            print(f"[Trigger] Auto-incremented version to {version} (existing: {existing.get('Count', 0)})")
        except Exception as ve:
            print(f"[Trigger] Could not determine version, defaulting to 1: {ve}")

        # Create pending summary item
        # PK = alert_id, SK = investigation_id
        item = {
            'PK': alert_id,
            'SK': investigation_id,
            'alertId': alert_id,
            'investigationId': investigation_id,
            'status': 'pending',
            'triggeredBy': triggered_by,
            'triggeredAt': timestamp,
            'summaryText': '',
            'findings': [],
            'recommendations': [],
            'generatedAt': timestamp,
            'version': version,
            'generatedBy': 'async-agent'
        }
        
        # Add user information for audit trail
        if triggered_by_user:
            item['triggeredByUser'] = triggered_by_user
        
        # Add TTL (7 years from now for regulatory compliance)
        ttl_seconds = int(datetime.utcnow().timestamp()) + (7 * 365 * 24 * 60 * 60)
        item['ttl'] = ttl_seconds
        
        # Save to DynamoDB
        summaries_table.put_item(Item=item)
        
        print(f"[Trigger] Pending summary created successfully with SK={investigation_id}")
        
        return {
            'alertId': alert_id,
            'investigationId': investigation_id,
            'timestamp': timestamp,
            'status': 'pending'
        }
    
    except Exception as e:
        print(f"[Trigger] Error creating pending summary: {str(e)}")
        raise


def invoke_agentcore_runtime_for_investigation(
    alert_id: str,
    investigation_id: str,
    timestamp: str,
    jwt_token: str
) -> Dict[str, Any]:
    """
    Invoke AgentCore Runtime to conduct async investigation.
    
    This is a fire-and-forget call - we send the request to AgentCore Runtime
    and return immediately without waiting for the investigation to complete.
    The agent will save the completed summary using gateway_save_summary.
    
    Args:
        alert_id: Alert identifier
        investigation_id: Unique investigation identifier (used as SK)
        timestamp: Investigation timestamp (for reference only)
        jwt_token: JWT access token from logged-in user
        
    Returns:
        Dictionary with invocation result
    """
    # Get AgentCore Runtime endpoint from SSM
    agentcore_runtime_endpoint = get_agentcore_runtime_endpoint()
    if not agentcore_runtime_endpoint:
        print(f"[Trigger] ERROR: AGENTCORE_RUNTIME_ENDPOINT not configured in SSM")
        raise ValueError("AGENTCORE_RUNTIME_ENDPOINT not configured in SSM Parameter Store")
    
    try:
        print(f"[Trigger] ========================================")
        print(f"[Trigger] Starting async investigation invocation")
        print(f"[Trigger] Alert ID: {alert_id}")
        print(f"[Trigger] Investigation ID: {investigation_id}")
        print(f"[Trigger] Session ID: async-investigation-{investigation_id}")
        print(f"[Trigger] Timestamp: {timestamp}")
        print(f"[Trigger] Endpoint: {agentcore_runtime_endpoint}")
        print(f"[Trigger] ========================================")
        
        # Construct investigation prompt
        prompt = f"""Conduct investigation for Alert ID: {alert_id}

Investigation Context:
- Alert ID: {alert_id}
- Investigation ID: {investigation_id}

CRITICAL: When saving the summary, you MUST use these EXACT values:
- alertId: "{alert_id}"
- investigationId: "{investigation_id}"

Do NOT generate new values. Use the exact investigation ID provided above.
"""

        # Prepare payload for AgentCore Runtime
        payload = {
            "prompt": prompt,
            "session_id": f"async-investigation-{investigation_id}",
            "alert_id": alert_id,
            "investigation_id": investigation_id,
            "user_id": f"system-async-{investigation_id}"
        }
        
        payload_json = json.dumps(payload)
        print(f"[Trigger] Payload size: {len(payload_json)} bytes")
        
        # Prepare headers with JWT Bearer token authentication
        headers = {
            'Content-Type': 'application/json',
            'Accept': 'application/json',
            'Authorization': f'Bearer {jwt_token}'
        }
        
        print(f"[Trigger] Sending fire-and-forget request to AgentCore Runtime...")
        
        # Make HTTP request without waiting for response body
        # preload_content=False means we don't wait for the full response
        # Use split timeout: 5s to establish connection, 30s to receive initial headers
        # AgentCore may take time to accept the request before returning HTTP status
        response = http.request(
            method='POST',
            url=agentcore_runtime_endpoint,
            body=payload_json,
            headers=headers,
            timeout=urllib3.Timeout(connect=5.0, read=30.0),
            preload_content=False  # Don't wait for response body
        )
        
        status = response.status
        print(f"[Trigger] Request sent - Initial status: {status}")
        
        # Close the connection instead of releasing it back to the pool.
        # With preload_content=False the response body hasn't been consumed,
        # so release_conn() would return a dirty connection to the pool.
        # The next request on that connection would read leftover chunked
        # data as the HTTP status line, causing a BadStatusLine error.
        response.close()
        
        if status >= 400:
            print(f"[Trigger] WARNING: Request returned error status {status}")
            print(f"[Trigger] Investigation may have failed to start")
        else:
            print(f"[Trigger] Request accepted by AgentCore Runtime")
        
        print(f"[Trigger] Investigation is now running in AgentCore Runtime")
        print(f"[Trigger] Check AgentCore logs for session: async-investigation-{investigation_id}")
        print(f"[Trigger] Investigation triggered successfully for alert {alert_id}")
        
        return {
            'success': True,
            'alertId': alert_id,
            'investigationId': investigation_id,
            'status': 'in_progress'
        }
    
    except Exception as e:
        print(f"[Trigger] EXCEPTION invoking AgentCore Runtime: {type(e).__name__}: {str(e)}")
        import traceback
        traceback.print_exc()
        raise


def trigger_single_investigation(
    alert_id: str,
    triggered_by: str = "api",
    triggered_by_user: str = None,
    jwt_token: str = None
) -> Dict[str, Any]:
    """
    Trigger an async investigation for a single alert
    
    Args:
        alert_id: Alert identifier
        triggered_by: Source of trigger
        triggered_by_user: User ID/email who triggered the investigation
        jwt_token: JWT access token from logged-in user
        
    Returns:
        Dictionary with investigation metadata
    """
    # Generate unique investigation ID using UUID
    investigation_id = str(uuid.uuid4())
    timestamp = datetime.utcnow().isoformat() + 'Z'
    
    print(f"[Trigger] ========================================")
    print(f"[Trigger] trigger_single_investigation called")
    print(f"[Trigger] Alert ID: {alert_id}")
    print(f"[Trigger] Investigation ID: {investigation_id}")
    print(f"[Trigger] Triggered by: {triggered_by}")
    print(f"[Trigger] Triggered by user: {triggered_by_user}")
    print(f"[Trigger] Timestamp: {timestamp}")
    print(f"[Trigger] ========================================")
    
    try:
        # Validate JWT token is provided
        if not jwt_token:
            print(f"[Trigger] ERROR: JWT token is missing")
            raise ValueError("JWT token is required for authentication")
        
        print(f"[Trigger] Step 1: Creating pending summary in DynamoDB...")
        # Step 1: Create pending summary in DynamoDB
        summary_metadata = create_pending_investigation_summary(
            alert_id,
            investigation_id,
            triggered_by,
            triggered_by_user
        )
        print(f"[Trigger] Step 1: Pending summary created successfully")
        print(f"[Trigger] Summary metadata: {summary_metadata}")
        
        print(f"[Trigger] Step 2: Invoking AgentCore Runtime...")
        # Step 2: Invoke AgentCore Runtime asynchronously with JWT token
        invocation_result = invoke_agentcore_runtime_for_investigation(
            alert_id,
            investigation_id,
            timestamp,
            jwt_token
        )
        print(f"[Trigger] Step 2: AgentCore Runtime invocation initiated")
        print(f"[Trigger] Invocation result: {invocation_result}")
        
        result = {
            'success': True,
            'alertId': alert_id,
            'investigationId': investigation_id,
            'status': 'triggered',
            'message': f'Investigation triggered successfully for alert {alert_id}',
            'timestamp': timestamp
        }
        print(f"[Trigger] Investigation trigger completed successfully")
        print(f"[Trigger] Final result: {result}")
        return result
    
    except Exception as e:
        print(f"[Trigger] EXCEPTION in trigger_single_investigation: {type(e).__name__}: {str(e)}")
        import traceback
        traceback.print_exc()
        
        # Update summary status to failed if it was created
        try:
            print(f"[Trigger] Attempting to update summary status to 'failed'...")
            if summaries_table:
                summaries_table.update_item(
                    Key={
                        'PK': alert_id,
                        'SK': investigation_id
                    },
                    UpdateExpression='SET #status = :status, errorMessage = :error',
                    ExpressionAttributeNames={'#status': 'status'},
                    ExpressionAttributeValues={
                        ':status': 'failed',
                        ':error': str(e)
                    }
                )
        except Exception as update_error:
            print(f"[Trigger] Failed to update summary status: {update_error}")
        
        return {
            'success': False,
            'alertId': alert_id,
            'investigationId': investigation_id,
            'status': 'failed',
            'error': str(e),
            'timestamp': timestamp
        }


def trigger_investigation(body: Dict[str, Any], jwt_token: str = None) -> Dict[str, Any]:
    """
    Handle POST /investigations/trigger
    
    Trigger async investigation for single alert or list of alerts
    
    Request Body:
    {
        "alertId": "123",  // Single alert
        "triggeredBy": "api",  // Optional: api, scheduled, manual
        "triggeredByUser": "analyst1@bank.com"  // Optional: user ID/email for audit
    }
    
    OR
    
    {
        "alertIds": ["123", "456", "789"],  // Multiple alerts
        "triggeredBy": "api",
        "triggeredByUser": "analyst1@bank.com"
    }
    
    Args:
        body: Request body with alert ID(s) and metadata
        jwt_token: JWT access token from logged-in user (required for authentication)
    """
    
    print(f"[Handler] ========================================")
    print(f"[Handler] POST /investigations/trigger called")
    print(f"[Handler] Request body keys: {list(body.keys())}")
    print(f"[Handler] ========================================")
    
    # Validate configuration
    if not summaries_table:
        print(f"[Handler] ERROR: SUMMARIES_TABLE not configured")
        return error_response(500, 'SUMMARIES_TABLE not configured')
    
    print(f"[Handler] SUMMARIES_TABLE configured: {SUMMARIES_TABLE}")
    
    # Check if AgentCore Runtime endpoint is configured
    agentcore_runtime_endpoint = get_agentcore_runtime_endpoint()
    if not agentcore_runtime_endpoint:
        print(f"[Handler] ERROR: AGENTCORE_RUNTIME_ENDPOINT not configured")
        return error_response(500, 'AGENTCORE_RUNTIME_ENDPOINT not configured in SSM Parameter Store')
    
    print(f"[Handler] AgentCore Runtime endpoint configured: {agentcore_runtime_endpoint}")
    
    # Validate JWT token is provided
    if not jwt_token:
        print(f"[Handler] ERROR: JWT token is missing")
        return error_response(401, 'Unauthorized - JWT token is required')
    
    triggered_by = body.get('triggeredBy', 'api')
    triggered_by_user = body.get('triggeredByUser')  # Optional user ID/email
    
    print(f"[Handler] Triggered by: {triggered_by}")
    
    # Log user information for audit
    if triggered_by_user:
        print(f"[Handler] Investigation triggered by user: {triggered_by_user}")
    else:
        print(f"[Handler] No user information provided")
    
    # Check for single alert
    if 'alertId' in body:
        alert_id = body['alertId']
        
        if not alert_id:
            print(f"[Handler] ERROR: alertId is empty")
            return error_response(400, 'alertId is required')
        
        print(f"[Handler] Single alert mode - Alert ID: {alert_id}")
        print(f"[Handler] Calling trigger_single_investigation...")
        result = trigger_single_investigation(alert_id, triggered_by, triggered_by_user, jwt_token)
        
        print(f"[Handler] Single investigation result: {result}")
        print(f"[Handler] Returning 202 Accepted")
        return response(202, result)  # 202 Accepted
    
    # Check for multiple alerts
    elif 'alertIds' in body:
        alert_ids = body['alertIds']
        
        if not isinstance(alert_ids, list) or len(alert_ids) == 0:
            print(f"[Handler] ERROR: alertIds is not a valid array")
            return error_response(400, 'alertIds must be a non-empty array')
        
        print(f"[Handler] Multiple alerts mode - Count: {len(alert_ids)}")
        print(f"[Handler] Alert IDs: {alert_ids}")

        # Trigger investigations in parallel using ThreadPoolExecutor.
        # Each trigger is a fire-and-forget HTTP call to AgentCore Runtime with a
        # 30s read timeout. Running them sequentially would take up to
        # 30s * N alerts, risking the Lambda's 300s timeout.
        # Cap workers at 10 to avoid overwhelming AgentCore or exhausting connections.
        max_workers = min(len(alert_ids), 10)
        results = [None] * len(alert_ids)

        with ThreadPoolExecutor(max_workers=max_workers) as executor:
            future_to_idx = {
                executor.submit(
                    trigger_single_investigation,
                    str(alert_id),
                    triggered_by,
                    triggered_by_user,
                    jwt_token
                ): idx
                for idx, alert_id in enumerate(alert_ids)
            }

            for future in as_completed(future_to_idx):
                idx = future_to_idx[future]
                alert_id = alert_ids[idx]
                try:
                    results[idx] = future.result()
                    print(f"[Handler] Alert {idx + 1}/{len(alert_ids)} ({alert_id}): triggered")
                except Exception as exc:
                    print(f"[Handler] Alert {idx + 1}/{len(alert_ids)} ({alert_id}): exception - {exc}")
                    results[idx] = {
                        'success': False,
                        'alertId': str(alert_id),
                        'status': 'failed',
                        'error': str(exc),
                        'timestamp': datetime.utcnow().isoformat() + 'Z'
                    }

        # Summary statistics
        successful = sum(1 for r in results if r and r.get('success'))
        failed = len(results) - successful

        print(f"[Handler] Multiple investigations completed (parallel)")
        print(f"[Handler] Total: {len(results)}, Successful: {successful}, Failed: {failed}")
        print(f"[Handler] Returning 202 Accepted with summary")
        
        return response(202, {
            'success': True,
            'message': f'Triggered {successful} investigations successfully, {failed} failed',
            'total': len(results),
            'successful': successful,
            'failed': failed,
            'triggeredByUser': triggered_by_user,  # Include in response for confirmation
            'results': results
        })
    
    else:
        print(f"[Handler] ERROR: Neither alertId nor alertIds provided in request body")
        return error_response(400, 'Either alertId or alertIds is required')
