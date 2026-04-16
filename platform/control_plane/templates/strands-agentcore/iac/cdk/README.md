# ${PROJECT_NAME} - AWS CDK Infrastructure

This directory contains AWS CDK infrastructure code for deploying the ${PROJECT_NAME} agent using AWS AgentCore.

## Prerequisites

- Node.js 18+ and npm
- AWS CLI configured with appropriate credentials
- AWS CDK CLI: `npm install -g aws-cdk`

## Setup

Install dependencies:

```bash
npm install
```

## Configuration

The stack is configured via template variables that are replaced during project generation:

- `PROJECT_NAME`: Your project name
- `AWS_REGION`: Target AWS region
- `LANGFUSE_HOST`: Langfuse observability endpoint
- `LANGFUSE_PUBLIC_KEY`: Langfuse public key

## Useful Commands

- `npm run build` - Compile TypeScript to JavaScript
- `npm run watch` - Watch for changes and compile
- `npm run cdk synth` - Synthesize CloudFormation template
- `npm run cdk deploy` - Deploy stack to AWS
- `npm run cdk destroy` - Remove stack from AWS
- `cdk diff` - Compare deployed stack with current state

## Architecture

This CDK stack deploys:

- **AgentCore Gateway**: API endpoint for agent invocations
- **AgentCore Runtime**: Container-based agent execution environment
- **IAM Roles**: Execution roles with Bedrock access
- **Observability**: Langfuse integration for tracing

## Deployment

1. Bootstrap CDK (first time only):
   ```bash
   cdk bootstrap aws://ACCOUNT-ID/REGION
   ```

2. Review changes:
   ```bash
   npm run cdk synth
   ```

3. Deploy:
   ```bash
   npm run cdk deploy
   ```

## Outputs

After deployment, the stack outputs:

- Gateway URL: Agent invocation endpoint
- Runtime ARN: AgentCore runtime identifier
