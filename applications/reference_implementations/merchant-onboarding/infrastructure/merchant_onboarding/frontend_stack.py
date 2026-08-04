"""
Frontend stack: S3 bucket + CloudFront distribution for the React dashboard.
Deploys ../frontend/build (CRA output) and injects runtime config.json.
"""
import json
import os
from pathlib import Path

import aws_cdk as cdk
from aws_cdk import (
    aws_s3 as s3,
    aws_s3_deployment as s3deploy,
    aws_cloudfront as cf,
    aws_cloudfront_origins as origins,
)
from constructs import Construct


class FrontendStack(cdk.Stack):
    def __init__(self, scope: Construct, construct_id: str,
                 project_name: str, api_url: str, **kwargs):
        super().__init__(scope, construct_id, **kwargs)

        removal = cdk.RemovalPolicy.DESTROY

        hosting = s3.Bucket(self, "FrontendBucket",
            bucket_name=f"{project_name}-frontend-{self.account}",
            removal_policy=removal,
            auto_delete_objects=True,
            block_public_access=s3.BlockPublicAccess.BLOCK_ALL,
        )

        oac = cf.S3OriginAccessControl(self, "OAC",
            signing=cf.Signing.SIGV4_NO_OVERRIDE,
        )

        # ── AVA FSI SSO edge auth (opt-in via env vars from CodeBuild) ──────
        # When AVA_FSI_APP_SIGNING_SECRET is set, attach a CloudFront Function
        # that HMAC-verifies handoff tokens minted by the AVA backend. See
        # jwt_auth_function.js for the flow; same pattern as FSI Foundry apps.
        signing_secret = os.environ.get("AVA_FSI_APP_SIGNING_SECRET", "")
        login_url = os.environ.get("AVA_UI_LOGIN_URL", "")
        auth_enabled = bool(signing_secret)

        jwt_function = None
        if auth_enabled:
            fn_source = (Path(__file__).parent / "jwt_auth_function.js").read_text()
            # Placeholder substitution — CDK has no templatefile() equivalent.
            fn_source = (fn_source
                .replace("__SIGNING_SECRET__", signing_secret)
                .replace("__LOGIN_URL__", login_url))
            jwt_function = cf.Function(self, "AvaSsoAuthFunction",
                function_name=f"{project_name}-jwt-{cdk.Aws.REGION.replace('-', '')}",
                code=cf.FunctionCode.from_inline(fn_source),
                runtime=cf.FunctionRuntime.JS_2_0,
                comment="AVA FSI SSO — HMAC-verifies handoff tokens minted by AVA backend",
            )

        distribution = cf.Distribution(self, "Distribution",
            default_behavior=cf.BehaviorOptions(
                origin=origins.S3BucketOrigin.with_origin_access_control(
                    hosting, origin_access_control=oac,
                ),
                viewer_protocol_policy=cf.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
                # CACHING_DISABLED alone is correct here: the CF Function reads
                # cookies from the *viewer* request via request.cookies (not from
                # the origin), so no origin_request_policy is needed. CloudFront
                # rejects AllViewerExceptHostHeader on S3 origins anyway — only
                # CORS-CustomOrigin, CORS-S3Origin, UserAgentRefererHeaders are
                # valid managed origin-request policies for S3 origins.
                cache_policy=cf.CachePolicy.CACHING_DISABLED,
                function_associations=(
                    [cf.FunctionAssociation(
                        function=jwt_function,
                        event_type=cf.FunctionEventType.VIEWER_REQUEST,
                    )] if auth_enabled else []
                ),
            ),
            default_root_object="index.html",
            error_responses=[
                cf.ErrorResponse(http_status=404, response_page_path="/index.html", response_http_status=200),
                cf.ErrorResponse(http_status=403, response_page_path="/index.html", response_http_status=200),
            ],
        )

        # Deploy the CRA build and inject config.json with the real API URL.
        # Source.data("config.json", ...) overrides the placeholder from public/config.json.
        config_content = json.dumps({
            "API_BASE_URL": api_url,
            "ENABLE_API_CALLS": True,
            "DEV_SETTINGS": {"LOG_API_CALLS": False, "TIMEOUT": 30000},
        })

        s3deploy.BucketDeployment(self, "Deploy",
            sources=[
                s3deploy.Source.asset("../frontend/dist"),
                s3deploy.Source.data("config.json", config_content),
            ],
            destination_bucket=hosting,
            distribution=distribution,
            distribution_paths=["/*"],
        )

        cdk.CfnOutput(self, "FrontendUrl",
            value=f"https://{distribution.distribution_domain_name}",
            export_name=f"{project_name}-frontend-url",
        )
        cdk.CfnOutput(self, "ui_url",
            value=f"https://{distribution.distribution_domain_name}",
        )
