output "notifications_dispatch_queue_url" {
  description = "URL of the queue feeding the autoscaled notifications worker"
  value       = aws_sqs_queue.notifications_dispatch.id
}

output "notifications_scaling_metrics_queue_url" {
  description = "URL consumed by Netlify functions to publish scaling metrics"
  value       = aws_sqs_queue.scaling_metrics.id
}

output "notifications_worker_alias_arn" {
  description = "ARN of the autoscaled notifications worker alias"
  value       = aws_lambda_alias.notifications_worker.arn
}

output "netlify_environment_variables" {
  description = "Environment variables required for Netlify functions to participate in autoscaling"
  value = {
    SCALING_METRICS_QUEUE_URL = aws_sqs_queue.scaling_metrics.id
    NOTIFICATIONS_QUEUE_URL   = aws_sqs_queue.notifications_dispatch.id
    AWS_REGION                = var.aws_region
  }
}
