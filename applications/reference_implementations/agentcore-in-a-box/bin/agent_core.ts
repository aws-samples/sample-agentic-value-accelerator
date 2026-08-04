#!/usr/bin/env node
import * as cdk from 'aws-cdk-lib/core';
import { AgentCoreStack } from '../lib/agent_core-stack';

const app = new cdk.App();

// Optional environment suffix for parallel ("green") deployments. When DEMO_ENV
// is set (e.g. "test"), every physical resource name is suffixed so the stack can
// stand up alongside the live deployment without colliding with it. Empty by
// default → identical behavior to before.
const demoEnv = process.env.DEMO_ENV || '';
const stackName = demoEnv ? `AgentCoreDemoStack-${demoEnv}` : 'AgentCoreDemoStack';

new AgentCoreStack(app, stackName, {
  env: { account: process.env.CDK_DEFAULT_ACCOUNT, region: process.env.CDK_DEFAULT_REGION },
  demoEnv,
});
