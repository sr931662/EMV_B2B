# =============================================================================
# Application Load Balancer
# =============================================================================

resource "aws_lb" "api" {
  name               = "${local.name}-api-alb"
  load_balancer_type = "application"
  internal           = false
  security_groups    = [aws_security_group.alb.id]
  subnets            = aws_subnet.public[*].id

  # Node's default server timeout is 0 (no timeout) but the ALB's is 60s; leaving 60 here matches
  # what the app expects and is comfortably above the slowest endpoint (PDF generation).
  idle_timeout = 60

  drop_invalid_header_fields = true
  enable_http2               = true

  # Guard rail: `terraform destroy` on a live environment shouldn't be one command away. Flip to
  # false when you genuinely intend to tear the stack down.
  enable_deletion_protection = false

  tags = { Name = "${local.name}-api-alb" }
}

resource "aws_lb_target_group" "api" {
  name        = "${local.name}-api-tg"
  port        = var.container_port
  protocol    = "HTTP"
  vpc_id      = aws_vpc.main.id
  target_type = "ip" # required for Fargate's awsvpc networking

  health_check {
    enabled  = true
    path     = "/health"
    protocol = "HTTP"
    matcher  = "200"
    interval = 30
    timeout  = 5
    # Two consecutive passes to go healthy, three failures to go unhealthy: quick to bring a new
    # task into service, slow to evict one over a transient blip.
    healthy_threshold   = 2
    unhealthy_threshold = 3
  }

  # /health is deliberately DB-free (see src/index.js) so a database hiccup can't cause the ALB to
  # cycle otherwise-healthy tasks.

  # Give in-flight requests time to finish after a task is pulled out of rotation. Must be shorter
  # than the container's own 20s shutdown drain so the drain isn't cut off mid-request.
  deregistration_delay = 15

  tags = { Name = "${local.name}-api-tg" }
}

# -----------------------------------------------------------------------------
# Listeners
# -----------------------------------------------------------------------------

# Port 80. With a certificate it only redirects; without one it is the actual entry point.
resource "aws_lb_listener" "http" {
  load_balancer_arn = aws_lb.api.arn
  port              = 80
  protocol          = "HTTP"

  dynamic "default_action" {
    for_each = local.alb_https_enabled ? [1] : []
    content {
      type = "redirect"
      redirect {
        port        = "443"
        protocol    = "HTTPS"
        status_code = "HTTP_301"
      }
    }
  }

  dynamic "default_action" {
    for_each = local.alb_https_enabled ? [] : [1]
    content {
      type             = "forward"
      target_group_arn = aws_lb_target_group.api.arn
    }
  }
}

resource "aws_lb_listener" "https" {
  count = local.alb_https_enabled ? 1 : 0

  load_balancer_arn = aws_lb.api.arn
  port              = 443
  protocol          = "HTTPS"
  # TLS 1.2 minimum. The older ELBSecurityPolicy-2016-08 default still permits TLS 1.0/1.1.
  ssl_policy      = "ELBSecurityPolicy-TLS13-1-2-2021-06"
  certificate_arn = var.api_certificate_arn

  default_action {
    type             = "forward"
    target_group_arn = aws_lb_target_group.api.arn
  }
}
