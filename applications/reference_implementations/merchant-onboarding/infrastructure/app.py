#!/usr/bin/env python3
import os
import aws_cdk as cdk
from merchant_onboarding.onboarding_stack import OnboardingStack
from merchant_onboarding.frontend_stack import FrontendStack

app = cdk.App()

project_name = app.node.try_get_context("project_name") or os.environ.get("PROJECT_NAME", "merchant-onboarding")
region       = app.node.try_get_context("aws_region")    or os.environ.get("AWS_REGION", "us-east-2")

env = cdk.Environment(
    account=os.environ.get("CDK_DEFAULT_ACCOUNT"),
    region=region,
)

core = OnboardingStack(app, f"{project_name}-core", project_name=project_name, env=env)
FrontendStack(app, f"{project_name}-frontend", project_name=project_name,
              api_url=core.api_url, env=env)

app.synth()
