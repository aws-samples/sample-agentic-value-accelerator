# Wait for IAM role propagation before creating the Agent Space, mirroring
# the DevOps Agent module. The Security Agent service may validate role trust
# at create time, and IAM has eventually-consistent propagation delays.
resource "time_sleep" "wait_for_iam_propagation" {
  depends_on = [
    aws_iam_role.application,
    aws_iam_role_policy.application_inline,
    aws_iam_role.pentest_service,
    aws_iam_role_policy_attachment.pentest_security_audit,
    aws_iam_role_policy_attachment.pentest_view_only,
    aws_iam_role.actor,
    aws_iam_role_policy.actor_inline,
  ]

  create_duration = "30s"
}

# Security Agent Application — top-level app shell that the Security Agent
# console looks up to surface Agent Spaces in the WebApp. Created with
# IAM-only access (RoleArn = Application Role).
#
# IMPORTANT: AWS::SecurityAgent::Application is a SINGLETON per AWS account
# — only one Application is allowed across the entire account. The first
# deployment in an account must set var.create_application = true to
# bootstrap it; every subsequent deployment must set it to false and pass
# var.existing_application_domain so the operator_app_url output composes
# correctly.
resource "awscc_securityagent_application" "main" {
  count    = var.create_application ? 1 : 0
  role_arn = aws_iam_role.application.arn

  tags = [
    for k, v in var.tags : {
      key   = k
      value = v
    }
  ]

  depends_on = [time_sleep.wait_for_iam_propagation]
}

locals {
  # Domain used to compose the operator URL. Pulls from the new Application
  # when var.create_application is true, otherwise from the user-supplied
  # existing_application_domain.
  application_domain = var.create_application ? awscc_securityagent_application.main[0].domain : var.existing_application_domain
}

# Security Agent Space — uses the AWS::SecurityAgent::AgentSpace native CFN
# type via the awscc provider. Only Name is required by the spec; we
# additionally set Description and Tags. AwsResources/IntegratedResources/
# TargetDomainIds are deferred to user configuration in the WebApp.
resource "awscc_securityagent_agent_space" "main" {
  name        = var.agent_space_name
  description = var.agent_space_description

  tags = [
    for k, v in var.tags : {
      key   = k
      value = v
    }
  ]

  depends_on = [
    time_sleep.wait_for_iam_propagation,
    awscc_securityagent_application.main,
  ]
}
