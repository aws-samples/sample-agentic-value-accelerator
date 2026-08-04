resource "random_id" "suffix" {
  byte_length = 4
}

resource "random_uuid" "external_id" {}

locals {
  role_suffix = var.name_postfix != "" ? var.name_postfix : random_id.suffix.hex
  external_id = var.external_id != "" ? var.external_id : random_uuid.external_id.result
}

# ─── Application Role ─────────────────────────────────────────────────────
# Assumed by the Security Agent service to grant WebApp users permissions to
# interact with AWS Security Agent APIs.

data "aws_iam_policy_document" "application_trust" {
  statement {
    effect = "Allow"

    principals {
      type        = "Service"
      identifiers = ["securityagent.amazonaws.com"]
    }

    actions = ["sts:AssumeRole"]

    condition {
      test     = "StringEquals"
      variable = "aws:SourceAccount"
      values   = [data.aws_caller_identity.current.account_id]
    }
  }
}

resource "aws_iam_role" "application" {
  name               = "SecurityAgentRole-Application-${local.role_suffix}"
  assume_role_policy = data.aws_iam_policy_document.application_trust.json
  description        = "Trusted by AWS Security Agent to grant WebApp users API access."
  tags               = var.tags
}

data "aws_iam_policy_document" "application_inline" {
  statement {
    effect = "Allow"
    # Grant the WebApp full Security Agent access. The Application Role is
    # only assumed by securityagent.amazonaws.com on behalf of WebApp users
    # (never as a service identity), so the blast radius is bounded by the
    # users you grant WebApp access to. Narrower scopes (just GetApplication
    # + ListAgentInstances) cause "Failed to load agent instance" errors
    # when the WebApp tries to list AgentSpaces, Pentests, TargetDomains, etc.
    actions   = ["securityagent:*"]
    resources = ["*"]
  }
}

resource "aws_iam_role_policy" "application_inline" {
  name   = "SecurityAgentApplicationAccess"
  role   = aws_iam_role.application.id
  policy = data.aws_iam_policy_document.application_inline.json
}

# ─── Penetration Test Service Role ────────────────────────────────────────
# Selected by WebApp users when creating a penetration test. Security Agent
# assumes this role to read and analyze AWS resources during testing.

data "aws_iam_policy_document" "pentest_service_trust" {
  statement {
    effect = "Allow"

    principals {
      type        = "Service"
      identifiers = ["securityagent.amazonaws.com"]
    }

    actions = ["sts:AssumeRole"]

    condition {
      test     = "StringEquals"
      variable = "sts:ExternalId"
      values   = [local.external_id]
    }
  }
}

resource "aws_iam_role" "pentest_service" {
  name               = "SecurityAgentRole-PenTestService-${local.role_suffix}"
  assume_role_policy = data.aws_iam_policy_document.pentest_service_trust.json
  description        = "Read-only role assumed by Security Agent during penetration testing."
  tags               = var.tags
}

# Use AWS-managed read-only/security-audit policies. Customers can layer on
# tighter custom policies after deployment if their pentest scope needs it.
resource "aws_iam_role_policy_attachment" "pentest_security_audit" {
  role       = aws_iam_role.pentest_service.name
  policy_arn = "arn:aws:iam::aws:policy/SecurityAudit"
}

resource "aws_iam_role_policy_attachment" "pentest_view_only" {
  role       = aws_iam_role.pentest_service.name
  policy_arn = "arn:aws:iam::aws:policy/job-function/ViewOnlyAccess"
}

# ─── Actor Role ───────────────────────────────────────────────────────────
# Assumed by the Security Agent agent to authenticate requests to the target
# web application during penetration testing. Permissions here depend on the
# target — by default we grant invoke for API Gateway / Lambda; tighten or
# replace these for your specific app.

data "aws_iam_policy_document" "actor_trust" {
  statement {
    effect = "Allow"

    principals {
      type        = "Service"
      identifiers = ["securityagent.amazonaws.com"]
    }

    actions = ["sts:AssumeRole"]

    condition {
      test     = "StringEquals"
      variable = "sts:ExternalId"
      values   = [local.external_id]
    }
  }
}

resource "aws_iam_role" "actor" {
  name               = "SecurityAgentRole-Actor-${local.role_suffix}"
  assume_role_policy = data.aws_iam_policy_document.actor_trust.json
  description        = "Assumed by Security Agent to authenticate requests against the target web application."
  tags               = var.tags
}

data "aws_iam_policy_document" "actor_inline" {
  statement {
    sid     = "InvokeApplicationEndpoints"
    effect  = "Allow"
    actions = [
      "execute-api:Invoke",
      "lambda:InvokeFunctionUrl",
      "lambda:InvokeFunction",
    ]
    # Default to wildcard so the agent can target any user-owned API/Lambda.
    # Customers should narrow these to their target app after first deploy.
    resources = ["*"]
  }
}

resource "aws_iam_role_policy" "actor_inline" {
  name   = "SecurityAgentActorAccess"
  role   = aws_iam_role.actor.id
  policy = data.aws_iam_policy_document.actor_inline.json
}
