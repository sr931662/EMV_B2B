# =============================================================================
# Shared locals and account/region lookups
# =============================================================================

data "aws_caller_identity" "current" {}

data "aws_availability_zones" "available" {
  state = "available"

  # Local Zones and Wavelength zones can't run Fargate tasks or host an ALB.
  filter {
    name   = "opt-in-status"
    values = ["opt-in-not-required"]
  }
}

locals {
  name = "${var.project_name}-${var.environment}"

  azs = slice(data.aws_availability_zones.available.names, 0, var.az_count)

  account_id = data.aws_caller_identity.current.account_id

  # Fall back to no-reply@<domain> so a first `apply` works without setting ses_from_address.
  ses_from_address = var.ses_from_address != "" ? var.ses_from_address : "no-reply@${var.ses_domain}"

  ses_mail_from_domain = "${var.ses_mail_from_subdomain}.${var.ses_domain}"

  # Whether DNS records can be managed for us.
  manage_dns = var.route53_zone_id != ""

  # HTTPS on the ALB only exists if a certificate was supplied.
  alb_https_enabled = var.api_certificate_arn != ""

  # CloudFront must speak to the ALB over whichever protocol the ALB actually terminates.
  alb_origin_protocol_policy = local.alb_https_enabled ? "https-only" : "http-only"

  frontend_aliases = var.frontend_domain != "" ? [var.frontend_domain] : []
}
