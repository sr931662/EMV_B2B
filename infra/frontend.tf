# =============================================================================
# Frontend — private S3 bucket behind CloudFront, with /api/* proxied to the ALB
# =============================================================================
# Single-origin design: the SPA and the API share one hostname, so the browser makes same-origin
# requests to /api/... and CORS never enters the picture. That is why VITE_API_URL is built as the
# empty string (see scripts/deploy-frontend.sh) — the app's api/client.js then uses relative paths.

resource "random_id" "bucket_suffix" {
  byte_length = 4
}

resource "aws_s3_bucket" "frontend" {
  # S3 bucket names are globally unique across all AWS accounts, so a random suffix avoids a
  # collision with someone else's "travnexa-prod-frontend".
  bucket = "${local.name}-frontend-${random_id.bucket_suffix.hex}"
}

# The bucket is private. CloudFront reaches it through Origin Access Control; nothing is publicly
# readable directly from S3, so the only way in is through the distribution (and its WAF/logging).
resource "aws_s3_bucket_public_access_block" "frontend" {
  bucket = aws_s3_bucket.frontend.id

  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_s3_bucket_ownership_controls" "frontend" {
  bucket = aws_s3_bucket.frontend.id

  rule {
    object_ownership = "BucketOwnerEnforced" # ACLs off entirely
  }
}

resource "aws_s3_bucket_server_side_encryption_configuration" "frontend" {
  bucket = aws_s3_bucket.frontend.id

  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256"
    }
  }
}

resource "aws_s3_bucket_versioning" "frontend" {
  bucket = aws_s3_bucket.frontend.id

  # Lets you recover the previous bundle if a bad build is uploaded.
  versioning_configuration {
    status = "Enabled"
  }
}

# -----------------------------------------------------------------------------
# CloudFront
# -----------------------------------------------------------------------------

resource "aws_cloudfront_origin_access_control" "frontend" {
  name                              = "${local.name}-frontend-oac"
  description                       = "OAC for the ${local.name} SPA bucket"
  origin_access_control_origin_type = "s3"
  signing_behavior                  = "always"
  signing_protocol                  = "sigv4"
}

# Managed policies, referenced by ID because they are AWS-global and stable.
locals {
  # CachingOptimized — long-lived caching, ideal for Vite's content-hashed assets.
  cf_cache_policy_optimized = "658327ea-f89d-4fab-a63d-7e88639e58f6"
  # CachingDisabled — the API must never be cached.
  cf_cache_policy_disabled = "4135ea2d-6df8-44a3-9df3-4b5a84be39ad"
  # AllViewerExceptHostHeader — forwards headers/cookies/query to a custom origin, but rewrites Host
  # to the origin's own hostname, which an ALB requires.
  cf_origin_request_all_viewer_except_host = "b689b0a8-53d0-40ab-baf2-68738e2966ac"
  # SimpleCORS
  cf_response_headers_cors = "60669652-455b-4ae9-85a4-c4c02393f3ea"
}

resource "aws_cloudfront_distribution" "frontend" {
  enabled             = true
  is_ipv6_enabled     = true
  comment             = "${local.name} SPA + API"
  default_root_object = "index.html"
  price_class         = "PriceClass_200" # includes India; PriceClass_All adds SA/AU/NZ at extra cost

  aliases = local.frontend_aliases

  # --- Origin 1: the SPA bucket -----------------------------------------------
  origin {
    origin_id                = "s3-frontend"
    domain_name              = aws_s3_bucket.frontend.bucket_regional_domain_name
    origin_access_control_id = aws_cloudfront_origin_access_control.frontend.id
  }

  # --- Origin 2: the API load balancer ---------------------------------------
  origin {
    origin_id   = "alb-api"
    domain_name = aws_lb.api.dns_name

    custom_origin_config {
      http_port  = 80
      https_port = 443
      # Follows whether the ALB terminates TLS. Without a certificate this is http-only, meaning the
      # CloudFront-to-ALB hop is unencrypted — acceptable only for a smoke test.
      origin_protocol_policy   = local.alb_origin_protocol_policy
      origin_ssl_protocols     = ["TLSv1.2"]
      origin_read_timeout      = 60
      origin_keepalive_timeout = 5
    }
  }

  # --- Default: serve the SPA ------------------------------------------------
  default_cache_behavior {
    target_origin_id       = "s3-frontend"
    viewer_protocol_policy = "redirect-to-https"
    allowed_methods        = ["GET", "HEAD", "OPTIONS"]
    cached_methods         = ["GET", "HEAD"]
    compress               = true

    cache_policy_id            = local.cf_cache_policy_optimized
    response_headers_policy_id = local.cf_response_headers_cors
  }

  # --- /api/* : straight through to the ALB, never cached --------------------
  ordered_cache_behavior {
    path_pattern           = "/api/*"
    target_origin_id       = "alb-api"
    viewer_protocol_policy = "redirect-to-https"
    # All methods: the API uses POST/PATCH/DELETE and multipart uploads.
    allowed_methods = ["GET", "HEAD", "OPTIONS", "PUT", "POST", "PATCH", "DELETE"]
    cached_methods  = ["GET", "HEAD"]
    compress        = true

    cache_policy_id          = local.cf_cache_policy_disabled
    origin_request_policy_id = local.cf_origin_request_all_viewer_except_host
  }

  # --- /health : lets you check the API through the CDN ----------------------
  ordered_cache_behavior {
    path_pattern           = "/health*"
    target_origin_id       = "alb-api"
    viewer_protocol_policy = "redirect-to-https"
    allowed_methods        = ["GET", "HEAD", "OPTIONS"]
    cached_methods         = ["GET", "HEAD"]
    compress               = true

    cache_policy_id          = local.cf_cache_policy_disabled
    origin_request_policy_id = local.cf_origin_request_all_viewer_except_host
  }

  # SPA deep links: the router owns /quotes/:id, but S3 has no such object and returns 403 (with OAC,
  # a missing key is 403 rather than 404). Both must be rewritten to index.html or a refresh on any
  # nested route shows an error page instead of the app.
  custom_error_response {
    error_code            = 403
    response_code         = 200
    response_page_path    = "/index.html"
    error_caching_min_ttl = 10
  }

  custom_error_response {
    error_code            = 404
    response_code         = 200
    response_page_path    = "/index.html"
    error_caching_min_ttl = 10
  }

  viewer_certificate {
    # Custom domain -> the us-east-1 ACM certificate. Otherwise the default *.cloudfront.net cert.
    acm_certificate_arn            = var.frontend_domain != "" ? var.frontend_certificate_arn : null
    ssl_support_method             = var.frontend_domain != "" ? "sni-only" : null
    minimum_protocol_version       = var.frontend_domain != "" ? "TLSv1.2_2021" : null
    cloudfront_default_certificate = var.frontend_domain == ""
  }

  restrictions {
    geo_restriction {
      restriction_type = "none"
    }
  }
}

# -----------------------------------------------------------------------------
# Bucket policy — only this distribution may read
# -----------------------------------------------------------------------------

data "aws_iam_policy_document" "frontend_bucket" {
  statement {
    sid    = "AllowCloudFrontRead"
    effect = "Allow"

    principals {
      type        = "Service"
      identifiers = ["cloudfront.amazonaws.com"]
    }

    actions   = ["s3:GetObject"]
    resources = ["${aws_s3_bucket.frontend.arn}/*"]

    # Scoped to this exact distribution, so another account's CloudFront cannot read the bucket.
    condition {
      test     = "StringEquals"
      variable = "AWS:SourceArn"
      values   = [aws_cloudfront_distribution.frontend.arn]
    }
  }
}

resource "aws_s3_bucket_policy" "frontend" {
  bucket = aws_s3_bucket.frontend.id
  policy = data.aws_iam_policy_document.frontend_bucket.json
}

# -----------------------------------------------------------------------------
# DNS for the custom frontend domain
# -----------------------------------------------------------------------------

resource "aws_route53_record" "frontend" {
  count = local.manage_dns && var.frontend_domain != "" ? 1 : 0

  zone_id = var.route53_zone_id
  name    = var.frontend_domain
  type    = "A"

  alias {
    name    = aws_cloudfront_distribution.frontend.domain_name
    zone_id = aws_cloudfront_distribution.frontend.hosted_zone_id
    # No health check: CloudFront is a global service and always "up" from Route 53's perspective.
    evaluate_target_health = false
  }
}
