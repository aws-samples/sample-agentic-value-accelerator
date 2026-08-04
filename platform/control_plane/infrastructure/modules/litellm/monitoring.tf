# =============================================================================
# LiteLLM Gateway Module - CloudWatch Monitoring, Alarms, and Dashboard
# =============================================================================
# Implements:
#   - SNS topic for alarm notifications
#   - CloudWatch metric filters to extract custom metrics from log group
#   - CloudWatch alarms: error rate, high latency, unhealthy hosts, RDS CPU,
#     Redis memory
#   - CloudWatch dashboard for gateway metrics (requests, latency, errors,
#     host health, RDS, Redis)
#
# NOTE: The log group (/ecs/ava-litellm) with 30-day retention is defined in
#       main.tf as aws_cloudwatch_log_group.litellm. This file only adds
#       monitoring on top of it.
#
# Task: 1.7
# Requirements: 1.4, 9.4, 9.5
# =============================================================================

# -----------------------------------------------------------------------------
# SNS Topic for Alarm Notifications
# -----------------------------------------------------------------------------
# Operators can subscribe their email or Slack webhook post-deploy.
# -----------------------------------------------------------------------------

resource "aws_sns_topic" "gateway_alarms" {
  name = "${local.resource_prefix}-alarms"

  tags = merge(local.tags, {
    Name = "${local.resource_prefix}-alarms-topic"
  })
}

resource "aws_sns_topic_policy" "gateway_alarms" {
  arn = aws_sns_topic.gateway_alarms.arn

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid    = "AllowCloudWatchPublish"
        Effect = "Allow"
        Principal = {
          Service = "cloudwatch.amazonaws.com"
        }
        Action   = "SNS:Publish"
        Resource = aws_sns_topic.gateway_alarms.arn
        Condition = {
          StringEquals = {
            "aws:SourceAccount" = local.account_id
          }
        }
      }
    ]
  })
}

# -----------------------------------------------------------------------------
# Metric Filters - Extract custom metrics from gateway logs
# -----------------------------------------------------------------------------
# These filters parse LiteLLM container logs to produce custom CloudWatch
# metrics in the AVA/Gateway namespace.
# -----------------------------------------------------------------------------

resource "aws_cloudwatch_log_metric_filter" "request_count" {
  name           = "${local.resource_prefix}-request-count"
  pattern        = "{ $.status_code = * }"
  log_group_name = aws_cloudwatch_log_group.litellm.name

  metric_transformation {
    name          = "RequestCount"
    namespace     = "AVA/Gateway"
    value         = "1"
    default_value = "0"
  }
}

resource "aws_cloudwatch_log_metric_filter" "error_count" {
  name           = "${local.resource_prefix}-error-count"
  pattern        = "{ $.status_code >= 500 }"
  log_group_name = aws_cloudwatch_log_group.litellm.name

  metric_transformation {
    name          = "ErrorCount"
    namespace     = "AVA/Gateway"
    value         = "1"
    default_value = "0"
  }
}

resource "aws_cloudwatch_log_metric_filter" "latency" {
  name           = "${local.resource_prefix}-latency"
  pattern        = "{ $.response_time = * }"
  log_group_name = aws_cloudwatch_log_group.litellm.name

  metric_transformation {
    name          = "ResponseTime"
    namespace     = "AVA/Gateway"
    value         = "$.response_time"
    default_value = "0"
  }
}

resource "aws_cloudwatch_log_metric_filter" "cache_hit" {
  name           = "${local.resource_prefix}-cache-hit"
  pattern        = "\"cache_hit\""
  log_group_name = aws_cloudwatch_log_group.litellm.name

  metric_transformation {
    name          = "CacheHitCount"
    namespace     = "AVA/Gateway"
    value         = "1"
    default_value = "0"
  }
}

resource "aws_cloudwatch_log_metric_filter" "cache_miss" {
  name           = "${local.resource_prefix}-cache-miss"
  pattern        = "\"cache_miss\""
  log_group_name = aws_cloudwatch_log_group.litellm.name

  metric_transformation {
    name          = "CacheMissCount"
    namespace     = "AVA/Gateway"
    value         = "1"
    default_value = "0"
  }
}

# Metric filter for circuit breaker state transitions
resource "aws_cloudwatch_log_metric_filter" "circuit_breaker_transitions" {
  name           = "${local.resource_prefix}-circuit-breaker-transitions"
  pattern        = "\"circuit_breaker_state_transitions\""
  log_group_name = aws_cloudwatch_log_group.litellm.name

  metric_transformation {
    name          = "CircuitBreakerStateTransitions"
    namespace     = "AVA/Gateway"
    value         = "1"
    default_value = "0"
  }
}

# Metric filter for fallback activations
resource "aws_cloudwatch_log_metric_filter" "fallback_activations" {
  name           = "${local.resource_prefix}-fallback-activations"
  pattern        = "\"fallback_activations\""
  log_group_name = aws_cloudwatch_log_group.litellm.name

  metric_transformation {
    name          = "FallbackActivations"
    namespace     = "AVA/Gateway"
    value         = "1"
    default_value = "0"
  }
}

# Metric filter for gateway recovery events
resource "aws_cloudwatch_log_metric_filter" "gateway_recovery" {
  name           = "${local.resource_prefix}-gateway-recovery"
  pattern        = "\"gateway_recovery_events\""
  log_group_name = aws_cloudwatch_log_group.litellm.name

  metric_transformation {
    name          = "GatewayRecoveryEvents"
    namespace     = "AVA/Gateway"
    value         = "1"
    default_value = "0"
  }
}

# -----------------------------------------------------------------------------
# CloudWatch Alarms
# -----------------------------------------------------------------------------

# Alarm 1: High Error Rate — ALB 5xx count > 5% of total requests over 5 min
resource "aws_cloudwatch_metric_alarm" "high_error_rate" {
  alarm_name          = "${local.resource_prefix}-high-error-rate"
  alarm_description   = "Gateway error rate exceeds 5% over 5-minute window (Req 9.5)"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 1
  threshold           = 5
  treat_missing_data  = "notBreaching"

  metric_query {
    id          = "error_rate"
    expression  = "(errors / requests) * 100"
    label       = "Error Rate (%)"
    return_data = true
  }

  metric_query {
    id = "errors"

    metric {
      metric_name = "HTTPCode_Target_5XX_Count"
      namespace   = "AWS/ApplicationELB"
      period      = 300
      stat        = "Sum"

      dimensions = {
        LoadBalancer = aws_lb.litellm.arn_suffix
        TargetGroup  = aws_lb_target_group.litellm.arn_suffix
      }
    }
  }

  metric_query {
    id = "requests"

    metric {
      metric_name = "RequestCount"
      namespace   = "AWS/ApplicationELB"
      period      = 300
      stat        = "Sum"

      dimensions = {
        LoadBalancer = aws_lb.litellm.arn_suffix
        TargetGroup  = aws_lb_target_group.litellm.arn_suffix
      }
    }
  }

  alarm_actions = [aws_sns_topic.gateway_alarms.arn]
  ok_actions    = [aws_sns_topic.gateway_alarms.arn]

  tags = merge(local.tags, {
    Name = "${local.resource_prefix}-high-error-rate-alarm"
  })
}

# Alarm 2: High Latency — ALB target response time p95 > 5 seconds over 5 min
resource "aws_cloudwatch_metric_alarm" "high_latency" {
  alarm_name          = "${local.resource_prefix}-high-latency"
  alarm_description   = "Gateway p95 latency exceeds 5 seconds over 5-minute window"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 1
  threshold           = 5
  metric_name         = "TargetResponseTime"
  namespace           = "AWS/ApplicationELB"
  period              = 300
  extended_statistic  = "p95"
  treat_missing_data  = "notBreaching"

  dimensions = {
    LoadBalancer = aws_lb.litellm.arn_suffix
    TargetGroup  = aws_lb_target_group.litellm.arn_suffix
  }

  alarm_actions = [aws_sns_topic.gateway_alarms.arn]
  ok_actions    = [aws_sns_topic.gateway_alarms.arn]

  tags = merge(local.tags, {
    Name = "${local.resource_prefix}-high-latency-alarm"
  })
}

# Alarm 3: Unhealthy Hosts — UnHealthyHostCount > 0 for 3 minutes
resource "aws_cloudwatch_metric_alarm" "unhealthy_hosts" {
  alarm_name          = "${local.resource_prefix}-unhealthy-hosts"
  alarm_description   = "One or more gateway targets are unhealthy for 3+ minutes"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 3
  threshold           = 0
  metric_name         = "UnHealthyHostCount"
  namespace           = "AWS/ApplicationELB"
  period              = 60
  statistic           = "Maximum"
  treat_missing_data  = "notBreaching"

  dimensions = {
    LoadBalancer = aws_lb.litellm.arn_suffix
    TargetGroup  = aws_lb_target_group.litellm.arn_suffix
  }

  alarm_actions = [aws_sns_topic.gateway_alarms.arn]
  ok_actions    = [aws_sns_topic.gateway_alarms.arn]

  tags = merge(local.tags, {
    Name = "${local.resource_prefix}-unhealthy-hosts-alarm"
  })
}

# Alarm 4: RDS CPU — CPUUtilization > 80% for 5 minutes
resource "aws_cloudwatch_metric_alarm" "rds_cpu" {
  alarm_name          = "${local.resource_prefix}-rds-high-cpu"
  alarm_description   = "RDS PostgreSQL CPU utilization exceeds 80% for 5 minutes"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 1
  threshold           = 80
  metric_name         = "CPUUtilization"
  namespace           = "AWS/RDS"
  period              = 300
  statistic           = "Average"
  treat_missing_data  = "missing"

  dimensions = {
    DBInstanceIdentifier = aws_db_instance.litellm.identifier
  }

  alarm_actions = [aws_sns_topic.gateway_alarms.arn]
  ok_actions    = [aws_sns_topic.gateway_alarms.arn]

  tags = merge(local.tags, {
    Name = "${local.resource_prefix}-rds-high-cpu-alarm"
  })
}

# Alarm 5: Redis Memory — DatabaseMemoryUsagePercentage > 80% for 5 minutes
resource "aws_cloudwatch_metric_alarm" "redis_memory" {
  alarm_name          = "${local.resource_prefix}-redis-high-memory"
  alarm_description   = "ElastiCache Redis memory usage exceeds 80% for 5 minutes"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 1
  threshold           = 80
  metric_name         = "DatabaseMemoryUsagePercentage"
  namespace           = "AWS/ElastiCache"
  period              = 300
  statistic           = "Average"
  treat_missing_data  = "missing"

  dimensions = {
    ReplicationGroupId = aws_elasticache_replication_group.litellm.replication_group_id
  }

  alarm_actions = [aws_sns_topic.gateway_alarms.arn]
  ok_actions    = [aws_sns_topic.gateway_alarms.arn]

  tags = merge(local.tags, {
    Name = "${local.resource_prefix}-redis-high-memory-alarm"
  })
}

# Alarm 6: Deployment Health Check Failure — Tracks failed ECS deployments
# Requirement 16.4: Rollback on health check failure within 5 minutes.
# This alarm monitors ECS service deployment state and triggers when the
# circuit breaker initiates a rollback due to health check failures.
resource "aws_cloudwatch_metric_alarm" "deployment_failure" {
  alarm_name          = "${local.resource_prefix}-deployment-failure"
  alarm_description   = "ECS deployment circuit breaker triggered rollback due to health check failures within 5 minutes (Req 16.4)"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 1
  threshold           = 0
  metric_name         = "DeploymentRollback"
  namespace           = "AWS/ECS"
  period              = 300
  statistic           = "Sum"
  treat_missing_data  = "notBreaching"

  dimensions = {
    ServiceName = aws_ecs_service.litellm.name
    ClusterName = local.ecs_cluster_name
  }

  alarm_actions = [aws_sns_topic.gateway_alarms.arn]
  ok_actions    = [aws_sns_topic.gateway_alarms.arn]

  tags = merge(local.tags, {
    Name = "${local.resource_prefix}-deployment-failure-alarm"
  })
}

# -----------------------------------------------------------------------------
# CloudWatch Dashboard
# -----------------------------------------------------------------------------
# Provides a single-pane-of-glass view for gateway operations including:
#   - Request count per minute
#   - Latency percentiles (p50, p95, p99)
#   - 4xx and 5xx error rates
#   - Healthy/unhealthy host count
#   - RDS connections and CPU
#   - Redis hit/miss ratio and memory
# -----------------------------------------------------------------------------

resource "aws_cloudwatch_dashboard" "gateway" {
  dashboard_name = "${local.resource_prefix}-dashboard"

  dashboard_body = jsonencode({
    widgets = [
      # Row 1: Request Count and Latency
      {
        type   = "metric"
        x      = 0
        y      = 0
        width  = 12
        height = 6
        properties = {
          title  = "Request Count (per minute)"
          region = local.region
          metrics = [
            ["AWS/ApplicationELB", "RequestCount", "LoadBalancer", aws_lb.litellm.arn_suffix, "TargetGroup", aws_lb_target_group.litellm.arn_suffix, { stat = "Sum", period = 60 }]
          ]
          view = "timeSeries"
        }
      },
      {
        type   = "metric"
        x      = 12
        y      = 0
        width  = 12
        height = 6
        properties = {
          title  = "Latency Percentiles (seconds)"
          region = local.region
          metrics = [
            ["AWS/ApplicationELB", "TargetResponseTime", "LoadBalancer", aws_lb.litellm.arn_suffix, "TargetGroup", aws_lb_target_group.litellm.arn_suffix, { stat = "p50", period = 60, label = "p50" }],
            ["AWS/ApplicationELB", "TargetResponseTime", "LoadBalancer", aws_lb.litellm.arn_suffix, "TargetGroup", aws_lb_target_group.litellm.arn_suffix, { stat = "p95", period = 60, label = "p95" }],
            ["AWS/ApplicationELB", "TargetResponseTime", "LoadBalancer", aws_lb.litellm.arn_suffix, "TargetGroup", aws_lb_target_group.litellm.arn_suffix, { stat = "p99", period = 60, label = "p99" }]
          ]
          view = "timeSeries"
        }
      },
      # Row 2: Error Rates and Host Health
      {
        type   = "metric"
        x      = 0
        y      = 6
        width  = 12
        height = 6
        properties = {
          title  = "4xx and 5xx Error Rates"
          region = local.region
          metrics = [
            ["AWS/ApplicationELB", "HTTPCode_Target_4XX_Count", "LoadBalancer", aws_lb.litellm.arn_suffix, "TargetGroup", aws_lb_target_group.litellm.arn_suffix, { stat = "Sum", period = 60, label = "4xx Errors" }],
            ["AWS/ApplicationELB", "HTTPCode_Target_5XX_Count", "LoadBalancer", aws_lb.litellm.arn_suffix, "TargetGroup", aws_lb_target_group.litellm.arn_suffix, { stat = "Sum", period = 60, label = "5xx Errors" }]
          ]
          view = "timeSeries"
        }
      },
      {
        type   = "metric"
        x      = 12
        y      = 6
        width  = 12
        height = 6
        properties = {
          title  = "Healthy / Unhealthy Host Count"
          region = local.region
          metrics = [
            ["AWS/ApplicationELB", "HealthyHostCount", "LoadBalancer", aws_lb.litellm.arn_suffix, "TargetGroup", aws_lb_target_group.litellm.arn_suffix, { stat = "Average", period = 60, label = "Healthy" }],
            ["AWS/ApplicationELB", "UnHealthyHostCount", "LoadBalancer", aws_lb.litellm.arn_suffix, "TargetGroup", aws_lb_target_group.litellm.arn_suffix, { stat = "Average", period = 60, label = "Unhealthy" }]
          ]
          view = "timeSeries"
        }
      },
      # Row 3: RDS Metrics
      {
        type   = "metric"
        x      = 0
        y      = 12
        width  = 12
        height = 6
        properties = {
          title  = "RDS CPU Utilization and Connections"
          region = local.region
          metrics = [
            ["AWS/RDS", "CPUUtilization", "DBInstanceIdentifier", aws_db_instance.litellm.identifier, { stat = "Average", period = 60, label = "CPU %" }],
            ["AWS/RDS", "DatabaseConnections", "DBInstanceIdentifier", aws_db_instance.litellm.identifier, { stat = "Average", period = 60, label = "Connections", yAxis = "right" }]
          ]
          view = "timeSeries"
          yAxis = {
            left = {
              min = 0
              max = 100
            }
          }
        }
      },
      # Row 3: Redis Metrics
      {
        type   = "metric"
        x      = 12
        y      = 12
        width  = 12
        height = 6
        properties = {
          title  = "Redis Memory Usage and Cache Hit/Miss"
          region = local.region
          metrics = [
            ["AWS/ElastiCache", "DatabaseMemoryUsagePercentage", "ReplicationGroupId", aws_elasticache_replication_group.litellm.replication_group_id, { stat = "Average", period = 60, label = "Memory %" }],
            ["AWS/ElastiCache", "CacheHits", "ReplicationGroupId", aws_elasticache_replication_group.litellm.replication_group_id, { stat = "Sum", period = 60, label = "Cache Hits", yAxis = "right" }],
            ["AWS/ElastiCache", "CacheMisses", "ReplicationGroupId", aws_elasticache_replication_group.litellm.replication_group_id, { stat = "Sum", period = 60, label = "Cache Misses", yAxis = "right" }]
          ]
          view = "timeSeries"
          yAxis = {
            left = {
              min = 0
              max = 100
            }
          }
        }
      },
      # Row 4: Custom Gateway Metrics (AVA/Gateway namespace)
      {
        type   = "metric"
        x      = 0
        y      = 18
        width  = 12
        height = 6
        properties = {
          title  = "Gateway Requests Per Second"
          region = local.region
          metrics = [
            ["AVA/Gateway", "requests_per_second", "GatewayId", "${local.resource_prefix}", { stat = "Sum", period = 60, label = "Requests/min" }]
          ]
          view = "timeSeries"
        }
      },
      {
        type   = "metric"
        x      = 12
        y      = 18
        width  = 12
        height = 6
        properties = {
          title  = "Gateway Latency Percentiles (ms)"
          region = local.region
          metrics = [
            ["AVA/Gateway", "latency_p50", "GatewayId", "${local.resource_prefix}", { stat = "p50", period = 60, label = "p50" }],
            ["AVA/Gateway", "latency_p95", "GatewayId", "${local.resource_prefix}", { stat = "p95", period = 60, label = "p95" }],
            ["AVA/Gateway", "latency_p99", "GatewayId", "${local.resource_prefix}", { stat = "p99", period = 60, label = "p99" }]
          ]
          view = "timeSeries"
        }
      },
      # Row 5: Error Rates and Cache Hit Ratio
      {
        type   = "metric"
        x      = 0
        y      = 24
        width  = 12
        height = 6
        properties = {
          title  = "Error Rate by Type"
          region = local.region
          metrics = [
            ["AVA/Gateway", "error_rate_by_type", "GatewayId", "${local.resource_prefix}", "ErrorType", "rate_limited", { stat = "Sum", period = 60, label = "Rate Limited" }],
            ["AVA/Gateway", "error_rate_by_type", "GatewayId", "${local.resource_prefix}", "ErrorType", "server_error", { stat = "Sum", period = 60, label = "Server Error" }],
            ["AVA/Gateway", "error_rate_by_type", "GatewayId", "${local.resource_prefix}", "ErrorType", "auth_error", { stat = "Sum", period = 60, label = "Auth Error" }]
          ]
          view = "timeSeries"
        }
      },
      {
        type   = "metric"
        x      = 12
        y      = 24
        width  = 12
        height = 6
        properties = {
          title  = "Cache Hit Ratio and Active Keys"
          region = local.region
          metrics = [
            ["AVA/Gateway", "cache_hit_ratio", "GatewayId", "${local.resource_prefix}", "CacheResult", "hit", { stat = "Sum", period = 60, label = "Cache Hits" }],
            ["AVA/Gateway", "cache_hit_ratio", "GatewayId", "${local.resource_prefix}", "CacheResult", "miss", { stat = "Sum", period = 60, label = "Cache Misses" }],
            ["AVA/Gateway", "active_virtual_keys", "GatewayId", "${local.resource_prefix}", { stat = "Maximum", period = 60, label = "Active Keys", yAxis = "right" }]
          ]
          view = "timeSeries"
        }
      },
      # Row 6: Circuit Breaker Metrics
      {
        type   = "metric"
        x      = 0
        y      = 30
        width  = 8
        height = 6
        properties = {
          title  = "Circuit Breaker State Transitions"
          region = local.region
          metrics = [
            ["AVA/Gateway", "circuit_breaker_state_transitions", "GatewayId", "${local.resource_prefix}", { stat = "Sum", period = 60, label = "Transitions" }]
          ]
          view = "timeSeries"
        }
      },
      {
        type   = "metric"
        x      = 8
        y      = 30
        width  = 8
        height = 6
        properties = {
          title  = "Fallback Activations"
          region = local.region
          metrics = [
            ["AVA/Gateway", "fallback_activations", "GatewayId", "${local.resource_prefix}", { stat = "Sum", period = 60, label = "Fallbacks" }]
          ]
          view = "timeSeries"
        }
      },
      {
        type   = "metric"
        x      = 16
        y      = 30
        width  = 8
        height = 6
        properties = {
          title  = "Gateway Recovery Events"
          region = local.region
          metrics = [
            ["AVA/Gateway", "gateway_recovery_events", "GatewayId", "${local.resource_prefix}", { stat = "Sum", period = 60, label = "Recoveries" }]
          ]
          view = "timeSeries"
        }
      }
    ]
  })
}
