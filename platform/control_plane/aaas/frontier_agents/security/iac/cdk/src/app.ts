#!/usr/bin/env node
import "source-map-support/register";
import * as cdk from "aws-cdk-lib";
import { SecurityAgentStack } from "./security-agent-stack";

const app = new cdk.App();

// Parameters are injected via CDK context (-c key=value) by the pipeline
// buildspec; fall back to environment variables for local development.
const agentSpaceName =
  app.node.tryGetContext("agentSpaceName") ||
  process.env.AGENT_SPACE_NAME ||
  "FSIAgentKitSecurityAgentSpace-CDK";

const agentSpaceDescription =
  app.node.tryGetContext("agentSpaceDescription") ||
  process.env.AGENT_SPACE_DESCRIPTION ||
  "Security Agent Space provisioned by AVA - CDK";

const namePostfix =
  app.node.tryGetContext("namePostfix") ||
  process.env.NAME_POSTFIX ||
  "";

const externalId =
  app.node.tryGetContext("externalId") ||
  process.env.EXTERNAL_ID ||
  "";

// AWS::SecurityAgent::Application is a SINGLETON per AWS account. Default
// to false so re-deploys don't try to create a second Application. Set
// true on the FIRST deploy in an account.
const createApplicationRaw =
  app.node.tryGetContext("createApplication") ??
  process.env.CREATE_APPLICATION ??
  "false";
const createApplication = String(createApplicationRaw).toLowerCase() === "true";

const existingApplicationDomain =
  app.node.tryGetContext("existingApplicationDomain") ||
  process.env.EXISTING_APPLICATION_DOMAIN ||
  "";

const deployRegion =
  app.node.tryGetContext("awsRegion") ||
  process.env.AWS_TARGET_REGION ||
  process.env.CDK_DEFAULT_REGION ||
  "us-east-1";

const deployAccount =
  process.env.CDK_DEFAULT_ACCOUNT || undefined;

new SecurityAgentStack(app, "SecurityAgentStack", {
  agentSpaceName,
  agentSpaceDescription,
  namePostfix,
  externalId,
  createApplication,
  existingApplicationDomain,
  env: {
    account: deployAccount,
    region: deployRegion,
  },
});
