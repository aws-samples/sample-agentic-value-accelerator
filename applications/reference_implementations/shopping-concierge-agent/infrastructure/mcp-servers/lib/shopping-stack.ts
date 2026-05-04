import * as cdk from 'aws-cdk-lib';
import * as fs from 'fs';
import { Construct } from 'constructs';
import { BaseMcpStack } from './base-mcp-stack';

const deploymentConfig = JSON.parse(fs.readFileSync('../../deployment-config.json', 'utf-8'));
const DEPLOYMENT_ID = deploymentConfig.deploymentId;

export class ShoppingStack extends BaseMcpStack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, {
      ...props,
      mcpName: 'shopping',
      agentCodePath: 'concierge_agent/mcp_shopping_tools',
      ssmParameters: [
        `/concierge-agent/${DEPLOYMENT_ID}/serp-api-key`
      ]
    });
  }
}
