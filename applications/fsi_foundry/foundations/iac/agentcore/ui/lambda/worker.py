"""Worker — invoked asynchronously, calls AgentCore, stores result in DynamoDB."""

import json
import os
import logging
import boto3

logger = logging.getLogger()
logger.setLevel(logging.INFO)

dynamodb = boto3.resource('dynamodb', region_name=os.environ.get('AWS_REGION_NAME', 'us-east-1'))


def handler(event, context):
    session_id = event['session_id']
    request_body = event['request']
    table = dynamodb.Table(os.environ['SESSIONS_TABLE'])

    logger.info("Worker started for session %s", session_id)

    try:
        region = os.environ.get('AWS_REGION_NAME', os.environ.get('AWS_REGION', 'us-east-1'))
        client = boto3.client('bedrock-agentcore', region_name=region)

        response = client.invoke_agent_runtime(
            agentRuntimeArn=os.environ['AGENT_RUNTIME_ARN'],
            payload=json.dumps(request_body).encode('utf-8'),
            contentType='application/json',
        )

        result_body = response['response'].read().decode('utf-8')

        table.update_item(
            Key={'session_id': session_id},
            UpdateExpression='SET #s = :s, #r = :r',
            ExpressionAttributeNames={'#s': 'status', '#r': 'result'},
            ExpressionAttributeValues={':s': 'COMPLETE', ':r': result_body},
        )

        logger.info("Worker completed for session %s", session_id)

    except Exception as e:
        logger.error("Worker failed for session %s: %s", session_id, str(e))
        table.update_item(
            Key={'session_id': session_id},
            UpdateExpression='SET #s = :s, #e = :e',
            ExpressionAttributeNames={'#s': 'status', '#e': 'error_message'},
            ExpressionAttributeValues={':s': 'ERROR', ':e': str(e)},
        )
