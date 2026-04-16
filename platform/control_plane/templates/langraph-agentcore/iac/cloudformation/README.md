# ${PROJECT_NAME} - AWS CloudFormation Infrastructure

This directory contains AWS CloudFormation infrastructure templates for deploying the ${PROJECT_NAME} agent using AWS AgentCore.

## Prerequisites

- AWS CLI configured with appropriate credentials
- CloudFormation permissions

## Configuration

The stack is configured via template parameters that are replaced during project generation:

- `PROJECT_NAME`: Your project name
- `LANGFUSE_HOST`: Langfuse observability endpoint
- `LANGFUSE_PUBLIC_KEY`: Langfuse public key

## Deployment

### Validate Template

```bash
aws cloudformation validate-template \
  --template-body file://template.yaml
```

### Create Stack

```bash
aws cloudformation create-stack \
  --stack-name ${PROJECT_NAME}-stack \
  --template-body file://template.yaml \
  --parameters \
    ParameterKey=ProjectName,ParameterValue=${PROJECT_NAME} \
    ParameterKey=LangfuseHost,ParameterValue=${LANGFUSE_HOST} \
    ParameterKey=LangfusePublicKey,ParameterValue=${LANGFUSE_PUBLIC_KEY} \
  --capabilities CAPABILITY_NAMED_IAM
```

### Update Stack

```bash
aws cloudformation update-stack \
  --stack-name ${PROJECT_NAME}-stack \
  --template-body file://template.yaml \
  --parameters \
    ParameterKey=ProjectName,ParameterValue=${PROJECT_NAME} \
    ParameterKey=LangfuseHost,ParameterValue=${LANGFUSE_HOST} \
    ParameterKey=LangfusePublicKey,ParameterValue=${LANGFUSE_PUBLIC_KEY} \
  --capabilities CAPABILITY_NAMED_IAM
```

### Delete Stack

```bash
aws cloudformation delete-stack \
  --stack-name ${PROJECT_NAME}-stack
```

### Monitor Stack Status

```bash
aws cloudformation describe-stacks \
  --stack-name ${PROJECT_NAME}-stack \
  --query 'Stacks[0].StackStatus'
```

### View Stack Outputs

```bash
aws cloudformation describe-stacks \
  --stack-name ${PROJECT_NAME}-stack \
  --query 'Stacks[0].Outputs'
```

## Architecture

This CloudFormation stack deploys:

- **AgentCore Gateway**: API endpoint for agent invocations
- **AgentCore Runtime**: Container-based agent execution environment
- **IAM Execution Role**: Role with Bedrock access for agent execution
- **Observability**: Langfuse integration for tracing

## Outputs

After deployment, the stack provides:

- **ProjectName**: Project identifier
- **ExecutionRoleArn**: IAM role ARN for agent execution
- **GatewayUrl**: Agent invocation endpoint (TODO)
- **RuntimeArn**: AgentCore runtime identifier (TODO)

## Change Sets

To preview changes before applying:

```bash
aws cloudformation create-change-set \
  --stack-name ${PROJECT_NAME}-stack \
  --change-set-name preview-changes \
  --template-body file://template.yaml \
  --parameters \
    ParameterKey=ProjectName,ParameterValue=${PROJECT_NAME} \
    ParameterKey=LangfuseHost,ParameterValue=${LANGFUSE_HOST} \
    ParameterKey=LangfusePublicKey,ParameterValue=${LANGFUSE_PUBLIC_KEY} \
  --capabilities CAPABILITY_NAMED_IAM

aws cloudformation describe-change-set \
  --stack-name ${PROJECT_NAME}-stack \
  --change-set-name preview-changes
```
