terraform {
  required_version = ">= 1.6.0"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
  }
}

provider "aws" {
  region = var.aws_region
}

locals {
  project_tag = "${var.project}-autoscaling"
}

resource "aws_sqs_queue" "scaling_metrics" {
  name                       = "${var.project}-scaling-metrics"
  message_retention_seconds  = var.metrics_queue_retention_seconds
  visibility_timeout_seconds = 30
  sqs_managed_sse_enabled    = true
  tags = {
    Project = local.project_tag
    Purpose = "scaling-metrics"
  }
}

resource "aws_sqs_queue" "notifications_dlq" {
  name                      = "${var.project}-notifications-dlq"
  message_retention_seconds = var.notifications_dlq_retention_seconds
  sqs_managed_sse_enabled   = true
  tags = {
    Project = local.project_tag
    Purpose = "notifications-dlq"
  }
}

resource "aws_sqs_queue" "notifications_dispatch" {
  name                       = "${var.project}-notifications-dispatch"
  visibility_timeout_seconds = var.notifications_queue_visibility_timeout_seconds
  message_retention_seconds  = var.notifications_queue_retention_seconds
  receive_wait_time_seconds  = 20
  redrive_policy = jsonencode({
    deadLetterTargetArn = aws_sqs_queue.notifications_dlq.arn
    maxReceiveCount     = var.notifications_max_receive_count
  })
  sqs_managed_sse_enabled = true
  tags = {
    Project = local.project_tag
    Purpose = "notifications-dispatch"
  }
}

resource "aws_cloudwatch_metric_alarm" "notifications_backlog" {
  alarm_name          = "${var.project}-notifications-queue-depth"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 1
  metric_name         = "ApproximateNumberOfMessagesVisible"
  namespace           = "AWS/SQS"
  period              = 60
  statistic           = "Maximum"
  threshold           = var.notifications_queue_alarm_threshold

  dimensions = {
    QueueName = aws_sqs_queue.notifications_dispatch.name
  }

  alarm_description = "Triggers when the notifications dispatch queue depth exceeds the configured threshold"
  treat_missing_data = "notBreaching"

  tags = {
    Project = local.project_tag
    Purpose = "notifications-monitoring"
  }
}

resource "aws_iam_role" "notifications_worker" {
  name               = "${var.project}-notifications-worker"
  assume_role_policy = data.aws_iam_policy_document.lambda_assume.json

  tags = {
    Project = local.project_tag
  }
}

data "aws_iam_policy_document" "lambda_assume" {
  statement {
    actions = ["sts:AssumeRole"]

    principals {
      type        = "Service"
      identifiers = ["lambda.amazonaws.com"]
    }
  }
}

resource "aws_iam_role_policy_attachment" "notifications_worker_basic" {
  role       = aws_iam_role.notifications_worker.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole"
}

resource "aws_iam_role_policy_attachment" "notifications_worker_sqs" {
  role       = aws_iam_role.notifications_worker.name
  policy_arn = "arn:aws:iam::aws:policy/AmazonSQSFullAccess"
}

resource "aws_lambda_function" "notifications_worker" {
  function_name = "${var.project}-notifications-worker"
  role          = aws_iam_role.notifications_worker.arn
  package_type  = "Image"
  image_uri     = var.worker_image_uri
  memory_size   = var.notifications_worker_memory_size
  timeout       = var.notifications_worker_timeout
  publish       = true

  environment {
    variables = {
      SCALING_METRICS_QUEUE_URL = aws_sqs_queue.scaling_metrics.id
      NOTIFICATIONS_QUEUE_URL   = aws_sqs_queue.notifications_dispatch.id
      PROJECT_NAMESPACE         = var.project
    }
  }

  tags = {
    Project = local.project_tag
    Purpose = "notifications-worker"
  }
}

resource "aws_lambda_alias" "notifications_worker" {
  name             = var.notifications_worker_alias
  description      = "Autoscaled notifications processing alias"
  function_name    = aws_lambda_function.notifications_worker.arn
  function_version = aws_lambda_function.notifications_worker.version
}

resource "aws_lambda_event_source_mapping" "notifications_dispatch" {
  event_source_arn  = aws_sqs_queue.notifications_dispatch.arn
  function_name     = aws_lambda_alias.notifications_worker.arn
  batch_size        = var.notifications_worker_batch_size
  maximum_batching_window_in_seconds = var.notifications_worker_batch_window
  enabled           = true
}

resource "aws_lambda_provisioned_concurrency_config" "notifications_worker" {
  function_name                     = aws_lambda_function.notifications_worker.arn
  qualifier                         = aws_lambda_alias.notifications_worker.name
  provisioned_concurrent_executions = var.notifications_worker_min_concurrency
}

resource "aws_appautoscaling_target" "notifications_worker" {
  max_capacity       = var.notifications_worker_max_concurrency
  min_capacity       = var.notifications_worker_min_concurrency
  resource_id        = "function:${aws_lambda_function.notifications_worker.function_name}:${aws_lambda_alias.notifications_worker.name}"
  scalable_dimension = "lambda:function:ProvisionedConcurrency"
  service_namespace  = "lambda"
}

resource "aws_appautoscaling_policy" "notifications_queue_depth" {
  name               = "${var.project}-notifications-queue-policy"
  policy_type        = "TargetTrackingScaling"
  resource_id        = aws_appautoscaling_target.notifications_worker.resource_id
  scalable_dimension = aws_appautoscaling_target.notifications_worker.scalable_dimension
  service_namespace  = aws_appautoscaling_target.notifications_worker.service_namespace

  target_tracking_scaling_policy_configuration {
    customized_metric_specification {
      metric_name = "ApproximateNumberOfMessagesVisible"
      namespace   = "AWS/SQS"
      statistic   = "Average"
      unit        = "Count"

      dimensions {
        name  = "QueueName"
        value = aws_sqs_queue.notifications_dispatch.name
      }
    }

    target_value       = var.notifications_queue_target_depth
    scale_in_cooldown  = 120
    scale_out_cooldown = 60
  }
}

resource "aws_appautoscaling_scheduled_action" "notifications_scale_out" {
  name               = "${var.project}-notifications-scale-out"
  service_namespace  = aws_appautoscaling_target.notifications_worker.service_namespace
  resource_id        = aws_appautoscaling_target.notifications_worker.resource_id
  scalable_dimension = aws_appautoscaling_target.notifications_worker.scalable_dimension
  schedule           = var.notifications_scale_out_schedule

  scalable_target_action {
    min_capacity = var.notifications_worker_peak_min_concurrency
    max_capacity = var.notifications_worker_peak_max_concurrency
  }
}

resource "aws_appautoscaling_scheduled_action" "notifications_scale_in" {
  name               = "${var.project}-notifications-scale-in"
  service_namespace  = aws_appautoscaling_target.notifications_worker.service_namespace
  resource_id        = aws_appautoscaling_target.notifications_worker.resource_id
  scalable_dimension = aws_appautoscaling_target.notifications_worker.scalable_dimension
  schedule           = var.notifications_scale_in_schedule

  scalable_target_action {
    min_capacity = var.notifications_worker_min_concurrency
    max_capacity = var.notifications_worker_max_concurrency
  }
}

resource "aws_cloudwatch_dashboard" "autoscaling" {
  dashboard_name = "${var.project}-autoscaling"
  dashboard_body = jsonencode({
    widgets = [
      {
        type = "metric"
        width = 12
        height = 6
        properties = {
          title = "Notifications queue depth"
          metrics = [
            ["AWS/SQS", "ApproximateNumberOfMessagesVisible", "QueueName", aws_sqs_queue.notifications_dispatch.name]
          ]
          period = 60
          stat   = "Average"
        }
      },
      {
        type = "metric"
        width = 12
        height = 6
        properties = {
          title = "Provisioned concurrency"
          metrics = [
            ["AWS/Lambda", "ProvisionedConcurrentExecutions", "FunctionName", aws_lambda_function.notifications_worker.function_name, "Resource", aws_lambda_alias.notifications_worker.name]
          ]
          period = 60
          stat   = "Average"
        }
      }
    ]
  })

  depends_on = [aws_appautoscaling_target.notifications_worker]

  tags = {
    Project = local.project_tag
    Purpose = "autoscaling-visibility"
  }
}
