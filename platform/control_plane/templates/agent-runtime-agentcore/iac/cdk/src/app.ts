#!/usr/bin/env node
import "source-map-support/register";
import * as cdk from "aws-cdk-lib";
import { AgentRuntimeStack } from "./agent-runtime-stack";

const app = new cdk.App();

// Parameters via CDK context (-c key=value) with env var fallbacks.
const projectName =
  app.node.tryGetContext("projectName") ||
  process.env.PROJECT_NAME ||
  "my-agent";

const containerImageUri =
  app.node.tryGetContext("containerImageUri") ||
  process.env.CONTAINER_IMAGE_URI ||
  "";

const modelId =
  app.node.tryGetContext("modelId") ||
  process.env.MODEL_ID ||
  "us.anthropic.claude-sonnet-4-5-20250929-v1:0";

const deployRegion =
  app.node.tryGetContext("awsRegion") ||
  process.env.AWS_REGION ||
  process.env.CDK_DEFAULT_REGION ||
  "us-east-1";

const deployAccount =
  process.env.CDK_DEFAULT_ACCOUNT || undefined;

if (!containerImageUri) {
  throw new Error(
    "containerImageUri is required. Pass via -c containerImageUri=<uri> or CONTAINER_IMAGE_URI env var."
  );
}

new AgentRuntimeStack(app, `${projectName}-agentcore-runtime`, {
  projectName,
  containerImageUri,
  modelId,
  env: {
    account: deployAccount,
    region: deployRegion,
  },
});
