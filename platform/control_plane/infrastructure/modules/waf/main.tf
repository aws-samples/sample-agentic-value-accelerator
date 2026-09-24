# ============================================================================
# WAFv2 Web ACL — Bot Control for CloudFront
# ============================================================================
#
# AWS-managed rule set that scores every request and challenges suspected bots.
# Scope MUST be CLOUDFRONT and the resource must be created in us-east-1 (this
# stack is already in us-east-1, so no provider aliasing is needed).
#
# Bot Control has three inspection levels: COMMON, TARGETED, and TARGETED_ML.
# COMMON is the base tier — sufficient for a demo console. Upgrade to TARGETED
# if credential-stuffing traffic actually shows up in the logs; it costs more
# per request but adds device-fingerprint + behavior checks.

resource "aws_wafv2_web_acl" "bot_control" {
  provider    = aws.us_east_1
  name        = "${var.name_prefix}-bot-control"
  description = "Bot Control for the AVA control-plane frontend"
  scope       = "CLOUDFRONT"

  default_action {
    allow {}
  }

  # ---- Managed rule: AWS Bot Control (COMMON) --------------------------------
  rule {
    name     = "AWS-AWSManagedRulesBotControlRuleSet"
    priority = 10

    override_action {
      # 'none' means the rule set's own actions (Block / Challenge / Count) apply.
      # Use 'count' during initial rollout to observe without user impact, then
      # flip to 'none' once the false-positive rate is understood.
      none {}
    }

    statement {
      managed_rule_group_statement {
        vendor_name = "AWS"
        name        = "AWSManagedRulesBotControlRuleSet"
        managed_rule_group_configs {
          aws_managed_rules_bot_control_rule_set {
            inspection_level = "COMMON"
          }
        }
      }
    }

    visibility_config {
      cloudwatch_metrics_enabled = true
      metric_name                = "${var.name_prefix}-bot-control"
      sampled_requests_enabled   = true
    }
  }

  # ---- Managed rule: Common Rule Set (OWASP-style baseline) ------------------
  # Cheap defense in depth — blocks well-known bad patterns (SQLi, XSS,
  # oversized bodies) that Bot Control does not target.
  rule {
    name     = "AWS-AWSManagedRulesCommonRuleSet"
    priority = 20

    override_action {
      none {}
    }

    statement {
      managed_rule_group_statement {
        vendor_name = "AWS"
        name        = "AWSManagedRulesCommonRuleSet"
      }
    }

    visibility_config {
      cloudwatch_metrics_enabled = true
      metric_name                = "${var.name_prefix}-common-rules"
      sampled_requests_enabled   = true
    }
  }

  visibility_config {
    cloudwatch_metrics_enabled = true
    metric_name                = "${var.name_prefix}-acl"
    sampled_requests_enabled   = true
  }

  tags = merge(var.tags, {
    Name = "${var.name_prefix}-bot-control"
  })
}
