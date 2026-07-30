# =============================================================================
# Container registry
# =============================================================================

resource "aws_ecr_repository" "api" {
  name = "${local.name}-api"

  # MUTABLE so that a convenience tag like `latest` can be re-pointed. If you deploy strictly by
  # git SHA (recommended), switch this to IMMUTABLE to guarantee a tag can never silently change
  # underneath a running service.
  image_tag_mutability = "MUTABLE"

  image_scanning_configuration {
    scan_on_push = true
  }

  encryption_configuration {
    encryption_type = "AES256"
  }
}

# Untagged layers accumulate on every rebuild and are billed as storage forever. Keeping the last
# 20 tagged images leaves plenty of rollback targets.
resource "aws_ecr_lifecycle_policy" "api" {
  repository = aws_ecr_repository.api.name

  policy = jsonencode({
    rules = [
      {
        rulePriority = 1
        description  = "Expire untagged images after 3 days"
        selection = {
          tagStatus   = "untagged"
          countType   = "sinceImagePushed"
          countUnit   = "days"
          countNumber = 3
        }
        action = { type = "expire" }
      },
      {
        rulePriority = 2
        description  = "Keep only the 20 most recent tagged images"
        selection = {
          tagStatus   = "any"
          countType   = "imageCountMoreThan"
          countNumber = 20
        }
        action = { type = "expire" }
      },
    ]
  })
}
