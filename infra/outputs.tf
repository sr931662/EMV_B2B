# =============================================================================
# Outputs
# =============================================================================

output "app_url" {
  description = "Public URL of the application (SPA + /api on one origin)."
  value       = var.frontend_domain != "" ? "https://${var.frontend_domain}" : "https://${aws_cloudfront_distribution.frontend.domain_name}"
}

output "api_alb_url" {
  description = "The ALB directly. Useful for bypassing CloudFront when debugging the API."
  value       = local.alb_https_enabled ? "https://${aws_lb.api.dns_name}" : "http://${aws_lb.api.dns_name}"
}

output "cloudfront_distribution_id" {
  description = "Needed to invalidate the cache after a frontend deploy."
  value       = aws_cloudfront_distribution.frontend.id
}

output "frontend_bucket" {
  description = "S3 bucket the built SPA is synced into."
  value       = aws_s3_bucket.frontend.bucket
}

output "ecr_repository_url" {
  description = "Push the API image here."
  value       = aws_ecr_repository.api.repository_url
}

output "ecs_cluster_name" {
  description = "ECS cluster name."
  value       = aws_ecs_cluster.main.name
}

output "ecs_service_name" {
  description = "ECS service name."
  value       = aws_ecs_service.api.name
}

output "task_definition_family" {
  description = "Task definition family, used by deploy.sh to register new revisions."
  value       = aws_ecs_task_definition.api.family
}

output "log_group" {
  description = "CloudWatch log group for API logs."
  value       = aws_cloudwatch_log_group.api.name
}

output "ses_from_address" {
  description = "From address the API sends as."
  value       = local.ses_from_address
}

output "ses_configuration_set" {
  description = "SES configuration set applied to outbound mail."
  value       = aws_sesv2_configuration_set.main.configuration_set_name
}

# -----------------------------------------------------------------------------
# Manual DNS — only relevant when route53_zone_id is NOT set
# -----------------------------------------------------------------------------

output "ses_dns_records_to_create" {
  description = <<-EOT
    DNS records required for SES to verify the domain and sign mail.

    Empty when route53_zone_id is set (Terraform creates them). Otherwise add every record below at
    your DNS host — SES will not verify, and no email will send, until they exist. Verification
    usually completes within minutes of the records propagating.
  EOT
  value = local.manage_dns ? {} : {
    dkim_cnames = [
      for token in aws_sesv2_email_identity.domain.dkim_signing_attributes[0].tokens : {
        type  = "CNAME"
        name  = "${token}._domainkey.${var.ses_domain}"
        value = "${token}.dkim.amazonses.com"
      }
    ]
    mail_from_mx = {
      type  = "MX"
      name  = local.ses_mail_from_domain
      value = "10 feedback-smtp.${var.aws_region}.amazonses.com"
    }
    mail_from_spf = {
      type  = "TXT"
      name  = local.ses_mail_from_domain
      value = "v=spf1 include:amazonses.com ~all"
    }
    dmarc = {
      type  = "TXT"
      name  = "_dmarc.${var.ses_domain}"
      value = "v=DMARC1; p=none; rua=mailto:dmarc-reports@${var.ses_domain}"
    }
  }
}

output "ses_verification_status_command" {
  description = "Check whether SES has verified the domain yet."
  value       = "aws sesv2 get-email-identity --email-identity ${var.ses_domain} --region ${var.aws_region} --query '{Verified:VerifiedForSendingStatus,DkimStatus:DkimAttributes.Status}'"
}

output "sandbox_check_command" {
  description = "Shows whether the account is still in the SES sandbox (Max24HourSend of 200 means yes)."
  value       = "aws sesv2 get-account --region ${var.aws_region} --query '{ProductionAccess:ProductionAccessEnabled,Max24HourSend:SendQuota.Max24HourSend}'"
}

output "deploy_env" {
  description = "Values the deploy scripts read. Consume with: terraform output -json deploy_env"
  value = {
    aws_region          = var.aws_region
    ecr_repository      = aws_ecr_repository.api.repository_url
    cluster             = aws_ecs_cluster.main.name
    service             = aws_ecs_service.api.name
    task_family         = aws_ecs_task_definition.api.family
    frontend_bucket     = aws_s3_bucket.frontend.bucket
    distribution_id     = aws_cloudfront_distribution.frontend.id
    log_group           = aws_cloudwatch_log_group.api.name
    database_url_secret = aws_secretsmanager_secret.database_url.name
    ses_domain          = var.ses_domain
    ses_from_address    = local.ses_from_address
  }
}
