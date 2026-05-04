# ============================================================================
# CodeCommit Repository
# ============================================================================

resource "aws_codecommit_repository" "main" {
  repository_name = var.repository_name
  description     = var.repository_description

  tags = merge(var.tags, {
    Name = var.repository_name
  })
}

# ============================================================================
# CloudWatch Event Rule for CodeCommit Push Events
# ============================================================================

resource "aws_cloudwatch_event_rule" "codecommit_push" {
  count = var.enable_push_trigger ? 1 : 0

  name           = "${var.name_prefix}-codecommit-push"
  description    = "Trigger on CodeCommit push events"
  event_bus_name = var.event_bus_name

  event_pattern = jsonencode({
    source      = ["aws.codecommit"]
    detail-type = ["CodeCommit Repository State Change"]
    detail = {
      event          = ["referenceCreated", "referenceUpdated"]
      repositoryName = [aws_codecommit_repository.main.repository_name]
      referenceName  = var.trigger_branches
    }
  })

  tags = merge(var.tags, {
    Name = "${var.name_prefix}-codecommit-push"
  })
}

resource "aws_cloudwatch_event_target" "codecommit_push" {
  count = var.enable_push_trigger ? 1 : 0

  rule           = aws_cloudwatch_event_rule.codecommit_push[0].name
  event_bus_name = var.event_bus_name
  target_id      = "codecommit-deployment-trigger"
  arn            = var.step_functions_arn
  role_arn       = var.eventbridge_role_arn

  input_transformer {
    input_paths = {
      repository = "$.detail.repositoryName"
      branch     = "$.detail.referenceName"
      commitId   = "$.detail.commitId"
      account    = "$.account"
      region     = "$.region"
      eventTime  = "$.time"
    }

    input_template = <<-EOT
    {
      "source": "codecommit",
      "repository": <repository>,
      "branch": <branch>,
      "commitId": <commitId>,
      "account": <account>,
      "region": <region>,
      "eventTime": <eventTime>,
      "deploymentType": "codecommit-push",
      "triggerType": "git-push"
    }
    EOT
  }
}

# ============================================================================
# CloudWatch Event Rule for CodeCommit Pull Request Events
# ============================================================================

resource "aws_cloudwatch_event_rule" "codecommit_pr_merged" {
  count = var.enable_pr_trigger ? 1 : 0

  name           = "${var.name_prefix}-codecommit-pr-merged"
  description    = "Trigger on CodeCommit pull request merge"
  event_bus_name = var.event_bus_name

  event_pattern = jsonencode({
    source      = ["aws.codecommit"]
    detail-type = ["CodeCommit Pull Request State Change"]
    detail = {
      event                = ["pullRequestMergeStatusUpdated"]
      repositoryNames      = [aws_codecommit_repository.main.repository_name]
      pullRequestStatus    = ["Closed"]
      destinationReference = var.trigger_branches
    }
  })

  tags = merge(var.tags, {
    Name = "${var.name_prefix}-codecommit-pr-merged"
  })
}

resource "aws_cloudwatch_event_target" "codecommit_pr_merged" {
  count = var.enable_pr_trigger ? 1 : 0

  rule           = aws_cloudwatch_event_rule.codecommit_pr_merged[0].name
  event_bus_name = var.event_bus_name
  target_id      = "codecommit-pr-deployment-trigger"
  arn            = var.step_functions_arn
  role_arn       = var.eventbridge_role_arn

  input_transformer {
    input_paths = {
      repository     = "$.detail.repositoryNames[0]"
      pullRequestId  = "$.detail.pullRequestId"
      destinationRef = "$.detail.destinationReference"
      sourceRef      = "$.detail.sourceReference"
      commitId       = "$.detail.destinationCommit"
      account        = "$.account"
      region         = "$.region"
      eventTime      = "$.time"
    }

    input_template = <<-EOT
    {
      "source": "codecommit",
      "repository": <repository>,
      "branch": <destinationRef>,
      "commitId": <commitId>,
      "pullRequestId": <pullRequestId>,
      "sourceReference": <sourceRef>,
      "account": <account>,
      "region": <region>,
      "eventTime": <eventTime>,
      "deploymentType": "codecommit-pr-merge",
      "triggerType": "pull-request-merge"
    }
    EOT
  }
}

# ============================================================================
# SNS Topic for CodeCommit Notifications (Optional)
# ============================================================================

resource "aws_sns_topic" "codecommit_notifications" {
  count = var.enable_notifications ? 1 : 0

  name = "${var.name_prefix}-codecommit-notifications"

  tags = merge(var.tags, {
    Name = "${var.name_prefix}-codecommit-notifications"
  })
}

resource "aws_sns_topic_policy" "codecommit_notifications" {
  count = var.enable_notifications ? 1 : 0

  arn = aws_sns_topic.codecommit_notifications[0].arn

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid    = "AllowCodeCommitPublish"
        Effect = "Allow"
        Principal = {
          Service = "codecommit.amazonaws.com"
        }
        Action   = "SNS:Publish"
        Resource = aws_sns_topic.codecommit_notifications[0].arn
      }
    ]
  })
}

resource "aws_codecommit_trigger" "main" {
  count = var.enable_notifications ? 1 : 0

  repository_name = aws_codecommit_repository.main.repository_name

  trigger {
    name            = "all-branches"
    events          = ["all"]
    destination_arn = aws_sns_topic.codecommit_notifications[0].arn
  }
}

# ============================================================================
# IAM Policy for CodeCommit Access
# ============================================================================

resource "aws_iam_policy" "codecommit_read" {
  name        = "${var.name_prefix}-codecommit-read"
  description = "Read-only access to CodeCommit repository"

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = [
          "codecommit:GetBranch",
          "codecommit:GetCommit",
          "codecommit:GetRepository",
          "codecommit:ListBranches",
          "codecommit:ListRepositories",
          "codecommit:GitPull"
        ]
        Resource = aws_codecommit_repository.main.arn
      }
    ]
  })

  tags = var.tags
}

resource "aws_iam_policy" "codecommit_write" {
  name        = "${var.name_prefix}-codecommit-write"
  description = "Read-write access to CodeCommit repository"

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = [
          "codecommit:GetBranch",
          "codecommit:GetCommit",
          "codecommit:GetRepository",
          "codecommit:ListBranches",
          "codecommit:ListRepositories",
          "codecommit:GitPull",
          "codecommit:GitPush",
          "codecommit:CreateBranch",
          "codecommit:DeleteBranch",
          "codecommit:CreatePullRequest",
          "codecommit:MergePullRequestByFastForward"
        ]
        Resource = aws_codecommit_repository.main.arn
      }
    ]
  })

  tags = var.tags
}
