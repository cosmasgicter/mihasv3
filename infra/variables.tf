variable "aws_region" {
  description = "AWS region where autoscaling resources are created"
  type        = string
  default     = "us-east-1"
}

variable "project" {
  description = "Short project identifier used for naming and tagging"
  type        = string
  default     = "mihas"
}

variable "worker_image_uri" {
  description = "ECR image URI for the containerized notifications worker"
  type        = string
}

variable "metrics_queue_retention_seconds" {
  description = "Retention for scaling metrics queue messages"
  type        = number
  default     = 3600
}

variable "notifications_queue_visibility_timeout_seconds" {
  description = "Visibility timeout for the notifications dispatch queue"
  type        = number
  default     = 300
}

variable "notifications_queue_retention_seconds" {
  description = "Retention period for queued notification jobs"
  type        = number
  default     = 86400
}

variable "notifications_dlq_retention_seconds" {
  description = "Retention for messages that land in the dead letter queue"
  type        = number
  default     = 1209600
}

variable "notifications_max_receive_count" {
  description = "Maximum receives before a message is moved to the DLQ"
  type        = number
  default     = 5
}

variable "notifications_worker_memory_size" {
  description = "Allocated memory for the notifications worker"
  type        = number
  default     = 512
}

variable "notifications_worker_timeout" {
  description = "Maximum execution time for the notifications worker"
  type        = number
  default     = 120
}

variable "notifications_worker_alias" {
  description = "Alias used for provisioned concurrency and autoscaling"
  type        = string
  default     = "live"
}

variable "notifications_worker_batch_size" {
  description = "Number of queue messages consumed per Lambda invocation"
  type        = number
  default     = 5
}

variable "notifications_worker_batch_window" {
  description = "Maximum batching window for queue consumption"
  type        = number
  default     = 10
}

variable "notifications_worker_min_concurrency" {
  description = "Baseline provisioned concurrency for the notifications worker"
  type        = number
  default     = 1
}

variable "notifications_worker_max_concurrency" {
  description = "Maximum provisioned concurrency for the notifications worker"
  type        = number
  default     = 20
}

variable "notifications_worker_peak_min_concurrency" {
  description = "Minimum concurrency applied during peak windows"
  type        = number
  default     = 4
}

variable "notifications_worker_peak_max_concurrency" {
  description = "Maximum concurrency applied during peak windows"
  type        = number
  default     = 40
}

variable "notifications_queue_alarm_threshold" {
  description = "Queue depth that should trigger backlog alerts"
  type        = number
  default     = 200
}

variable "notifications_queue_target_depth" {
  description = "Target queue depth for autoscaling controller"
  type        = number
  default     = 10
}

variable "notifications_scale_out_schedule" {
  description = "Cron expression for scaling out during expected traffic spikes"
  type        = string
  default     = "cron(0 5 * * ? *)"
}

variable "notifications_scale_in_schedule" {
  description = "Cron expression for scaling in after peak demand"
  type        = string
  default     = "cron(0 20 * * ? *)"
}
