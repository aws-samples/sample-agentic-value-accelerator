import os
import boto3
import json
import logging
from decimal import Decimal

logger = logging.getLogger()
logger.setLevel(logging.INFO)

REGION = os.environ.get("AWS_REGION", os.environ.get("AWS_DEFAULT_REGION", "us-east-1"))
TABLE_NAME = os.environ.get("TABLE_TXN_LOGS", "txn_logs")

dynamodb = boto3.resource('dynamodb', region_name=REGION)
table = dynamodb.Table(TABLE_NAME)

def decimal_default(obj):
    if isinstance(obj, Decimal):
        return float(obj)
    raise TypeError

def _cors(body, status=200):
    return {
        'statusCode': status,
        'headers': {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Headers': 'Content-Type',
            'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        },
        'body': json.dumps(body, default=decimal_default),
    }

def lambda_handler(event, context):
    logger.info("Lambda function started")
    
    try:
        method = event.get("httpMethod") or event.get("requestContext", {}).get("http", {}).get("method", "")
        if method == "OPTIONS":
            return _cors({})

        # Check if specific UUID is requested
        params = event.get('queryStringParameters') or {}
        uuid_pk = params.get('pk')
        
        if uuid_pk:
            logger.info(f"Querying specific item with UUID: {uuid_pk}")
            response = table.get_item(Key={'pk': uuid_pk})
            item = response.get('Item')
            if item:
                return _cors(item)
            else:
                return _cors({'error': 'Item not found'}, 404)
        else:
            logger.info("Starting DynamoDB scan operation")
            response = table.scan()
            items = response.get('Items', [])
            logger.info(f"DynamoDB scan completed. Retrieved {len(items)} items")
            return _cors(items)
    except Exception as e:
        logger.error(f"Error occurred: {str(e)}")
        return _cors({'error': str(e)}, 500)
