# =============================================================================
# Inputs
# =============================================================================
# Only `ses_domain` and the two secrets have no workable default — everything else is set up to
# come up sensibly for a first deploy. See terraform.tfvars.example.

variable "aws_region" {
  description = "Region for all resources except the CloudFront certificate. Must be a region where SES is available."
  type        = string
  default     = "ap-south-1" # Mumbai — matches the app's en-IN/INR locale
}

variable "environment" {
  description = "Environment name, used in resource names and tags."
  type        = string
  default     = "prod"

  validation {
    condition     = can(regex("^[a-z0-9-]{2,12}$", var.environment))
    error_message = "environment must be 2-12 lowercase alphanumeric/hyphen characters (it is used in resource names)."
  }
}

variable "project_name" {
  description = "Short slug prefixed to resource names."
  type        = string
  default     = "travnexa"
}

# -----------------------------------------------------------------------------
# Networking
# -----------------------------------------------------------------------------

variable "vpc_cidr" {
  description = "CIDR block for the VPC."
  type        = string
  default     = "10.20.0.0/16"
}

variable "az_count" {
  description = "Number of availability zones to spread subnets across. Two is the ALB minimum."
  type        = number
  default     = 2

  validation {
    condition     = var.az_count >= 2 && var.az_count <= 3
    error_message = "az_count must be 2 or 3 (an ALB requires subnets in at least two AZs)."
  }
}

variable "tasks_in_private_subnets" {
  description = <<-EOT
    true  = tasks run in private subnets and reach the internet through a NAT gateway. More secure,
            but a NAT gateway costs roughly USD 32/month per AZ plus data processing.
    false = tasks run in public subnets with a public IP and no NAT gateway. Saves that cost; the
            tasks are still protected by their security group, which allows ingress only from the
            ALB. Reasonable for a staging or cost-sensitive deployment.

    Egress is required either way: the API talks to Neon Postgres and to SES over the internet.
  EOT
  type        = bool
  default     = true
}

variable "single_nat_gateway" {
  description = "Put one NAT gateway in the first AZ instead of one per AZ. Cheaper, but a single AZ failure takes egress down."
  type        = bool
  default     = true
}

# -----------------------------------------------------------------------------
# Application / container
# -----------------------------------------------------------------------------

variable "container_port" {
  description = "Port the Express app listens on inside the container."
  type        = number
  default     = 4000
}

variable "task_cpu" {
  description = "Fargate task CPU units (256 = 0.25 vCPU). Valid values are constrained by task_memory."
  type        = number
  default     = 512
}

variable "task_memory" {
  description = "Fargate task memory in MiB. Must be a valid pairing with task_cpu."
  type        = number
  default     = 1024
}

variable "desired_count" {
  description = <<-EOT
    Number of running tasks.

    PINNED TO 1 ON PURPOSE. Uploaded payment proofs, visa documents and generated PDFs are written
    to the container's local filesystem (backend/src/middleware/upload.js, pdfService.js). With more
    than one task, a file uploaded to task A cannot be read back by task B, so downloads 404 at
    random. Raising this is only safe after storage moves to S3 or a shared EFS mount.

    Note that even at 1, files are lost whenever the task is replaced — see DEPLOYMENT.md.
  EOT
  type        = number
  default     = 1

  validation {
    condition     = var.desired_count >= 1
    error_message = "desired_count must be at least 1."
  }
}

variable "image_tag" {
  description = "Image tag to deploy. Prefer an immutable tag (git SHA) over 'latest' so rollbacks are possible."
  type        = string
  default     = "latest"
}

variable "log_retention_days" {
  description = "CloudWatch log retention for the API's log group."
  type        = number
  default     = 30
}

# -----------------------------------------------------------------------------
# Secrets — passed in, never committed
# -----------------------------------------------------------------------------

variable "database_url" {
  description = "Full Postgres connection string (Neon). Stored in Secrets Manager and injected into the task, never baked into the image."
  type        = string
  sensitive   = true
}

variable "jwt_secret" {
  description = "JWT signing secret. Rotating this invalidates every issued token."
  type        = string
  sensitive   = true

  validation {
    condition     = length(var.jwt_secret) >= 32
    error_message = "jwt_secret must be at least 32 characters."
  }
}

# -----------------------------------------------------------------------------
# SES
# -----------------------------------------------------------------------------

variable "ses_domain" {
  description = "Domain to verify for sending (e.g. travnexa.com). DKIM and MAIL FROM records are created for it."
  type        = string
}

variable "ses_from_address" {
  description = "From header for outbound mail. Must be at (or a subdomain of) ses_domain once verified."
  type        = string
  default     = ""
}

variable "ses_mail_from_subdomain" {
  description = "Subdomain used as the custom MAIL FROM (bounce) domain. Improves deliverability and DMARC alignment."
  type        = string
  default     = "mail"
}

variable "ses_reply_to" {
  description = "Optional Reply-To address for outbound mail."
  type        = string
  default     = ""
}

# -----------------------------------------------------------------------------
# DNS
# -----------------------------------------------------------------------------

variable "route53_zone_id" {
  description = <<-EOT
    Route 53 hosted zone ID for ses_domain. When set, all SES verification records (DKIM CNAMEs,
    MAIL FROM MX/TXT) are created automatically.

    Leave empty if DNS is hosted elsewhere (GoDaddy, Cloudflare, ...). The records are then exposed
    as the `ses_dns_records_to_create` output for you to add by hand — SES will not verify the
    domain until they exist.
  EOT
  type        = string
  default     = ""
}

# -----------------------------------------------------------------------------
# TLS / domains
# -----------------------------------------------------------------------------

variable "api_certificate_arn" {
  description = <<-EOT
    ACM certificate ARN in var.aws_region for the ALB's HTTPS listener.

    Leave empty to run the ALB on plain HTTP. That is fine for a first smoke test but unacceptable
    for production: JWTs and payment data would cross the internet in clear text between CloudFront
    and the ALB.
  EOT
  type        = string
  default     = ""
}

variable "frontend_certificate_arn" {
  description = "ACM certificate ARN in us-east-1 for the CloudFront custom domain. Required only when frontend_domain is set."
  type        = string
  default     = ""
}

variable "frontend_domain" {
  description = "Custom domain for the frontend (e.g. app.travnexa.com). Leave empty to use the generated *.cloudfront.net domain."
  type        = string
  default     = ""
}

variable "cors_origin" {
  description = "Value for the API's CORS_ORIGIN env var. Leave empty to allow any origin (the app's default). Not needed when the SPA calls /api on the CloudFront origin, since that is same-origin."
  type        = string
  default     = ""
}
