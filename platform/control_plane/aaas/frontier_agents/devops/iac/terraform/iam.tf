resource "random_id" "suffix" {
  byte_length = 4
}

locals {
  role_suffix = var.name_postfix != "" ? var.name_postfix : random_id.suffix.hex
}

data "aws_iam_policy_document" "devops_agentspace_trust" {
  statement {
    effect = "Allow"

    principals {
      type        = "Service"
      identifiers = ["aidevops.amazonaws.com"]
    }

    actions = ["sts:AssumeRole"]

    condition {
      test     = "StringEquals"
      variable = "aws:SourceAccount"
      values   = [data.aws_caller_identity.current.account_id]
    }

    condition {
      test     = "ArnLike"
      variable = "aws:SourceArn"
      values   = ["arn:aws:aidevops:${data.aws_region.current.name}:${data.aws_caller_identity.current.account_id}:agentspace/*"]
    }
  }
}

resource "aws_iam_role" "devops_agentspace" {
  name               = "DevOpsAgentRole-AgentSpace-${local.role_suffix}"
  assume_role_policy = data.aws_iam_policy_document.devops_agentspace_trust.json
  tags               = var.tags
}

resource "aws_iam_role_policy_attachment" "devops_agentspace_access" {
  role       = aws_iam_role.devops_agentspace.name
  policy_arn = "arn:aws:iam::aws:policy/AIDevOpsAgentAccessPolicy"
}

data "aws_iam_policy_document" "devops_agentspace_inline" {
  statement {
    sid     = "AllowCreateResourceExplorerServiceLinkedRole"
    effect  = "Allow"
    actions = ["iam:CreateServiceLinkedRole"]
    resources = [
      "arn:aws:iam::${data.aws_caller_identity.current.account_id}:role/aws-service-role/resource-explorer-2.amazonaws.com/AWSServiceRoleForResourceExplorer"
    ]
  }
}

resource "aws_iam_role_policy" "devops_agentspace_inline" {
  name   = "AllowCreateServiceLinkedRoles"
  role   = aws_iam_role.devops_agentspace.id
  policy = data.aws_iam_policy_document.devops_agentspace_inline.json
}

data "aws_iam_policy_document" "devops_operator_trust" {
  statement {
    effect = "Allow"

    principals {
      type        = "Service"
      identifiers = ["aidevops.amazonaws.com"]
    }

    actions = ["sts:AssumeRole", "sts:TagSession"]

    condition {
      test     = "StringEquals"
      variable = "aws:SourceAccount"
      values   = [data.aws_caller_identity.current.account_id]
    }

    condition {
      test     = "ArnLike"
      variable = "aws:SourceArn"
      values   = ["arn:aws:aidevops:${data.aws_region.current.name}:${data.aws_caller_identity.current.account_id}:agentspace/*"]
    }
  }
}

resource "aws_iam_role" "devops_operator" {
  name               = "DevOpsAgentRole-WebappAdmin-${local.role_suffix}"
  assume_role_policy = data.aws_iam_policy_document.devops_operator_trust.json
  tags               = var.tags
}

resource "aws_iam_role_policy_attachment" "devops_operator_access" {
  role       = aws_iam_role.devops_operator.name
  policy_arn = "arn:aws:iam::aws:policy/AIDevOpsOperatorAppAccessPolicy"
}
