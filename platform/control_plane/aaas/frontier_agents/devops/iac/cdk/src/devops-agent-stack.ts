import * as cdk from "aws-cdk-lib";
import { Construct } from "constructs";
import * as iam from "aws-cdk-lib/aws-iam";
import * as devopsagent from "aws-cdk-lib/aws-devopsagent";
import * as crypto from "crypto";

export interface DevOpsAgentStackProps extends cdk.StackProps {
  /** Name for the DevOps Agent Space. */
  agentSpaceName: string;
  /** Description for the DevOps Agent Space. */
  agentSpaceDescription: string;
  /** Fixed suffix for IAM role names. Empty string → random 4-byte hex. */
  namePostfix: string;
}

export class DevOpsAgentStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props: DevOpsAgentStackProps) {
    super(scope, id, props);

    const roleSuffix =
      props.namePostfix || `cdk-${crypto.randomBytes(4).toString("hex")}`;

    // --- IAM: Agent Space role (assumed by the DevOps Agent service) ---
    const agentSpaceRole = new iam.Role(this, "DevOpsAgentSpaceRole", {
      roleName: `DevOpsAgentRole-AgentSpace-${roleSuffix}`,
      assumedBy: new iam.ServicePrincipal("aidevops.amazonaws.com", {
        conditions: {
          StringEquals: { "aws:SourceAccount": this.account },
          ArnLike: {
            "aws:SourceArn": `arn:aws:aidevops:${this.region}:${this.account}:agentspace/*`,
          },
        },
      }),
      managedPolicies: [
        iam.ManagedPolicy.fromAwsManagedPolicyName(
          "AIDevOpsAgentAccessPolicy"
        ),
      ],
      inlinePolicies: {
        AllowCreateServiceLinkedRoles: new iam.PolicyDocument({
          statements: [
            new iam.PolicyStatement({
              sid: "AllowCreateResourceExplorerServiceLinkedRole",
              effect: iam.Effect.ALLOW,
              actions: ["iam:CreateServiceLinkedRole"],
              resources: [
                `arn:aws:iam::${this.account}:role/aws-service-role/resource-explorer-2.amazonaws.com/AWSServiceRoleForResourceExplorer`,
              ],
            }),
          ],
        }),
      },
    });

    // --- IAM: Operator App role (webapp admin) ---
    const operatorRole = new iam.Role(this, "DevOpsOperatorRole", {
      roleName: `DevOpsAgentRole-WebappAdmin-${roleSuffix}`,
      assumedBy: new iam.ServicePrincipal("aidevops.amazonaws.com"),
      managedPolicies: [
        iam.ManagedPolicy.fromAwsManagedPolicyName(
          "AIDevOpsOperatorAppAccessPolicy"
        ),
      ],
    });

    // Override trust policy to include both sts:AssumeRole and sts:TagSession
    const trustPolicy = new iam.PolicyDocument({
      statements: [
        new iam.PolicyStatement({
          effect: iam.Effect.ALLOW,
          principals: [new iam.ServicePrincipal("aidevops.amazonaws.com")],
          actions: ["sts:AssumeRole", "sts:TagSession"],
          conditions: {
            StringEquals: { "aws:SourceAccount": this.account },
            ArnLike: {
              "aws:SourceArn": `arn:aws:aidevops:${this.region}:${this.account}:agentspace/*`,
            },
          },
        }),
      ],
    });
    (operatorRole.node.defaultChild as iam.CfnRole).assumeRolePolicyDocument =
      trustPolicy;

    // --- Agent Space ---
    const agentSpace = new devopsagent.CfnAgentSpace(this, "AgentSpace", {
      name: props.agentSpaceName,
      description: props.agentSpaceDescription,
      operatorApp: {
        iam: {
          operatorAppRoleArn: operatorRole.roleArn,
        },
      },
    });
    agentSpace.addDependency(
      agentSpaceRole.node.defaultChild as cdk.CfnResource
    );
    agentSpace.addDependency(
      operatorRole.node.defaultChild as cdk.CfnResource
    );

    // --- Primary account association ---
    const primaryAssociation = new devopsagent.CfnAssociation(
      this,
      "PrimaryAWSAssociation",
      {
        agentSpaceId: agentSpace.ref,
        serviceId: "aws",
        configuration: {
          aws: {
            assumableRoleArn: agentSpaceRole.roleArn,
            accountId: this.account,
            accountType: "monitor",
            resources: [],
          },
        },
      }
    );
    primaryAssociation.addDependency(agentSpace);

    // --- Outputs (matching Terraform module key names for UI compatibility) ---
    new cdk.CfnOutput(this, "agent_space_id", {
      value: agentSpace.ref,
      description: "ID of the created Agent Space.",
    });

    new cdk.CfnOutput(this, "agent_space_arn", {
      value: agentSpace.attrArn,
      description: "ARN of the created Agent Space.",
    });

    new cdk.CfnOutput(this, "agent_space_name", {
      value: props.agentSpaceName,
      description: "Name of the created Agent Space.",
    });

    new cdk.CfnOutput(this, "operator_app_url", {
      value: `https://${agentSpace.ref}.aidevops.global.app.aws/home`,
      description: "URL of the DevOps Agent operator webapp.",
    });

    new cdk.CfnOutput(this, "devops_agentspace_role_arn", {
      value: agentSpaceRole.roleArn,
      description:
        "ARN of the IAM role assumed by the Agent Space to monitor the primary account.",
    });

    new cdk.CfnOutput(this, "devops_operator_role_arn", {
      value: operatorRole.roleArn,
      description: "ARN of the operator-app IAM role.",
    });

    new cdk.CfnOutput(this, "primary_account_id", {
      value: this.account,
      description: "Account ID of the primary (monitoring) account.",
    });

    new cdk.CfnOutput(this, "primary_account_association_id", {
      value: primaryAssociation.attrAssociationId,
      description: "ID of the primary AWS account association.",
    });

    new cdk.CfnOutput(this, "aws_region", {
      value: this.region,
      description: "AWS region the stack deployed into.",
    });
  }
}
