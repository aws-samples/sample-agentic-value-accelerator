"""API handler — starts async agent invocations and returns session status."""

import json
import os
import uuid
import time
import logging
import boto3

logger = logging.getLogger()
logger.setLevel(logging.INFO)

dynamodb = boto3.resource('dynamodb', region_name=os.environ.get('AWS_REGION_NAME', 'us-east-1'))
lambda_client = boto3.client('lambda', region_name=os.environ.get('AWS_REGION_NAME', 'us-east-1'))


def handler(event, context):
    logger.info("Event: %s", json.dumps(event, default=str))

    method = event.get('requestContext', {}).get('http', {}).get('method', '')
    path = event.get('rawPath', '')

    # CORS preflight
    if method == 'OPTIONS':
        return {'statusCode': 200, 'headers': _cors_headers(), 'body': ''}

    # Validate origin secret
    expected_secret = os.environ.get('ORIGIN_SECRET', '')
    incoming_secret = event.get('headers', {}).get('x-origin-secret', '')
    if not expected_secret or incoming_secret != expected_secret:
        return _error_response(403, 'Forbidden')

    # Route: POST /api/invoke — start async invocation
    if method == 'POST' and path == '/api/invoke':
        return _handle_invoke(event)

    # Route: GET /api/status/{sessionId} — check result
    if method == 'GET' and path.startswith('/api/status/'):
        session_id = event.get('pathParameters', {}).get('sessionId', '')
        return _handle_status(session_id)

    return _error_response(404, 'Not found')


def _handle_invoke(event):
    try:
        body = json.loads(event.get('body', '{}'))
    except json.JSONDecodeError:
        return _error_response(400, 'Invalid JSON')

    session_id = str(uuid.uuid4())
    table = dynamodb.Table(os.environ['SESSIONS_TABLE'])

    # Store pending session
    table.put_item(Item={
        'session_id': session_id,
        'status': 'PENDING',
        'request': json.dumps(body),
        'created_at': int(time.time()),
        'ttl': int(time.time()) + 3600,  # auto-delete after 1 hour
    })

    # Invoke worker asynchronously
    lambda_client.invoke(
        FunctionName=os.environ['WORKER_FUNCTION'],
        InvocationType='Event',
        Payload=json.dumps({'session_id': session_id, 'request': body}),
    )

    return {
        'statusCode': 202,
        'headers': _cors_headers(),
        'body': json.dumps({'session_id': session_id, 'status': 'PENDING'}),
    }


def _handle_status(session_id):
    if not session_id:
        return _error_response(400, 'Missing sessionId')

    table = dynamodb.Table(os.environ['SESSIONS_TABLE'])
    result = table.get_item(Key={'session_id': session_id})
    item = result.get('Item')

    if not item:
        return _error_response(404, 'Session not found')

    response_body = {
        'session_id': session_id,
        'status': item['status'],
    }

    if item['status'] == 'COMPLETE':
        response_body['result'] = json.loads(item.get('result', '{}'))
    elif item['status'] == 'ERROR':
        response_body['error'] = item.get('error_message', 'Unknown error')

    return {
        'statusCode': 200,
        'headers': _cors_headers(),
        'body': json.dumps(response_body),
    }


def _cors_headers():
    return {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    }


def _error_response(status_code, message):
    return {
        'statusCode': status_code,
        'headers': _cors_headers(),
        'body': json.dumps({'error': message}),
    }
