# =============================================================================
# IAM
# =============================================================================
# Two distinct roles, and the split matters:
#
#   execution role — assumed by the ECS *agent*, before the container starts. Pulls the image from
#                    ECR, writes to the log group, and reads the secrets to inject.
#   task role      — assumed by the *application code* at runtime. This is what the AWS SDK inside
#                    the container picks up, and the only thing it needs is permission to send mail
#                    through SES.
#
# Collapsing them into one role would hand the application ECR and Secrets Manager access it has no
# use for.

data "aws_iam_policy_document" "ecs_tasks_assume" {
  statement {
    effect  = "Allow"
    actions = ["sts:AssumeRole"]

    principals {
      type        = "Service"
      identifiers = ["ecs-tasks.amazonaws.com"]
    }

    # Confused-deputy guard: restricts this trust policy to task ARNs in this account.
    condition {
      test     = "StringEquals"
      variable = "aws:SourceAccount"
      values   = [local.account_id]
    }
  }
}

# -----------------------------------------------------------------------------
# Execution role
# -----------------------------------------------------------------------------

resource "aws_iam_role" "execution" {
  name               = "${local.name}-ecs-execution"
  assume_role_policy = data.aws_iam_policy_document.ecs_tasks_assume.json
}

# AWS-managed: ECR pull + CloudWatch Logs create/put.
resource "aws_iam_role_policy_attachment" "execution_managed" {
  role       = aws_iam_role.execution.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AmazonECSTaskExecutionRolePolicy"
}

# Reading the injected secrets is NOT in the managed policy — it has to be granted explicitly, and
# scoped to just these two secrets rather than secretsmanager:* .
data "aws_iam_policy_document" "execution_secrets" {
  statement {
    sid    = "ReadInjectedSecrets"
    effect = "Allow"
    actions = [
      "secretsmanager:GetSecretValue",
    ]
    resources = [
      aws_secretsmanager_secret.database_url.arn,
      aws_secretsmanager_secret.jwt_secret.arn,
    ]
  }
}

resource "aws_iam_role_policy" "execution_secrets" {
  name   = "${local.name}-read-secrets"
  role   = aws_iam_role.execution.id
  policy = data.aws_iam_policy_document.execution_secrets.json
}

# -----------------------------------------------------------------------------
# Task role — what the application itself can do
# -----------------------------------------------------------------------------

resource "aws_iam_role" "task" {
  name               = "${local.name}-ecs-task"
  assume_role_policy = data.aws_iam_policy_document.ecs_tasks_assume.json
}

data "aws_iam_policy_document" "task_ses" {
  statement {
    sid    = "SendMailThroughSes"
    effect = "Allow"
    actions = [
      "ses:SendEmail",
      # SendRawEmail is not used by emailService today (it sends Simple content), but is granted so
      # adding an attachment later — e.g. mailing a quote PDF — needs no IAM change.
      "ses:SendRawEmail",
    ]
    resources = [
      aws_sesv2_email_identity.domain.arn,
      "arn:aws:ses:${var.aws_region}:${local.account_id}:configuration-set/${aws_sesv2_configuration_set.main.configuration_set_name}",
    ]

    # Hard constraint on the From address: even if application config were changed or compromised,
    # this role cannot send as an arbitrary sender.
    condition {
      test     = "StringLike"
      variable = "ses:FromAddress"
      values   = ["*@${var.ses_domain}"]
    }
  }
}

resource "aws_iam_role_policy" "task_ses" {
  name   = "${local.name}-ses-send"
  role   = aws_iam_role.task.id
  policy = data.aws_iam_policy_document.task_ses.json
}

# ECS Exec (`aws ecs execute-command`) — a shell in the running task, which is the only practical
# way to inspect a Fargate container. Requires enable_execute_command on the service (see ecs.tf).
data "aws_iam_policy_document" "task_exec_ssm" {
  statement {
    sid    = "AllowEcsExec"
    effect = "Allow"
    actions = [
      "ssmmessages:CreateControlChannel",
      "ssmmessages:CreateDataChannel",
      "ssmmessages:OpenControlChannel",
      "ssmmessages:OpenDataChannel",
    ]
    resources = ["*"] # these actions do not support resource-level scoping
  }
}

resource "aws_iam_role_policy" "task_exec_ssm" {
  name   = "${local.name}-ecs-exec"
  role   = aws_iam_role.task.id
  policy = data.aws_iam_policy_document.task_exec_ssm.json
}
