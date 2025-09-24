variable "project" {
  description = "Short name for the MIHAS deployment used for tagging and resource naming"
  type        = string
}

variable "aws_region" {
  description = "AWS region where supporting resources (like the S3 bucket) will be created"
  type        = string
  default     = "us-east-1"
}

variable "bucket_name" {
  description = "Name of the S3 bucket that will store the built frontend assets"
  type        = string
}

variable "domain_name" {
  description = "Fully qualified domain name that will be served via CloudFront (e.g. application.mihas.edu.zm)"
  type        = string
  default     = ""
}

variable "hosted_zone_id" {
  description = "Route53 hosted zone ID used to create the alias record for the distribution"
  type        = string
  default     = ""
}

variable "certificate_arn" {
  description = "ARN of an ACM certificate in us-east-1 that covers domain_name"
  type        = string
  default     = ""
}

variable "log_bucket_name" {
  description = "Optional S3 bucket for CloudFront access logs"
  type        = string
  default     = ""
}

variable "price_class" {
  description = "CloudFront price class controlling enabled edge locations"
  type        = string
  default     = "PriceClass_200"
}

variable "default_ttl" {
  description = "Default cache TTL (in seconds) for cached objects"
  type        = number
  default     = 3600
}

variable "max_ttl" {
  description = "Maximum cache TTL (in seconds) for cached objects"
  type        = number
  default     = 86400
}
