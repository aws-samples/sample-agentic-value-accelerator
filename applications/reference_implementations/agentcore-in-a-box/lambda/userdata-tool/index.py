"""
User Data Lookup Lambda - Gateway Target for AgentCore Demo.
Looks up user-specific data from DynamoDB based on the caller's identity.
Demonstrates the Identity feature of AgentCore.
"""
import json
import os
import boto3

dynamodb = boto3.resource('dynamodb')
table = dynamodb.Table(os.environ['TABLE_NAME'])


def handler(event, context):
    """Look up user data from DynamoDB."""
    body = event if isinstance(event, dict) else json.loads(event.get('body', '{}'))

    # The runtime injects user_id server-side (from the verified in-band token). Guard against an
    # empty/malformed value and NEVER fall back to returning all users' data — that would be an
    # IDOR / enumeration hole. A bad id is a hard 400, not a broad scan.
    user_id = (body.get('user_id') or '').strip()
    data_type = body.get('data_type', 'all')

    if not user_id or len(user_id) > 128 or any(c in user_id for c in ('*', '%', '\n', '\t')):
        return {
            'statusCode': 400,
            'body': json.dumps({'error': 'a valid, specific user_id is required'})
        }

    try:
        if data_type == 'all':
            response = table.query(
                KeyConditionExpression=boto3.dynamodb.conditions.Key('userId').eq(user_id)
            )
            items = response.get('Items', [])
        else:
            response = table.get_item(Key={'userId': user_id, 'dataType': data_type})
            items = [response['Item']] if 'Item' in response else []

        return {
            'statusCode': 200,
            'body': json.dumps({'user_id': user_id, 'data': items}, default=str)
        }
    except Exception as e:
        return {
            'statusCode': 500,
            'body': json.dumps({'error': str(e)})
        }
