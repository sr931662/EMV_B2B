# =============================================================================
# Secrets
# =============================================================================
# DATABASE_URL and JWT_SECRET are injected into the container by the ECS agent at start-up
# (see the `secrets` block in ecs.tf), so they never appear in the task definition's environment,
# in the image, or in `aws ecs describe-task-definition` output.
#
# They DO land in Terraform state, which is why versions.tf recommends an encrypted S3 backend —
# a local terraform.tfstate holds these in plain text.

resource "aws_secretsmanager_secret" "database_url" {
  name        = "${local.name}/DATABASE_URL"
  description = "Postgres connection string (Neon) for the ${var.environment} API"

  # 0 = delete immediately on destroy. Without this, the name is held for 30 days and re-creating
  # the stack fails with "already scheduled for deletion", which is a miserable surprise mid-deploy.
  recovery_window_in_days = 0
}

resource "aws_secretsmanager_secret_version" "database_url" {
  secret_id     = aws_secretsmanager_secret.database_url.id
  secret_string = var.database_url
}

resource "aws_secretsmanager_secret" "jwt_secret" {
  name                    = "${local.name}/JWT_SECRET"
  description             = "JWT signing secret for the ${var.environment} API"
  recovery_window_in_days = 0
}

resource "aws_secretsmanager_secret_version" "jwt_secret" {
  secret_id     = aws_secretsmanager_secret.jwt_secret.id
  secret_string = var.jwt_secret
}
