# =============================================================================
# Amazon SES
# =============================================================================
# Domain-level identity with Easy DKIM and a custom MAIL FROM domain.
#
# Why domain and not just a single verified address: verifying the domain lets the app send from any
# address at it (no-reply@, support@) with no further verification, and DKIM signing plus an aligned
# MAIL FROM domain is what keeps mail out of spam folders. An address-only identity gets neither.
#
# IMPORTANT — the SES sandbox. A new account can only send TO verified addresses, at 200 messages a
# day. Partner OTP emails will silently fail for everyone else until production access is granted.
# See DEPLOYMENT.md § "Leaving the SES sandbox".

resource "aws_sesv2_email_identity" "domain" {
  email_identity = var.ses_domain

  dkim_signing_attributes {
    # Easy DKIM: AWS generates and rotates the key pair, and publishes it via three CNAMEs.
    next_signing_key_length = "RSA_2048_BIT"
  }

  configuration_set_name = aws_sesv2_configuration_set.main.configuration_set_name
}

# A custom MAIL FROM (the Return-Path / bounce domain) means bounces are attributed to your domain
# rather than amazonses.com, which is required for strict DMARC alignment.
resource "aws_sesv2_email_identity_mail_from_attributes" "domain" {
  email_identity = aws_sesv2_email_identity.domain.email_identity

  mail_from_domain = local.ses_mail_from_domain

  # RejectMessage: if the MX record is missing or broken, refuse to send rather than quietly falling
  # back to amazonses.com — a silent fallback breaks DMARC without any signal that it happened.
  behavior_on_mx_failure = "REJECT_MESSAGE"
}

resource "aws_sesv2_configuration_set" "main" {
  configuration_set_name = "${local.name}-emails"

  delivery_options {
    # Require TLS on the SMTP hop to the recipient's mail server.
    tls_policy = "REQUIRE"
  }

  reputation_options {
    reputation_metrics_enabled = true
  }

  sending_options {
    sending_enabled = true
  }

  suppression_options {
    # Account-level suppression: stop sending to addresses that have hard-bounced or complained.
    # Continuing to mail them is the fastest way to wreck a sending reputation.
    suppressed_reasons = ["BOUNCE", "COMPLAINT"]
  }
}

# -----------------------------------------------------------------------------
# DNS records
# -----------------------------------------------------------------------------
# Created automatically when route53_zone_id is set. Otherwise they are surfaced by the
# `ses_dns_records_to_create` output for manual entry at whichever DNS host you use — SES stays
# unverified, and sending fails, until they exist.

# Easy DKIM publishes exactly three CNAMEs.
resource "aws_route53_record" "ses_dkim" {
  count = local.manage_dns ? 3 : 0

  zone_id = var.route53_zone_id
  name    = "${aws_sesv2_email_identity.domain.dkim_signing_attributes[0].tokens[count.index]}._domainkey.${var.ses_domain}"
  type    = "CNAME"
  ttl     = 600
  records = ["${aws_sesv2_email_identity.domain.dkim_signing_attributes[0].tokens[count.index]}.dkim.amazonses.com"]
}

# MX for the MAIL FROM subdomain, pointing at the regional SES inbound endpoint.
resource "aws_route53_record" "ses_mail_from_mx" {
  count = local.manage_dns ? 1 : 0

  zone_id = var.route53_zone_id
  name    = local.ses_mail_from_domain
  type    = "MX"
  ttl     = 600
  records = ["10 feedback-smtp.${var.aws_region}.amazonses.com"]
}

# SPF for the MAIL FROM subdomain.
resource "aws_route53_record" "ses_mail_from_txt" {
  count = local.manage_dns ? 1 : 0

  zone_id = var.route53_zone_id
  name    = local.ses_mail_from_domain
  type    = "TXT"
  ttl     = 600
  records = ["v=spf1 include:amazonses.com ~all"]
}

# A DMARC policy is what actually instructs receivers what to do with unaligned mail. Starting at
# p=none means "monitor and report, change nothing", which is the safe first step — tighten to
# quarantine/reject once the reports show all legitimate mail passing.
resource "aws_route53_record" "dmarc" {
  count = local.manage_dns ? 1 : 0

  zone_id = var.route53_zone_id
  name    = "_dmarc.${var.ses_domain}"
  type    = "TXT"
  ttl     = 600
  records = ["v=DMARC1; p=none; rua=mailto:dmarc-reports@${var.ses_domain}"]
}
