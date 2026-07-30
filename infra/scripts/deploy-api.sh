#!/usr/bin/env bash
#
# Build the API image, push it to ECR, and roll the ECS service onto it.
#
# Usage:
#   ./deploy-api.sh                 # tag = current git short SHA
#   ./deploy-api.sh v1.4.0          # explicit tag
#
# Requires: docker, aws cli v2, jq, terraform (run from a directory with initialised state).

set -euo pipefail

INFRA_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
REPO_ROOT="$(cd "${INFRA_DIR}/.." && pwd)"
BACKEND_DIR="${REPO_ROOT}/backend"

# ---------------------------------------------------------------------------
# Resolve deployment targets from Terraform outputs rather than hardcoding them, so this script
# cannot drift out of sync with the infrastructure.
# ---------------------------------------------------------------------------
cd "${INFRA_DIR}"

if ! ENV_JSON="$(terraform output -json deploy_env 2>/dev/null)"; then
  echo "ERROR: could not read terraform outputs. Run 'terraform init && terraform apply' in ${INFRA_DIR} first." >&2
  exit 1
fi

AWS_REGION="$(jq -r '.aws_region' <<<"${ENV_JSON}")"
ECR_REPO="$(jq -r '.ecr_repository' <<<"${ENV_JSON}")"
CLUSTER="$(jq -r '.cluster' <<<"${ENV_JSON}")"
SERVICE="$(jq -r '.service' <<<"${ENV_JSON}")"
TASK_FAMILY="$(jq -r '.task_family' <<<"${ENV_JSON}")"

# Immutable tag by default: deploying "latest" repeatedly makes rollback impossible because the tag
# no longer identifies a specific build.
TAG="${1:-$(git -C "${REPO_ROOT}" rev-parse --short HEAD 2>/dev/null || date +%Y%m%d%H%M%S)}"
IMAGE="${ECR_REPO}:${TAG}"

echo "=========================================================="
echo " region   : ${AWS_REGION}"
echo " image    : ${IMAGE}"
echo " cluster  : ${CLUSTER}"
echo " service  : ${SERVICE}"
echo "=========================================================="

# ---------------------------------------------------------------------------
# Build and push
# ---------------------------------------------------------------------------
REGISTRY="${ECR_REPO%%/*}"

echo "--> Logging in to ECR"
aws ecr get-login-password --region "${AWS_REGION}" \
  | docker login --username AWS --password-stdin "${REGISTRY}"

# --platform linux/amd64 is explicit because the task definition declares X86_64. On an Apple
# Silicon machine, omitting it silently produces an arm64 image that ECS refuses to start with an
# "image manifest does not contain descriptor matching platform" error.
echo "--> Building image"
docker build \
  --platform linux/amd64 \
  -t "${IMAGE}" \
  -f "${BACKEND_DIR}/Dockerfile" \
  "${BACKEND_DIR}"

echo "--> Pushing image"
docker push "${IMAGE}"

# ---------------------------------------------------------------------------
# Register a new task definition revision pointing at the new image
# ---------------------------------------------------------------------------
# Taking the live definition and patching only the image keeps every other setting (secrets, env,
# log config) exactly as Terraform defined it, so this script can never quietly diverge from IaC.
echo "--> Registering new task definition revision"
CURRENT_DEF="$(aws ecs describe-task-definition \
  --task-definition "${TASK_FAMILY}" \
  --region "${AWS_REGION}" \
  --query 'taskDefinition' \
  --output json)"

NEW_DEF="$(jq --arg IMG "${IMAGE}" '
  .containerDefinitions[0].image = $IMG
  | del(
      .taskDefinitionArn,
      .revision,
      .status,
      .requiresAttributes,
      .compatibilities,
      .registeredAt,
      .registeredBy,
      .deregisteredAt
    )
' <<<"${CURRENT_DEF}")"

NEW_ARN="$(aws ecs register-task-definition \
  --region "${AWS_REGION}" \
  --cli-input-json "${NEW_DEF}" \
  --query 'taskDefinition.taskDefinitionArn' \
  --output text)"

echo "    ${NEW_ARN}"

# ---------------------------------------------------------------------------
# Roll the service
# ---------------------------------------------------------------------------
echo "--> Updating service"
aws ecs update-service \
  --cluster "${CLUSTER}" \
  --service "${SERVICE}" \
  --task-definition "${NEW_ARN}" \
  --region "${AWS_REGION}" \
  --query 'service.deployments[0].{status:status,desired:desiredCount,running:runningCount}' \
  --output table

echo "--> Waiting for the service to stabilise (deployment circuit breaker will roll back on failure)"
# NOTE: with desired_count=1 and maximum_percent=100 there is a brief gap while the old task stops
# before the new one starts. That is expected for a single-task service.
if aws ecs wait services-stable \
  --cluster "${CLUSTER}" \
  --service "${SERVICE}" \
  --region "${AWS_REGION}"; then
  echo
  echo "SUCCESS: ${SERVICE} is stable on ${TAG}"
  terraform output -raw app_url && echo
else
  echo
  echo "FAILED: the service did not stabilise. Recent logs:" >&2
  aws logs tail "$(jq -r '.log_group' <<<"${ENV_JSON}")" \
    --region "${AWS_REGION}" --since 10m 2>/dev/null | tail -50 >&2 || true
  exit 1
fi
