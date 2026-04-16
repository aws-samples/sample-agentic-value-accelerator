#!/usr/bin/env node
import 'source-map-support/register';
import * as cdk from 'aws-cdk-lib';
import { AgentCoreStack } from '../lib/agentcore-stack';

const app = new cdk.App();

// Template variables will be replaced during project generation:
// ${PROJECT_NAME}, ${AWS_REGION}, ${LANGFUSE_HOST}, ${LANGFUSE_PUBLIC_KEY}
const projectName = process.env.PROJECT_NAME || 'test-agent';
const region = process.env.AWS_REGION || 'us-east-1';
const langfuseHost = process.env.LANGFUSE_HOST || 'https://cloud.langfuse.com';
const langfusePublicKey = process.env.LANGFUSE_PUBLIC_KEY || 'pk-test-key';

new AgentCoreStack(app, `${projectName}-stack`, {
  projectName: projectName,
  region: region,
  langfuseHost: langfuseHost,
  langfusePublicKey: langfusePublicKey,
  env: {
    account: process.env.CDK_DEFAULT_ACCOUNT,
    region: region,
  },
});
