"""
Lambda function for Risk Analyst Conversation API
Handles CRUD operations for Risk Analyst agent chat messages
"""

import json
import os
import base64
import boto3
from datetime import datetime
from decimal import Decimal
from typing import Dict, Any

# Initialize clients
dynamodb = boto3.resource('dynamodb')
s3_client = boto3.client('s3')

# Get table name from environment variable
MSP_CONVERSATIONS_TABLE = os.environ.get('MSP_CONVERSATIONS_TABLE')
S3_MSP_PLOTS_BUCKET = os.environ.get('S3_MSP_PLOTS_BUCKET')

# Initialize table
msp_conversations_table = dynamodb.Table(MSP_CONVERSATIONS_TABLE) if MSP_CONVERSATIONS_TABLE else None


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
        'Access-Control-Allow-Methods': 'GET,POST,OPTIONS'
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
    Main Lambda handler for Risk Analyst Conversation API

    Routes:
    - GET /msp-conversations/{userId} - Get all messages for user
    - POST /msp-conversations - Save a new message
    """

    try:
        http_method = event.get('httpMethod', '')
        path = event.get('path', '')
        path_parameters = event.get('pathParameters', {}) or {}
        query_parameters = event.get('queryStringParameters', {}) or {}

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
        if '/msp-conversations' in path:
            if http_method == 'GET':
                return get_msp_conversations(path_parameters, query_parameters)
            elif http_method == 'POST':
                return save_msp_message(body)
            else:
                return error_response(405, f'Method {http_method} not allowed')
        else:
            return error_response(404, 'Route not found')

    except Exception as e:
        print(f"Error: {str(e)}")
        import traceback
        traceback.print_exc()
        return error_response(500, f'Internal server error: {str(e)}')


def get_msp_conversations(path_params: Dict[str, str], query_params: Dict[str, str]) -> Dict[str, Any]:
    """
    Get all messages for a user's Risk Analyst conversation

    Path params:
    - userId: User identifier

    Query params:
    - limit: Maximum number of messages to return per page (default: 100)
    - lastEvaluatedKey: Pagination token
    - fetchAll: If "true", fetch all messages automatically (default: false)
    """

    if not msp_conversations_table:
        return error_response(500, 'Risk Analyst conversations table not configured')

    user_id = path_params.get('userId')

    if not user_id:
        return error_response(400, 'userId is required')

    try:
        pk = f"USER#{user_id}"
        fetch_all = query_params.get('fetchAll', '').lower() == 'true'

        if fetch_all:
            all_messages = []
            last_evaluated_key = None

            while True:
                query_kwargs = {
                    'KeyConditionExpression': 'PK = :pk AND begins_with(SK, :sk)',
                    'ExpressionAttributeValues': {
                        ':pk': pk,
                        ':sk': 'MSG#'
                    },
                    'ScanIndexForward': True,
                    'Limit': 100
                }

                if last_evaluated_key:
                    query_kwargs['ExclusiveStartKey'] = last_evaluated_key

                result = msp_conversations_table.query(**query_kwargs)
                all_messages.extend(result.get('Items', []))

                last_evaluated_key = result.get('LastEvaluatedKey')
                if not last_evaluated_key:
                    break

                print(f"Fetched {len(result.get('Items', []))} messages, total so far: {len(all_messages)}")

            print(f"Fetched all {len(all_messages)} messages for user {user_id}")
            all_messages = hydrate_images_from_s3(all_messages)

            return response(200, {
                'userId': user_id,
                'messages': all_messages,
                'count': len(all_messages)
            })

        else:
            query_kwargs = {
                'KeyConditionExpression': 'PK = :pk AND begins_with(SK, :sk)',
                'ExpressionAttributeValues': {
                    ':pk': pk,
                    ':sk': 'MSG#'
                },
                'ScanIndexForward': True,
                'Limit': int(query_params.get('limit', 100))
            }

            if query_params.get('lastEvaluatedKey'):
                try:
                    query_kwargs['ExclusiveStartKey'] = json.loads(query_params['lastEvaluatedKey'])
                except Exception:
                    return error_response(400, 'Invalid lastEvaluatedKey format')

            result = msp_conversations_table.query(**query_kwargs)
            messages = hydrate_images_from_s3(result.get('Items', []))

            response_body = {
                'userId': user_id,
                'messages': messages,
                'count': len(messages)
            }

            if result.get('LastEvaluatedKey'):
                response_body['lastEvaluatedKey'] = json.dumps(result['LastEvaluatedKey'], cls=DecimalEncoder)

            return response(200, response_body)

    except Exception as e:
        print(f"Error querying Risk Analyst conversations: {str(e)}")
        return error_response(500, f'Failed to retrieve Risk Analyst conversations: {str(e)}')


def upload_images_to_s3(user_id, message_id, images):
    """Upload base64 images to S3, return list of {s3_key, alt} references."""
    image_refs = []
    for index, image in enumerate(images):
        s3_key = f"{user_id}/{message_id}/{index}.png"
        try:
            image_bytes = base64.b64decode(image['base64'])
            s3_client.put_object(
                Bucket=S3_MSP_PLOTS_BUCKET,
                Key=s3_key, Body=image_bytes, ContentType='image/png'
            )
            image_refs.append({'s3_key': s3_key, 'alt': image.get('alt', 'Chart')})
        except Exception as e:
            print(f"Failed to upload image {index} to S3: {str(e)}")
            image_refs.append(image)  # fallback: keep inline
    return image_refs


def hydrate_images_from_s3(messages):
    """Fetch S3 images and reconstruct {base64, alt} for the API response."""
    if not S3_MSP_PLOTS_BUCKET:
        return messages
    for message in messages:
        if not message.get('images'):
            continue
        hydrated = []
        for image in message['images']:
            if 's3_key' in image:
                try:
                    resp = s3_client.get_object(Bucket=S3_MSP_PLOTS_BUCKET, Key=image['s3_key'])
                    b64 = base64.b64encode(resp['Body'].read()).decode('utf-8')
                    hydrated.append({'base64': b64, 'alt': image.get('alt', 'Chart')})
                except Exception as e:
                    print(f"Failed to fetch {image['s3_key']}: {str(e)}")
                    hydrated.append({'base64': '', 'alt': image.get('alt', 'Chart (failed to load)')})
            else:
                hydrated.append(image)  # legacy inline
        message['images'] = hydrated
    return messages


def save_msp_message(body: Dict[str, Any]) -> Dict[str, Any]:
    """
    Save a new message to Risk Analyst conversations table

    Body:
    - userId: User identifier
    - messageId: Unique message identifier
    - role: "user" or "agent"
    - content: Message text
    - auditTrail: Optional audit trail for agent messages
    - timestamp: ISO 8601 timestamp (optional, will be generated if not provided)
    """

    if not msp_conversations_table:
        return error_response(500, 'Risk Analyst conversations table not configured')

    # Validate required fields
    required_fields = ['userId', 'messageId', 'role', 'content']
    for field in required_fields:
        if field not in body:
            return error_response(400, f'Missing required field: {field}')

    user_id = body['userId']
    message_id = body['messageId']
    role = body['role']
    content = body['content']

    if role not in ['user', 'agent']:
        return error_response(400, 'role must be "user" or "agent"')

    timestamp = body.get('timestamp', datetime.utcnow().isoformat() + 'Z')

    try:
        item = {
            'PK': f"USER#{user_id}",
            'SK': f"MSG#{timestamp}",
            'messageId': message_id,
            'userId': user_id,
            'timestamp': timestamp,
            'role': role,
            'content': content
        }

        if body.get('auditTrail'):
            item['auditTrail'] = body['auditTrail']

        if body.get('images'):
            if S3_MSP_PLOTS_BUCKET:
                item['images'] = upload_images_to_s3(user_id, message_id, body['images'])
            else:
                item['images'] = body['images']

        # TTL: 90 days from now
        ttl_seconds = int(datetime.utcnow().timestamp()) + (90 * 24 * 60 * 60)
        item['ttl'] = ttl_seconds

        # DynamoDB has a 400KB item limit — drop images if item is too large
        item_size = len(json.dumps(item, cls=DecimalEncoder).encode('utf-8'))
        if item_size > 380_000 and 'images' in item:
            print(f"Item size {item_size} bytes exceeds 380KB threshold, dropping images to fit DynamoDB limit")
            del item['images']

        msp_conversations_table.put_item(Item=item)

        return response(201, {
            'message': 'Message saved successfully',
            'messageId': message_id,
            'timestamp': timestamp
        })

    except Exception as e:
        print(f"Error saving Risk Analyst message: {str(e)}")
        return error_response(500, f'Failed to save message: {str(e)}')
