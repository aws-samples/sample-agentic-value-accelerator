import json
import uuid
import boto3
import os
import base64

from datetime import datetime
from boto3.dynamodb.conditions import Key
from decimal import Decimal

def get_bedrock_insight(company_name, sanctions_data):
    """Generate AI insights using Amazon Bedrock"""
    try:
        bedrock = boto3.client('bedrock-runtime')
        
        prompt = f"""Analyze the following sanctions check results for company "{company_name}":
        
        Sanctions Data: {json.dumps(sanctions_data, indent=2)}
        
        Please provide:
        1. Risk Assessment (High/Medium/Low)
        2. Key Findings
        3. Recommended Actions
        4. Compliance Notes
        
        Format your response as text with these fields: risk_level, key_findings, recommendations, compliance_notes"""
        
        body = {
            "anthropic_version": "bedrock-2023-05-31",
            "max_tokens": 1000,
            "messages": [{"role": "user", "content": prompt}]
        }
        
        response = bedrock.invoke_model(
            modelId='us.anthropic.claude-sonnet-4-5-20250929-v1:0',
            body=json.dumps(body)
        )

        result = json.loads(response['body'].read())
        ai_text = result['content'][0]['text']

        return {
            'success': True,
            'insight': ai_text,
            'model': 'claude-sonnet-4-5'
        }
            
    except Exception as e:
        # Fallback insight
        if not sanctions_data or len(sanctions_data) == 0:
            return {
                'risk_level': 'Low',
                'key_findings': f'No sanctions found for {company_name}',
                'recommendations': 'Proceed with standard due diligence',
                'compliance_notes': 'Clean sanctions check'
            }
        else:
            return {
                'risk_level': 'High',
                'key_findings': f'Found {len(sanctions_data)} sanctions matches',
                'recommendations': 'Conduct thorough review',
                'compliance_notes': 'Manual review required',
                'error': str(e)
            }

class DecimalEncoder(json.JSONEncoder):
    def default(self, obj):
        if isinstance(obj, Decimal):
            return float(obj)
        return super(DecimalEncoder, self).default(obj)

def lambda_handler(event, context):
    # CORS headers
    cors_headers = {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization, x-document-type, x-filename'
    }
    
    method = event.get('httpMethod', 'GET')
    path = event.get('path', '/')
    
    print(f"DEBUG: Received request - Method: {method}, Path: {path}")
    
    # Handle OPTIONS requests for CORS
    if method == 'OPTIONS':
        return {'statusCode': 200, 'headers': cors_headers, 'body': ''}
    
    # DynamoDB setup
    dynamodb = boto3.resource('dynamodb')
    table = dynamodb.Table(os.environ['DYNAMODB_TABLE'])
    
    try:
        # Health check
        if path == '/health':
            response = table.scan(Select='COUNT')
            return {
                'statusCode': 200,
                'headers': cors_headers,
                'body': json.dumps({
                    "status": "healthy",
                    "timestamp": datetime.now().isoformat(),
                    "metrics": {
                        "total_customers": response['Count'],
                        "queue_length": 0,
                        "active_tasks": 0
                    }
                }, cls=DecimalEncoder)
            }
        
        # Get all customers
        if path == '/admin/customers' and method == 'GET':
            response = table.scan()
            customers = response['Items']
            return {
                'statusCode': 200,
                'headers': cors_headers,
                'body': json.dumps({
                    "total_customers": len(customers),
                    "customers": customers
                }, cls=DecimalEncoder)
            }
        
        # Create customer
        if path == '/customers' and method == 'POST':
            body = event.get('body', '')
            if event.get('isBase64Encoded'):
                body = base64.b64decode(body).decode('utf-8')
            
            # Parse JSON body
            try:
                customer_data = json.loads(body)
            except:
                # Fallback to form data parsing
                name = email = phone = None
                for part in body.split('&'):
                    if 'name=' in part: name = part.split('=')[1].replace('+', ' ')
                    elif 'email=' in part: email = part.split('=')[1]
                    elif 'phone=' in part: phone = part.split('=')[1]
                customer_data = {
                    "name": name,
                    "email": email,
                    "phone": phone or "+15550000000",
                    "status": "created",
                    "progress_percentage": 0,
                    "created_date": datetime.now().isoformat(),
                    "last_updated": datetime.now().isoformat(),
                    "documents": {
                        "business_license": "N",
                        "articles_of_incorporation": "N",
                        "ein_certificate": "N",
                        "federal_tax_id": "N",
                        "sales_tax_certificate": "N",
                        "void_business_check": "N",
                        "government_id": "N",
                        "ssn_document": "N",
                        "utility_bill": "N",
                        "bank_statement": "N"
                    }
                }
            
            # Generate 8-character alphanumeric ID
            import random
            import string
            customer_id = ''.join(random.choices(string.ascii_uppercase + string.digits, k=8))
            customer_data['id'] = customer_id
            
            # Flatten documents for DynamoDB storage
            if 'documents' in customer_data:
                docs = customer_data.pop('documents')
                for doc_type, status in docs.items():
                    customer_data[doc_type] = status
            
            table.put_item(Item=customer_data)
            
            # Create status record
            status_data = {
                "id": customer_id,
                "stage_status": {
                    "ocr_processing": {"status": "active"},
                    "human_approval_1": {"status": "pending"},
                    "compliance_check": {"status": "pending"},
                    "human_approval_2": {"status": "pending"},
                    "account_creation": {"status": "pending"},
                    "human_approval_3": {"status": "pending"},
                    "final": {"status": "pending"}
                }
            }
            # Stage status is now part of customer record
            customer_data['stage_status'] = status_data['stage_status']
            
            # Save to DynamoDB with stage_status included
            table.put_item(Item=customer_data)
            
            return {'statusCode': 200, 'headers': cors_headers, 'body': json.dumps(customer_data, cls=DecimalEncoder)}
        
        # Get customer status - show all database if no customer_id
        if '/status' in path and method == 'GET':
            path_parts = path.split('/')
            if len(path_parts) < 3 or not path_parts[2]:
                # Show all database contents
                response = table.scan()
                return {'statusCode': 200, 'headers': cors_headers, 'body': json.dumps({
                    'total_customers': response['Count'],
                    'all_data': response['Items']
                }, cls=DecimalEncoder)}
            
            customer_id = path_parts[2]
            response = table.get_item(Key={'id': customer_id})
            if 'Item' not in response:
                return {'statusCode': 404, 'headers': cors_headers, 'body': json.dumps({'detail': 'Customer not found'}, cls=DecimalEncoder)}
            
            customer = response['Item']
            # Move document fields into documents object
            doc_fields = ['business_license', 'articles_of_incorporation', 'ein_certificate', 'federal_tax_id', 'sales_tax_certificate', 'void_business_check', 'government_id', 'ssn_document', 'utility_bill', 'bank_statement']
            documents = {}
            for field in doc_fields:
                if field in customer:
                    documents[field] = customer.pop(field)
            customer['documents'] = documents
            return {'statusCode': 200, 'headers': cors_headers, 'body': json.dumps(customer, cls=DecimalEncoder)}
        
        # Get customer documents
        if '/documents' in path and method == 'GET':
            customer_id = path.split('/')[2]
            response = table.get_item(Key={'id': customer_id})
            if 'Item' not in response:
                return {'statusCode': 404, 'headers': cors_headers, 'body': json.dumps({'detail': 'Customer not found'}, cls=DecimalEncoder)}
            return {'statusCode': 200, 'headers': cors_headers, 'body': json.dumps({"documents": []}, cls=DecimalEncoder)}
        
        # Get customer notifications
        if '/notifications' in path and method == 'GET':
            customer_id = path.split('/')[2]
            response = table.get_item(Key={'id': customer_id})
            if 'Item' not in response:
                return {'statusCode': 404, 'headers': cors_headers, 'body': json.dumps({'detail': 'Customer not found'}, cls=DecimalEncoder)}
            return {'statusCode': 200, 'headers': cors_headers, 'body': json.dumps({"notifications": []}, cls=DecimalEncoder)}
        
        # Upload document for customer - FIXED URL PATTERN
        if '/customers/' in path and '/upload' in path and method == 'POST':
            print(f"DEBUG: Upload endpoint hit - Path: {path}, Method: {method}")
            customer_id = path.split('/')[2]
            response = table.get_item(Key={'id': customer_id})
            if 'Item' not in response:
                return {'statusCode': 404, 'headers': cors_headers, 'body': json.dumps({'detail': 'Customer not found'}, cls=DecimalEncoder)}
            
            # Handle JSON-formatted file upload from UI
            body = event.get('body', '')
            
            try:
                # Parse JSON body to get base64 file data
                upload_data = json.loads(body)
                file_base64 = upload_data.get('fileData', '')
                
                if not file_base64:
                    return {'statusCode': 400, 'headers': cors_headers, 'body': json.dumps({'error': 'No file data provided'}, cls=DecimalEncoder)}
                
                # Decode base64 file data
                file_content = base64.b64decode(file_base64)
                print(f"DEBUG: Successfully decoded file, size: {len(file_content)} bytes")
                
            except json.JSONDecodeError:
                return {'statusCode': 400, 'headers': cors_headers, 'body': json.dumps({'error': 'Invalid JSON in request body'}, cls=DecimalEncoder)}
            except Exception as e:
                return {'statusCode': 400, 'headers': cors_headers, 'body': json.dumps({'error': f'File processing error: {str(e)}'}, cls=DecimalEncoder)}
            
            # Extract filename and document type from headers or use defaults
            headers = event.get('headers', {})
            filename = headers.get('x-filename', 'document.pdf')
            doc_type = headers.get('x-document-type', 'general')
            
            print(f"DEBUG: Parsed upload data - filename: {filename}, doc_type: {doc_type}, file_size: {len(file_content)}")
            print(f"DEBUG: File content first 50 bytes: {file_content[:50]}")
            
            # Check if this looks like a proper image file
            if filename.lower().endswith(('.jpg', '.jpeg')):
                if not file_content.startswith(b'\xff\xd8\xff'):
                    print("WARNING: JPEG file doesn't start with JPEG header - likely corrupted")
            elif filename.lower().endswith('.png'):
                if not file_content.startswith(b'\x89PNG\r\n\x1a\n'):
                    print("WARNING: PNG file doesn't start with PNG header - likely corrupted")
            
            # Detect content type from filename
            import mimetypes
            content_type, _ = mimetypes.guess_type(filename)
            if not content_type:
                content_type = 'application/octet-stream'
            
            # Upload to S3 with proper folder structure
            s3 = boto3.client('s3')
            s3_key = f"{customer_id}/{doc_type}/{filename}"
            s3.put_object(
                Bucket=os.environ['S3_BUCKET'],
                Key=s3_key,
                Body=file_content,
                ContentType=content_type
            )
            print(f"DEBUG: File uploaded to S3 - key: {s3_key}, content_type: {content_type}")

            # Run Textract OCR on the uploaded document
            confidence_score = 0
            ocr_text = ''
            analysis_result = {}
            try:
                textract = boto3.client('textract')
                textract_response = textract.detect_document_text(
                    Document={'S3Object': {'Bucket': os.environ['S3_BUCKET'], 'Name': s3_key}}
                )
                blocks = textract_response.get('Blocks', [])
                lines = [b['Text'] for b in blocks if b['BlockType'] == 'LINE']
                ocr_text = '\n'.join(lines)
                # Average confidence across all WORD blocks
                word_confidences = [b['Confidence'] for b in blocks if b['BlockType'] == 'WORD']
                if word_confidences:
                    confidence_score = round(sum(word_confidences) / len(word_confidences), 2)
                print(f"DEBUG: Textract extracted {len(lines)} lines, avg confidence: {confidence_score}")
            except Exception as e:
                print(f"WARNING: Textract failed: {str(e)}")
                confidence_score = 50  # fallback so frontend shows the document

            # Analyze extracted text with Bedrock Claude
            try:
                bedrock = boto3.client('bedrock-runtime')
                analyze_prompt = f"""You are a merchant onboarding specialist reviewing a {doc_type} document.

Extracted text from document:
{ocr_text[:3000] if ocr_text else 'No text extracted - document may be an image or scanned PDF.'}

Analyze this document and provide a JSON response with these fields:
- validity: "VALID", "INVALID", or "INCOMPLETE"
- key_fields: object with extracted fields (business name, registration number, date, address, etc.)
- concerns: list of any red flags or issues
- completeness_score: number 0-100
- summary: one sentence summary

Respond ONLY with valid JSON."""

                bedrock_body = {
                    "anthropic_version": "bedrock-2023-05-31",
                    "max_tokens": 1024,
                    "messages": [{"role": "user", "content": analyze_prompt}]
                }
                bedrock_response = bedrock.invoke_model(
                    modelId='us.anthropic.claude-sonnet-4-5-20250929-v1:0',
                    body=json.dumps(bedrock_body)
                )
                result = json.loads(bedrock_response['body'].read())
                raw_text = result['content'][0]['text']
                try:
                    analysis_result = json.loads(raw_text)
                except Exception:
                    analysis_result = {'raw': raw_text}
                print(f"DEBUG: Bedrock analysis complete for {doc_type}")
            except Exception as e:
                print(f"WARNING: Bedrock analysis failed: {str(e)}")
                analysis_result = {'error': str(e)}

            # Update document flag to Y and save confidence score in DynamoDB
            confidence_score_field = f"{doc_type}_confidence_score"
            table.update_item(
                Key={'id': customer_id},
                UpdateExpression='SET #doc_type = :y, #cs = :score, last_updated = :updated',
                ExpressionAttributeNames={
                    '#doc_type': doc_type,
                    '#cs': confidence_score_field
                },
                ExpressionAttributeValues={
                    ':y': 'Y',
                    ':score': Decimal(str(confidence_score)),
                    ':updated': datetime.now().isoformat()
                }
            )

            return {'statusCode': 200, 'headers': cors_headers, 'body': json.dumps({
                'message': 'Document uploaded and analyzed successfully',
                'customer_id': customer_id,
                'filename': filename,
                'document_type': doc_type,
                's3_key': s3_key,
                'status_updated': 'Y',
                'confidence_score': confidence_score,
                'analysis': analysis_result
            }, cls=DecimalEncoder)}
        
        # Get customer stage status
        if '/stage-status' in path and method == 'GET':
            customer_id = path.split('/')[2]
            response = table.get_item(Key={'id': customer_id})
            if 'Item' not in response or 'stage_status' not in response['Item']:
                return {'statusCode': 404, 'headers': cors_headers, 'body': json.dumps({'detail': 'Customer status not found'}, cls=DecimalEncoder)}
            return {'statusCode': 200, 'headers': cors_headers, 'body': json.dumps({
                'id': customer_id,
                'stage_status': response['Item']['stage_status']
            }, cls=DecimalEncoder)}
        
        # Update customer stage status
        if '/stage-status' in path and method == 'POST':
            customer_id = path.split('/')[2]
            body = event.get('body', '')
            if event.get('isBase64Encoded'):
                body = base64.b64decode(body).decode('utf-8')
            
            data = json.loads(body)
            stage = data.get('stage')
            status = data.get('status')
            ai_insight = data.get('ai_insight', '')
            
            table.update_item(
                Key={'id': customer_id},
                UpdateExpression='SET stage_status.#stage.#status = :status, stage_status.#stage.ai_insight = :ai_insight',
                ExpressionAttributeNames={'#stage': stage, '#status': 'status'},
                ExpressionAttributeValues={':status': status, ':ai_insight': ai_insight}
            )
            
            return {'statusCode': 200, 'headers': cors_headers, 'body': json.dumps({
                'message': f'Status updated for customer {customer_id}',
                'stage': stage,
                'status': status
            }, cls=DecimalEncoder)}
        
        # Company Analysis Endpoint
        if '/company/analyze' in path and method == 'GET':
            name = event.get('queryStringParameters', {}).get('name', '') if event.get('queryStringParameters') else ''
            
            if not name:
                return {'statusCode': 400, 'headers': cors_headers, 'body': json.dumps({'error': 'Company name is required'}, cls=DecimalEncoder)}
            
            try:
                # Get AI insights
                bedrock = boto3.client('bedrock-runtime')
                
                prompt = f"""Analyze the company "{name}" and provide:

                1. Company Type (e.g., Technology, Retail, Healthcare, Financial Services, etc.)
                2. Business Model (B2B, B2C, B2B2C, etc.)
                3. What the company sells (summarize in one sentence)
                4. Industry Insights
                5. Risk Assessment for merchant onboarding

                Format your response as JSON with EXACTLY these fields: company_type, business_model, what_they_sell, industry_insights, risk_assessment.
                The risk_assessment field must include overall_risk_level (LOW/MEDIUM/HIGH) and onboarding_recommendation.
                Keep the response concise. Respond ONLY with valid JSON, no markdown."""

                body_data = {
                    "anthropic_version": "bedrock-2023-05-31",
                    "max_tokens": 2000,
                    "messages": [{"role": "user", "content": prompt}]
                }
                
                response = bedrock.invoke_model(
                    modelId='us.anthropic.claude-sonnet-4-5-20250929-v1:0',
                    body=json.dumps(body_data)
                )

                result = json.loads(response['body'].read())
                ai_text = result['content'][0]['text'].strip()
                # Strip markdown code fences if Claude added them despite instructions
                if ai_text.startswith('```'):
                    ai_text = ai_text.split('\n', 1)[-1]
                    ai_text = ai_text.rsplit('```', 1)[0].strip()

                # Parse to validate JSON completeness; surface error if truncated
                parsed_insights = json.loads(ai_text)

                return {'statusCode': 200, 'headers': cors_headers, 'body': json.dumps({
                    'company_name': name,
                    'ai_insights': {
                        'success': True,
                        'insights': json.dumps(parsed_insights),
                        'model': 'claude-sonnet-4-5'
                    },
                    'timestamp': datetime.now().isoformat()
                }, cls=DecimalEncoder)}
            
            except Exception as e:
                return {'statusCode': 500, 'headers': cors_headers, 'body': json.dumps({
                    'company_name': name,
                    'ai_insights': {
                        'success': False,
                        'error': str(e),
                        'fallback_insights': {
                            'company_type': 'Unknown',
                            'business_model': 'To be determined',
                            'industry_insights': f'Unable to analyze {name} at this time',
                            'risk_assessment': 'Manual review required'
                        }
                    }
                }, cls=DecimalEncoder)}
        
        # Sanctions check with AI insights
        if '/sanctions/check' in path and method == 'GET':
            name = event.get('queryStringParameters', {}).get('name', '') if event.get('queryStringParameters') else ''
            
            # Call external sanctions API
            import urllib.request
            import urllib.parse
            
            try:
                encoded_name = urllib.parse.quote(name)
                sanctions_url = f'https://api.sanctions.network/rpc/search_sanctions?name={encoded_name}'
                
                req = urllib.request.Request(sanctions_url, headers={
                    'User-Agent': 'MerchantOnboarding/1.0',
                    'Accept': 'application/json'
                })
                with urllib.request.urlopen(req) as response:
                    sanctions_data = json.loads(response.read().decode())
                
                # Generate AI insights using Bedrock
                ai_insight = get_bedrock_insight(name, sanctions_data)
                
                return {'statusCode': 200, 'headers': cors_headers, 'body': json.dumps({
                    'company_name': name,
                    'sanctions_data': sanctions_data,
                    'ai_insight': ai_insight,
                    'total_matches': len(sanctions_data) if sanctions_data else 0
                }, cls=DecimalEncoder)}
            
            except Exception as e:
                return {'statusCode': 500, 'headers': cors_headers, 'body': json.dumps({
                    'error': f'Failed to check sanctions: {str(e)}',
                    'name': name
                }, cls=DecimalEncoder)}
        
        # Queue status
        if path == '/admin/queue-status' and method == 'GET':
            return {'statusCode': 200, 'headers': cors_headers, 'body': json.dumps({"queue_length": 0, "active_tasks": 0, "recent_tasks": []}, cls=DecimalEncoder)}
        
        return {'statusCode': 404, 'headers': cors_headers, 'body': json.dumps({'message': 'Not found'}, cls=DecimalEncoder)}
        
    except Exception as e:
        return {'statusCode': 500, 'headers': cors_headers, 'body': json.dumps({'error': str(e)}, cls=DecimalEncoder)}