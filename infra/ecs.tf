# =============================================================================
# ECS Fargate cluster, task definition and service
# =============================================================================

resource "aws_cloudwatch_log_group" "api" {
  name              = "/ecs/${local.name}-api"
  retention_in_days = var.log_retention_days
}

resource "aws_ecs_cluster" "main" {
  name = "${local.name}-cluster"

  setting {
    name  = "containerInsights"
    value = "enabled"
  }
}

# FARGATE_SPOT is not listed: Spot tasks can be reclaimed with two minutes' notice, and because
# uploads live on the task's local disk (see below), a reclaim destroys files. Once storage moves to
# S3, adding FARGATE_SPOT here is a straightforward cost win.
resource "aws_ecs_cluster_capacity_providers" "main" {
  cluster_name       = aws_ecs_cluster.main.name
  capacity_providers = ["FARGATE"]

  default_capacity_provider_strategy {
    capacity_provider = "FARGATE"
    weight            = 100
  }
}

# -----------------------------------------------------------------------------
# Task definition
# -----------------------------------------------------------------------------

resource "aws_ecs_task_definition" "api" {
  family                   = "${local.name}-api"
  requires_compatibilities = ["FARGATE"]
  network_mode             = "awsvpc"
  cpu                      = var.task_cpu
  memory                   = var.task_memory
  execution_role_arn       = aws_iam_role.execution.arn
  task_role_arn            = aws_iam_role.task.arn

  runtime_platform {
    operating_system_family = "LINUX"
    # The Dockerfile builds for amd64. If you build on an Apple Silicon machine you must either pass
    # --platform linux/amd64 to docker build (deploy.sh does) or change this to ARM64.
    cpu_architecture = "X86_64"
  }

  container_definitions = jsonencode([
    {
      name      = "api"
      image     = "${aws_ecr_repository.api.repository_url}:${var.image_tag}"
      essential = true

      portMappings = [
        {
          containerPort = var.container_port
          protocol      = "tcp"
        },
      ]

      # Non-secret configuration. Anything sensitive belongs in `secrets` below, because values here
      # are visible to anyone who can call ecs:DescribeTaskDefinition.
      environment = concat(
        [
          { name = "NODE_ENV", value = "production" },
          { name = "PORT", value = tostring(var.container_port) },
          { name = "JWT_EXPIRES_IN", value = "7d" },

          # Email — the SDK path, authenticated by the task role. No SMTP credentials exist.
          { name = "EMAIL_TRANSPORT", value = "ses" },
          { name = "SES_REGION", value = var.aws_region },
          { name = "SES_FROM_ADDRESS", value = local.ses_from_address },
          { name = "SES_CONFIGURATION_SET", value = aws_sesv2_configuration_set.main.configuration_set_name },
        ],
        var.ses_reply_to != "" ? [{ name = "SES_REPLY_TO", value = var.ses_reply_to }] : [],
        var.cors_origin != "" ? [{ name = "CORS_ORIGIN", value = var.cors_origin }] : [],
      )

      # Injected by the ECS agent from Secrets Manager at container start.
      secrets = [
        { name = "DATABASE_URL", valueFrom = aws_secretsmanager_secret.database_url.arn },
        { name = "JWT_SECRET", valueFrom = aws_secretsmanager_secret.jwt_secret.arn },
      ]

      logConfiguration = {
        logDriver = "awslogs"
        options = {
          "awslogs-group"         = aws_cloudwatch_log_group.api.name
          "awslogs-region"        = var.aws_region
          "awslogs-stream-prefix" = "api"
        }
      }

      # Container-level check, independent of the ALB target group check. Catches a wedged process
      # even while the ALB still believes the target is fine.
      healthCheck = {
        command     = ["CMD-SHELL", "node -e \"fetch('http://127.0.0.1:${var.container_port}/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))\""]
        interval    = 30
        timeout     = 5
        retries     = 3
        startPeriod = 20
      }

      # Matches the graceful-shutdown drain in src/index.js (20s) with headroom before SIGKILL.
      stopTimeout = 30

      # Defence in depth: the app only writes under /app/storage, and nothing needs to modify its
      # own code at runtime.
      readonlyRootFilesystem = false # Prisma needs a writable /tmp; see note in DEPLOYMENT.md
    },
  ])
}

# -----------------------------------------------------------------------------
# Service
# -----------------------------------------------------------------------------

resource "aws_ecs_service" "api" {
  name            = "${local.name}-api"
  cluster         = aws_ecs_cluster.main.id
  task_definition = aws_ecs_task_definition.api.arn
  desired_count   = var.desired_count
  launch_type     = "FARGATE"

  # WHY desired_count IS 1 (see also the variable's own documentation):
  # payment proofs, visa documents and generated PDFs are written to the task's local filesystem.
  # A second task cannot serve a file the first one received, so downloads would 404 at random.
  # Raising this requires moving storage to S3 or EFS first.

  enable_execute_command = true # `aws ecs execute-command` for a shell in the running task

  network_configuration {
    subnets         = var.tasks_in_private_subnets ? aws_subnet.private[*].id : aws_subnet.public[*].id
    security_groups = [aws_security_group.tasks.id]
    # A task in a public subnet has no route out without its own public IP; in a private subnet it
    # egresses via NAT and must not have one.
    assign_public_ip = !var.tasks_in_private_subnets
  }

  load_balancer {
    target_group_arn = aws_lb_target_group.api.arn
    container_name   = "api"
    container_port   = var.container_port
  }

  # Don't start counting health-check failures until the app has had time to boot and connect.
  health_check_grace_period_seconds = 60

  # With one task, 100/0 forces stop-then-start: a brief gap, but it avoids ECS being unable to
  # place a second task and stalling the deploy. Raise maximum_percent to 200 once desired_count > 1
  # to get genuinely zero-downtime rolling deploys.
  deployment_minimum_healthy_percent = 0
  deployment_maximum_percent         = 100

  # Automatically roll back to the previous task definition if the new one never goes healthy —
  # without this a bad image leaves the service down until someone notices.
  deployment_circuit_breaker {
    enable   = true
    rollback = true
  }

  # deploy.sh registers new task definition revisions and calls update-service directly, so
  # Terraform must not fight it by reverting to the revision it last recorded.
  lifecycle {
    ignore_changes = [task_definition, desired_count]
  }

  # The listener must exist before the service tries to register targets with its target group.
  depends_on = [
    aws_lb_listener.http,
    aws_lb_listener.https,
  ]

  tags = { Name = "${local.name}-api" }
}
