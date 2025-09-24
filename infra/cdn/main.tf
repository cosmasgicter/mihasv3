locals {
  project_tag            = "${var.project}-cdn"
  use_custom_certificate = var.certificate_arn != ""
  has_domain_alias       = var.domain_name != "" && var.hosted_zone_id != ""
}

resource "aws_s3_bucket" "assets" {
  bucket = var.bucket_name

  tags = {
    Project = local.project_tag
    Managed = "terraform"
  }
}

resource "aws_s3_bucket_public_access_block" "assets" {
  bucket = aws_s3_bucket.assets.id

  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_s3_bucket_versioning" "assets" {
  bucket = aws_s3_bucket.assets.id

  versioning_configuration {
    status = "Enabled"
  }
}

resource "aws_s3_bucket_server_side_encryption_configuration" "assets" {
  bucket = aws_s3_bucket.assets.id

  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256"
    }
  }
}

resource "aws_cloudfront_origin_access_identity" "cdn" {
  comment = "Access identity for ${var.project} frontend assets"
}

data "aws_iam_policy_document" "assets" {
  statement {
    sid    = "AllowCloudFrontServicePrincipal"
    effect = "Allow"

    actions = [
      "s3:GetObject"
    ]

    principals {
      type        = "CanonicalUser"
      identifiers = [aws_cloudfront_origin_access_identity.cdn.s3_canonical_user_id]
    }

    resources = ["${aws_s3_bucket.assets.arn}/*"]
  }
}

resource "aws_s3_bucket_policy" "assets" {
  bucket = aws_s3_bucket.assets.id
  policy = data.aws_iam_policy_document.assets.json
}

resource "aws_cloudfront_distribution" "cdn" {
  enabled             = true
  is_ipv6_enabled     = true
  comment             = "MIHAS V2 frontend CDN distribution"
  default_root_object = "index.html"
  price_class         = var.price_class

  aliases = var.domain_name != "" ? [var.domain_name] : []

  origin {
    domain_name = aws_s3_bucket.assets.bucket_regional_domain_name
    origin_id   = "mihas-cdn-origin"

    s3_origin_config {
      origin_access_identity = aws_cloudfront_origin_access_identity.cdn.cloudfront_access_identity_path
    }
  }

  default_cache_behavior {
    target_origin_id       = "mihas-cdn-origin"
    viewer_protocol_policy = "redirect-to-https"

    allowed_methods = ["GET", "HEAD", "OPTIONS"]
    cached_methods  = ["GET", "HEAD"]

    compress = true

    forwarded_values {
      query_string = true

      cookies {
        forward = "none"
      }
    }

    min_ttl     = 0
    default_ttl = var.default_ttl
    max_ttl     = var.max_ttl
  }

  custom_error_response {
    error_code            = 404
    response_code         = 200
    response_page_path    = "/index.html"
    error_caching_min_ttl = 60
  }

  restrictions {
    geo_restriction {
      restriction_type = "none"
    }
  }

  dynamic "logging_config" {
    for_each = var.log_bucket_name != "" ? [var.log_bucket_name] : []

    content {
      bucket = "${logging_config.value}.s3.amazonaws.com"
      prefix = "cloudfront/${var.project}"
    }
  }

  viewer_certificate {
    acm_certificate_arn            = local.use_custom_certificate ? var.certificate_arn : null
    ssl_support_method             = local.use_custom_certificate ? "sni-only" : null
    minimum_protocol_version       = "TLSv1.2_2021"
    cloudfront_default_certificate = local.use_custom_certificate ? false : true
  }

  tags = {
    Project = local.project_tag
    Managed = "terraform"
  }
}

resource "aws_route53_record" "cdn_alias" {
  count = local.has_domain_alias ? 1 : 0

  zone_id = var.hosted_zone_id
  name    = var.domain_name
  type    = "A"

  alias {
    name                   = aws_cloudfront_distribution.cdn.domain_name
    zone_id                = aws_cloudfront_distribution.cdn.hosted_zone_id
    evaluate_target_health = false
  }
}

resource "aws_route53_record" "cdn_alias_ipv6" {
  count = local.has_domain_alias ? 1 : 0

  zone_id = var.hosted_zone_id
  name    = var.domain_name
  type    = "AAAA"

  alias {
    name                   = aws_cloudfront_distribution.cdn.domain_name
    zone_id                = aws_cloudfront_distribution.cdn.hosted_zone_id
    evaluate_target_health = false
  }
}
