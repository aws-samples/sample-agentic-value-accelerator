import * as cdk from "aws-cdk-lib";
import { Construct } from "constructs";
import * as iam from "aws-cdk-lib/aws-iam";
import * as crypto from "crypto";

export interface SecurityAgentStackProps extends cdk.StackProps {
  /** Name for the Security Agent Space. */
  agentSpaceName: string;
  /** Description for the Security Agent Space. */
  agentSpaceDescription: string;
  /** Fixed suffix for IAM role names. Empty string -> random 4-byte hex. */
  namePostfix: string;
  /** External ID required for PenTest Service / Actor role assumption. Empty string -> random UUID. */
  externalId: string;
  /**
   * Create AWS::SecurityAgent::Application as part of this stack.
   * SINGLETON per AWS account — only one Application is allowed across the
   * whole account. Set true on the FIRST deployment in an account, false
   * on every subsequent deployment (and pass existingApplicationDomain).
   */
  createApplication: boolean;
  /**
   * Domain of the pre-existing Security Agent Application (e.g.
   * app-xxxxx.securityagent.global.app.aws). Required when
   * createApplication = false. Used to compose the operator app URL.
   */
  existingApplicationDomain: string;
}

const SERVICE_PRINCIPAL = "securityagent.amazonaws.com";

export class SecurityAgentStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props: SecurityAgentStackProps) {
    super(scope, id, props);

    const roleSuffix =
      props.namePostfix || `cdk-${crypto.randomBytes(4).toString("hex")}`;

    const externalId = props.externalId || crypto.randomUUID();

    // ─── Application Role ──────────────────────────────────────────────
    // Trusted by the Security Agent service to grant WebApp users the
    // permissions they need to interact with Security Agent APIs.
    const applicationRole = new iam.Role(this, "ApplicationRole", {
      roleName: `SecurityAgentRole-Application-${roleSuffix}`,
      assumedBy: new iam.ServicePrincipal(SERVICE_PRINCIPAL, {
        conditions: {
          StringEquals: { "aws:SourceAccount": this.account },
        },
      }),
      description:
        "Trusted by AWS Security Agent to grant WebApp users API access.",
      inlinePolicies: {
        SecurityAgentApplicationAccess: new iam.PolicyDocument({
          statements: [
            new iam.PolicyStatement({
              // Grant the WebApp full Security Agent access. Narrower scopes
              // cause "Failed to load agent instance" when the WebApp tries
              // to list AgentSpaces / Pentests / TargetDomains.
              effect: iam.Effect.ALLOW,
              actions: ["securityagent:*"],
              resources: ["*"],
            }),
          ],
        }),
      },
    });

    // ─── Penetration Test Service Role ─────────────────────────────────
    // Selected by WebApp users when launching a pentest. Security Agent
    // assumes this role to read AWS resources during testing. External ID
    // condition mirrors the reference pattern in the AWS docs.
    const pentestServiceRole = new iam.Role(this, "PenTestServiceRole", {
      roleName: `SecurityAgentRole-PenTestService-${roleSuffix}`,
      assumedBy: new iam.ServicePrincipal(SERVICE_PRINCIPAL, {
        conditions: {
          StringEquals: { "sts:ExternalId": externalId },
        },
      }),
      description:
        "Read-only role assumed by Security Agent during penetration testing.",
      managedPolicies: [
        iam.ManagedPolicy.fromAwsManagedPolicyName("SecurityAudit"),
        iam.ManagedPolicy.fromAwsManagedPolicyName(
          "job-function/ViewOnlyAccess"
        ),
      ],
    });

    // ─── Actor Role ────────────────────────────────────────────────────
    // Assumed by the agent to authenticate requests against the target
    // application during pentests. Defaults are wide on purpose; tighten
    // the inline policy after first deploy.
    const actorRole = new iam.Role(this, "ActorRole", {
      roleName: `SecurityAgentRole-Actor-${roleSuffix}`,
      assumedBy: new iam.ServicePrincipal(SERVICE_PRINCIPAL, {
        conditions: {
          StringEquals: { "sts:ExternalId": externalId },
        },
      }),
      description:
        "Assumed by Security Agent to authenticate requests against the target web application.",
      inlinePolicies: {
        SecurityAgentActorAccess: new iam.PolicyDocument({
          statements: [
            new iam.PolicyStatement({
              sid: "InvokeApplicationEndpoints",
              effect: iam.Effect.ALLOW,
              actions: [
                "execute-api:Invoke",
                "lambda:InvokeFunctionUrl",
                "lambda:InvokeFunction",
              ],
              resources: ["*"],
            }),
          ],
        }),
      },
    });

    // ─── Security Agent Application ────────────────────────────────────
    // Top-level app shell that the Security Agent console looks up to
    // surface Agent Spaces in the WebApp. SINGLETON per AWS account — set
    // createApplication = true only on the FIRST deploy in the account;
    // subsequent deploys must set false and pass existingApplicationDomain.
    let application: cdk.CfnResource | undefined;
    if (props.createApplication) {
      application = new cdk.CfnResource(this, "Application", {
        type: "AWS::SecurityAgent::Application",
        properties: {
          RoleArn: applicationRole.roleArn,
          Tags: [
            { Key: "Project", Value: "ava" },
            { Key: "Component", Value: "frontier-agents/security" },
          ],
        },
      });
      application.addDependency(applicationRole.node.defaultChild as cdk.CfnResource);
    } else if (!props.existingApplicationDomain) {
      throw new Error(
        "existingApplicationDomain is required when createApplication is false. " +
          "Find it via: aws cloudcontrol list-resources --type-name AWS::SecurityAgent::Application"
      );
    }
    const applicationDomain = application
      ? application.getAtt("Domain").toString()
      : props.existingApplicationDomain;

    // ─── Agent Space ───────────────────────────────────────────────────
    // Native CFN type AWS::SecurityAgent::AgentSpace. Only Name is
    // required; AwsResources / IntegratedResources / TargetDomainIds /
    // KmsKeyId stay unset so the WebApp can configure them per project.
    const agentSpace = new cdk.CfnResource(this, "AgentSpace", {
      type: "AWS::SecurityAgent::AgentSpace",
      properties: {
        Name: props.agentSpaceName,
        Description: props.agentSpaceDescription,
        Tags: [
          { Key: "Project", Value: "ava" },
          { Key: "Component", Value: "frontier-agents/security" },
        ],
      },
    });
    if (application) {
      agentSpace.addDependency(application);
    }
    agentSpace.addDependency(pentestServiceRole.node.defaultChild as cdk.CfnResource);
    agentSpace.addDependency(actorRole.node.defaultChild as cdk.CfnResource);

    // ─── Outputs (key names mirror the Terraform module) ───────────────
    new cdk.CfnOutput(this, "application_id", {
      value: application
        ? application.getAtt("ApplicationId").toString()
        : "",
      description:
        "ID of the Security Agent Application. Empty when reusing an existing Application.",
    });
    new cdk.CfnOutput(this, "application_domain", {
      value: applicationDomain,
      description:
        "Domain of the Security Agent Application. Echoes existingApplicationDomain when reusing an existing Application.",
    });
    new cdk.CfnOutput(this, "agent_space_id", {
      value: agentSpace.getAtt("AgentSpaceId").toString(),
      description: "ID of the created Security Agent Space.",
    });
    new cdk.CfnOutput(this, "operator_app_url", {
      value: `https://${applicationDomain}/${agentSpace.getAtt("AgentSpaceId").toString()}`,
      description:
        "URL of the Security Agent operator webapp for this Agent Space. Mirrors the DevOps Agent pattern (direct app domain). Requires an authenticated AWS console session in the browser.",
    });
    new cdk.CfnOutput(this, "agent_space_arn", {
      value: agentSpace.ref,
      description: "Reference (logical ID -> AgentSpaceId) of the created Security Agent Space.",
    });
    new cdk.CfnOutput(this, "agent_space_name", {
      value: props.agentSpaceName,
      description: "Name of the created Security Agent Space.",
    });
    new cdk.CfnOutput(this, "application_role_arn", {
      value: applicationRole.roleArn,
      description: "ARN of the Application Role used by the Security Agent WebApp.",
    });
    new cdk.CfnOutput(this, "pentest_service_role_arn", {
      value: pentestServiceRole.roleArn,
      description:
        "ARN of the PenTest Service Role. Selectable from the WebApp when launching a pentest.",
    });
    new cdk.CfnOutput(this, "actor_role_arn", {
      value: actorRole.roleArn,
      description:
        "ARN of the Actor Role used to authenticate against the target application.",
    });
    new cdk.CfnOutput(this, "external_id", {
      value: externalId,
      description:
        "External ID required when assuming the PenTest Service Role and Actor Role.",
    });
    new cdk.CfnOutput(this, "primary_account_id", {
      value: this.account,
      description: "Account ID where the Security Agent Space was created.",
    });
    new cdk.CfnOutput(this, "aws_region", {
      value: this.region,
      description: "AWS region the stack deployed into.",
    });
  }
}
