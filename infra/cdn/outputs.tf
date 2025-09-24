output "cdn_distribution_id" {
  description = "CloudFront distribution ID used for cache invalidations"
  value       = aws_cloudfront_distribution.cdn.id
}

output "cdn_domain_name" {
  description = "CloudFront domain name to point DNS records at if Route53 is not managing DNS"
  value       = aws_cloudfront_distribution.cdn.domain_name
}

output "assets_bucket_name" {
  description = "Name of the S3 bucket that stores built frontend assets"
  value       = aws_s3_bucket.assets.id
}

output "origin_access_identity_iam_arn" {
  description = "IAM ARN of the CloudFront origin access identity bound to the S3 bucket"
  value       = aws_cloudfront_origin_access_identity.cdn.iam_arn
}
