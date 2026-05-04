#!/usr/bin/env node
import "source-map-support/register";
import * as cdk from "aws-cdk-lib";
import { DevOpsAgentStack } from "./devops-agent-stack";

const app = new cdk.App();

// Parameters are injected via CDK context (-c key=value) by the pipeline buildspec.
// Fallback to environment variables for local development.
const agentSpaceName =
  app.node.tryGetContext("agentSpaceName") ||
  process.env.AGENT_SPACE_NAME ||
  "FSIAgentKitAgentSpace-CDK";

const agentSpaceDescription =
  app.node.tryGetContext("agentSpaceDescription") ||
  process.env.AGENT_SPACE_DESCRIPTION ||
  "DevOps Agent Space provisioned by AVA - CDK";

const namePostfix =
  app.node.tryGetContext("namePostfix") ||
  process.env.NAME_POSTFIX ||
  "";

const deployRegion =
  app.node.tryGetContext("awsRegion") ||
  process.env.AWS_TARGET_REGION ||
  process.env.CDK_DEFAULT_REGION ||
  "us-east-1";

const deployAccount =
  process.env.CDK_DEFAULT_ACCOUNT || undefined;

new DevOpsAgentStack(app, "DevOpsAgentStack", {
  agentSpaceName,
  agentSpaceDescription,
  namePostfix,
  env: {
    account: deployAccount,
    region: deployRegion,
  },
});
