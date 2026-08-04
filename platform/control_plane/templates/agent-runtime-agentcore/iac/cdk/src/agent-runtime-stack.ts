import * as cdk from "aws-cdk-lib";
import * as iam from "aws-cdk-lib/aws-iam";
import * as logs from "aws-cdk-lib/aws-logs";
import * as agentcore from "@aws-cdk/aws-bedrock-agentcore-alpha";
import { Construct } from "constructs";

export interface AgentRuntimeStackProps extends cdk.StackProps {
  projectName: string;
  containerImageUri: string;
  modelId: string;
}

export class AgentRuntimeStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props: AgentRuntimeStackProps) {
    super(scope, id, props);

    const { projectName, containerImageUri, modelId } = props;
    const runtimeName = projectName.replace(/-/g, "_") + "_runtime";

    // Log group for vended log delivery
    const logGroup = new logs.LogGroup(this, "RuntimeLogGroup", {
      logGroupName: `/aws/vendedlogs/bedrock-agentcore/${projectName}`,
      retention: logs.RetentionDays.ONE_MONTH,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    // AgentCore Runtime using L2 construct
    const runtime = new agentcore.Runtime(this, "AgentRuntime", {
      runtimeName,
      agentRuntimeArtifact:
        agentcore.AgentRuntimeArtifact.fromImageUri(containerImageUri),
      networkConfiguration:
        agentcore.RuntimeNetworkConfiguration.usingPublicNetwork(),
      description: `AgentCore runtime for ${projectName}`,
      tracingEnabled: true,
      loggingConfigs: [
        {
          logType: agentcore.LogType.APPLICATION_LOGS,
          destination: agentcore.LoggingDestination.cloudWatchLogs(logGroup),
        },
      ],
    });

    // Grant Bedrock model invocation to the runtime role
    runtime.addToRolePolicy(
      new iam.PolicyStatement({
        actions: [
          "bedrock:InvokeModel",
          "bedrock:InvokeModelWithResponseStream",
        ],
        resources: [
          `arn:aws:bedrock:${this.region}::foundation-model/${modelId}`,
        ],
      })
    );

    // Create an endpoint for invoking the runtime
    const endpoint = runtime.addEndpoint("default", {
      description: `Endpoint for ${projectName} agent runtime`,
    });

    // Outputs
    new cdk.CfnOutput(this, "RuntimeId", {
      value: runtime.agentRuntimeId,
      description: "AgentCore Runtime ID",
    });

    new cdk.CfnOutput(this, "RuntimeArn", {
      value: runtime.agentRuntimeArn,
      description: "AgentCore Runtime ARN",
    });

    new cdk.CfnOutput(this, "EndpointArn", {
      value: endpoint.agentRuntimeEndpointArn,
      description: "AgentCore Runtime Endpoint ARN",
    });

    new cdk.CfnOutput(this, "RoleArn", {
      value: runtime.role.roleArn,
      description: "IAM Role ARN used by the runtime",
    });

    new cdk.CfnOutput(this, "LogGroupName", {
      value: logGroup.logGroupName,
      description: "CloudWatch Log Group for vended log delivery",
    });
  }
}
