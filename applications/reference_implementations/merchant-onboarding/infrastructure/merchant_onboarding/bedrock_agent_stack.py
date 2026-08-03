"""
Bedrock Agent stack: action-group Lambdas + Bedrock Agent with HITL prompt.
"""
import aws_cdk as cdk
from aws_cdk import (
    aws_lambda as _lambda,
    aws_iam as iam,
    aws_s3 as s3,
    aws_bedrock as bedrock,
)
from constructs import Construct


class BedrockAgentStack(cdk.Stack):
    def __init__(self, scope: Construct, construct_id: str,
                 project_name: str, documents_bucket_name: str, **kwargs):
        super().__init__(scope, construct_id, **kwargs)

        model_id = "us.anthropic.claude-sonnet-4-20250514-v1:0"

        # ── Shared Lambda role ────────────────────────────────────────────────
        ag_role = iam.Role(self, "ActionGroupRole",
            assumed_by=iam.ServicePrincipal("lambda.amazonaws.com"),
            managed_policies=[
                iam.ManagedPolicy.from_aws_managed_policy_name("service-role/AWSLambdaBasicExecutionRole"),
            ],
        )
        ag_role.add_to_policy(iam.PolicyStatement(
            actions=["bedrock:InvokeModel"],
            resources=[f"arn:aws:bedrock:{self.region}::foundation-model/*"],
        ))
        ag_role.add_to_policy(iam.PolicyStatement(
            actions=["textract:DetectDocumentText"],
            resources=["*"],
        ))
        ag_role.add_to_policy(iam.PolicyStatement(
            actions=["s3:GetObject", "s3:ListBucket"],
            resources=[
                f"arn:aws:s3:::{documents_bucket_name}",
                f"arn:aws:s3:::{documents_bucket_name}/*",
            ],
        ))

        # ── Document Processor Lambda ─────────────────────────────────────────
        doc_fn = _lambda.Function(self, "DocumentProcessorFn",
            function_name=f"{project_name}-doc-processor",
            runtime=_lambda.Runtime.PYTHON_3_12,
            handler="document_processor.lambda_handler",
            code=_lambda.Code.from_asset("../agents/action_groups"),
            role=ag_role,
            timeout=cdk.Duration.seconds(60),
            memory_size=512,
            environment={
                "DOCUMENTS_BUCKET": documents_bucket_name,
            },
        )

        # ── Compliance Checker Lambda ─────────────────────────────────────────
        comp_fn = _lambda.Function(self, "ComplianceCheckerFn",
            function_name=f"{project_name}-compliance-checker",
            runtime=_lambda.Runtime.PYTHON_3_12,
            handler="compliance_checker.lambda_handler",
            code=_lambda.Code.from_asset("../agents/action_groups"),
            role=ag_role,
            timeout=cdk.Duration.seconds(60),
            memory_size=512,
            environment={},
        )

        # ── Bedrock Agent execution role ──────────────────────────────────────
        bedrock_role = iam.Role(self, "BedrockAgentRole",
            assumed_by=iam.ServicePrincipal("bedrock.amazonaws.com"),
        )
        bedrock_role.add_to_policy(iam.PolicyStatement(
            actions=["bedrock:InvokeModel"],
            resources=[f"arn:aws:bedrock:{self.region}::foundation-model/*"],
        ))
        for fn in (doc_fn, comp_fn):
            fn.grant_invoke(bedrock_role)

        # ── Bedrock Agent ─────────────────────────────────────────────────────
        with open("../agents/prompts/system_prompt.txt") as f:
            system_prompt = f.read()

        agent = bedrock.CfnAgent(self, "OnboardingAgent",
            agent_name=f"{project_name}-agent",
            agent_resource_role_arn=bedrock_role.role_arn,
            foundation_model=model_id,
            instruction=system_prompt,
            auto_prepare=True,
            action_groups=[
                bedrock.CfnAgent.AgentActionGroupProperty(
                    action_group_name="DocumentProcessor",
                    description="Extract and analyze merchant documents via Textract + Claude",
                    action_group_executor=bedrock.CfnAgent.ActionGroupExecutorProperty(
                        lambda_=doc_fn.function_arn,
                    ),
                    api_schema=bedrock.CfnAgent.APISchemaProperty(
                        payload=_doc_processor_schema(),
                    ),
                ),
                bedrock.CfnAgent.AgentActionGroupProperty(
                    action_group_name="ComplianceChecker",
                    description="OFAC sanctions screening and fraud risk assessment",
                    action_group_executor=bedrock.CfnAgent.ActionGroupExecutorProperty(
                        lambda_=comp_fn.function_arn,
                    ),
                    api_schema=bedrock.CfnAgent.APISchemaProperty(
                        payload=_compliance_checker_schema(),
                    ),
                ),
            ],
        )

        # Allow Bedrock to invoke the action group Lambdas
        doc_fn.add_permission("AllowBedrockDoc",
            principal=iam.ServicePrincipal("bedrock.amazonaws.com"),
            action="lambda:InvokeFunction",
            source_arn=agent.attr_agent_arn,
        )
        comp_fn.add_permission("AllowBedrockComp",
            principal=iam.ServicePrincipal("bedrock.amazonaws.com"),
            action="lambda:InvokeFunction",
            source_arn=agent.attr_agent_arn,
        )

        cdk.CfnOutput(self, "AgentId",  value=agent.attr_agent_id,  export_name=f"{project_name}-agent-id")
        cdk.CfnOutput(self, "AgentArn", value=agent.attr_agent_arn, export_name=f"{project_name}-agent-arn")


def _doc_processor_schema() -> str:
    return """{
  "openapi": "3.0.0",
  "info": {"title": "DocumentProcessor", "description": "Extracts and analyzes merchant documents", "version": "1.0.0"},
  "paths": {
    "/extract-text": {
      "post": {
        "summary": "Extract text from an S3 document using Textract",
        "description": "Extracts text from a merchant document stored in S3 using Amazon Textract",
        "operationId": "extractText",
        "requestBody": {
          "required": true,
          "content": {"application/json": {"schema": {
            "type": "object",
            "properties": {
              "s3Key":      {"type": "string", "description": "S3 object key of the document to extract text from"},
              "merchantId": {"type": "string", "description": "Unique identifier for the merchant"}
            },
            "required": ["s3Key", "merchantId"]
          }}}
        },
        "responses": {"200": {"description": "Extracted text content from the document"}}
      }
    },
    "/analyze-document": {
      "post": {
        "summary": "Analyze extracted document text with Claude",
        "description": "Analyzes extracted document text using Claude to identify document type and key fields",
        "operationId": "analyzeDocument",
        "requestBody": {
          "required": true,
          "content": {"application/json": {"schema": {
            "type": "object",
            "properties": {
              "text":         {"type": "string", "description": "Extracted text content from the document"},
              "documentType": {"type": "string", "description": "Type of document being analyzed"},
              "merchantId":   {"type": "string", "description": "Unique identifier for the merchant"}
            },
            "required": ["text", "merchantId"]
          }}}
        },
        "responses": {"200": {"description": "Document analysis result including identified fields and confidence scores"}}
      }
    },
    "/validate-document-type": {
      "post": {
        "summary": "Detect document type from filename",
        "description": "Detects the type of a merchant document from its filename extension and naming convention",
        "operationId": "validateDocumentType",
        "requestBody": {
          "required": true,
          "content": {"application/json": {"schema": {
            "type": "object",
            "properties": {
              "filename": {"type": "string", "description": "Name of the document file to classify"}
            },
            "required": ["filename"]
          }}}
        },
        "responses": {"200": {"description": "Detected document type classification"}}
      }
    }
  }
}"""


def _compliance_checker_schema() -> str:
    return """{
  "openapi": "3.0.0",
  "info": {"title": "ComplianceChecker", "description": "OFAC sanctions screening and fraud risk assessment", "version": "1.0.0"},
  "paths": {
    "/check-sanctions": {
      "post": {
        "summary": "Screen business name against OFAC/sanctions lists",
        "description": "Screens a merchant business name against OFAC and other sanctions lists to check for matches",
        "operationId": "checkSanctions",
        "requestBody": {
          "required": true,
          "content": {"application/json": {"schema": {
            "type": "object",
            "properties": {
              "businessName": {"type": "string", "description": "Legal business name of the merchant to screen"},
              "merchantId":   {"type": "string", "description": "Unique identifier for the merchant"}
            },
            "required": ["businessName", "merchantId"]
          }}}
        },
        "responses": {"200": {"description": "Sanctions screening result including match status and confidence score"}}
      }
    },
    "/assess-fraud-risk": {
      "post": {
        "summary": "Assess fraud risk using Claude",
        "description": "Assesses the fraud risk of a merchant application using Claude based on provided merchant profile data",
        "operationId": "assessFraudRisk",
        "requestBody": {
          "required": true,
          "content": {"application/json": {"schema": {
            "type": "object",
            "properties": {
              "merchantData": {"type": "string", "description": "JSON-encoded merchant profile data for fraud risk assessment"}
            },
            "required": ["merchantData"]
          }}}
        },
        "responses": {"200": {"description": "Fraud risk assessment result including risk level and reasoning"}}
      }
    },
    "/validate-compliance": {
      "post": {
        "summary": "Consolidate sanctions and fraud results into a compliance decision",
        "description": "Consolidates sanctions screening and fraud risk results into a final compliance decision for merchant onboarding",
        "operationId": "validateCompliance",
        "requestBody": {
          "required": true,
          "content": {"application/json": {"schema": {
            "type": "object",
            "properties": {
              "merchantId":      {"type": "string", "description": "Unique identifier for the merchant"},
              "sanctionsResult": {"type": "string", "description": "JSON-encoded sanctions screening result"},
              "fraudResult":     {"type": "string", "description": "JSON-encoded fraud risk assessment result"}
            },
            "required": ["merchantId", "sanctionsResult", "fraudResult"]
          }}}
        },
        "responses": {"200": {"description": "Final compliance decision for merchant onboarding approval or rejection"}}
      }
    }
  }
}"""
