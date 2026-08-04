"""
Core stack: DynamoDB tables, S3 bucket, Lambda API, API Gateway.
Mirrors the CustomerOnboarding reference app schema.
"""
import aws_cdk as cdk
from aws_cdk import (
    aws_dynamodb as ddb,
    aws_s3 as s3,
    aws_lambda as _lambda,
    aws_apigateway as apigw,
    aws_iam as iam,
)
from constructs import Construct



class OnboardingStack(cdk.Stack):
    def __init__(self, scope: Construct, construct_id: str, project_name: str, **kwargs):
        super().__init__(scope, construct_id, **kwargs)

        removal = cdk.RemovalPolicy.DESTROY

        # ── DynamoDB tables ──────────────────────────────────────────────────
        # Main customers table (PK: id — matches the frontend's customer schema)
        customers_table = ddb.Table(self, "CustomersTable",
            table_name=f"{project_name}-customers",
            partition_key=ddb.Attribute(name="id", type=ddb.AttributeType.STRING),
            billing_mode=ddb.BillingMode.PAY_PER_REQUEST,
            removal_policy=removal,
        )

        # Document processing results table (PK: processing_id, with GSIs)
        doc_processing_table = ddb.Table(self, "DocumentProcessingTable",
            table_name=f"{project_name}-doc-processing",
            partition_key=ddb.Attribute(name="processing_id", type=ddb.AttributeType.STRING),
            billing_mode=ddb.BillingMode.PAY_PER_REQUEST,
            removal_policy=removal,
        )
        doc_processing_table.add_global_secondary_index(
            index_name="filename-index",
            partition_key=ddb.Attribute(name="filename", type=ddb.AttributeType.STRING),
        )
        doc_processing_table.add_global_secondary_index(
            index_name="status-index",
            partition_key=ddb.Attribute(name="processing_status", type=ddb.AttributeType.STRING),
        )
        doc_processing_table.add_global_secondary_index(
            index_name="customer-id-index",
            partition_key=ddb.Attribute(name="customer_id", type=ddb.AttributeType.STRING),
        )
        doc_processing_table.add_global_secondary_index(
            index_name="customer-document-index",
            partition_key=ddb.Attribute(name="customer_id", type=ddb.AttributeType.STRING),
            sort_key=ddb.Attribute(name="document_type", type=ddb.AttributeType.STRING),
        )

        # Customer insights table (PK: customer_id)
        insights_table = ddb.Table(self, "InsightsTable",
            table_name=f"{project_name}-insights",
            partition_key=ddb.Attribute(name="customer_id", type=ddb.AttributeType.STRING),
            billing_mode=ddb.BillingMode.PAY_PER_REQUEST,
            removal_policy=removal,
        )

        # ── S3 document storage ───────────────────────────────────────────────
        self.documents_bucket = s3.Bucket(self, "DocumentsBucket",
            bucket_name=f"{project_name}-docs-{self.account}",
            removal_policy=removal,
            auto_delete_objects=True,
            cors=[s3.CorsRule(
                allowed_methods=[s3.HttpMethods.GET, s3.HttpMethods.PUT, s3.HttpMethods.POST],
                allowed_origins=["*"],
                allowed_headers=["*"],
            )],
        )

        # ── Lambda function ───────────────────────────────────────────────────
        api_fn = _lambda.Function(self, "ApiLambda",
            function_name=f"{project_name}-api",
            runtime=_lambda.Runtime.PYTHON_3_12,
            handler="index.lambda_handler",
            code=_lambda.Code.from_asset("../backend"),
            timeout=cdk.Duration.seconds(30),
            memory_size=256,
            environment={
                "DYNAMODB_TABLE":            customers_table.table_name,
                "DOCUMENT_PROCESSING_TABLE": doc_processing_table.table_name,
                "CUSTOMER_INSIGHTS_TABLE":   insights_table.table_name,
                "S3_BUCKET":                 self.documents_bucket.bucket_name,
            },
        )

        # Grant the Lambda's auto-created role the necessary permissions
        for tbl in (customers_table, doc_processing_table, insights_table):
            tbl.grant_read_write_data(api_fn)
        self.documents_bucket.grant_read_write(api_fn)
        api_fn.add_to_role_policy(iam.PolicyStatement(
            actions=["bedrock:InvokeModel"],
            resources=["*"],
        ))
        api_fn.add_to_role_policy(iam.PolicyStatement(
            actions=["textract:DetectDocumentText", "textract:AnalyzeDocument"],
            resources=["*"],
        ))

        # ── API Gateway ───────────────────────────────────────────────────────
        api = apigw.RestApi(self, "Api",
            rest_api_name=f"{project_name}-api",
            default_cors_preflight_options=apigw.CorsOptions(
                allow_origins=apigw.Cors.ALL_ORIGINS,
                allow_methods=apigw.Cors.ALL_METHODS,
                allow_headers=["Content-Type", "Authorization", "x-document-type", "x-filename"],
            ),
        )
        integration = apigw.LambdaIntegration(api_fn)
        api.root.add_method("ANY", integration)
        api.root.add_resource("{proxy+}").add_method("ANY", integration)

        self.api_url = api.url

        # ── Outputs ───────────────────────────────────────────────────────────
        cdk.CfnOutput(self, "ApiUrlOutput", value=self.api_url, export_name=f"{project_name}-api-url")
        cdk.CfnOutput(self, "DocsBucketNameOutput", value=self.documents_bucket.bucket_name)
        cdk.CfnOutput(self, "CustomersTableOutput", value=customers_table.table_name)
