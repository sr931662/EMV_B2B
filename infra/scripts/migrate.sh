#!/usr/bin/env bash
#
# Apply Prisma migrations to the deployed database.
#
# Usage: ./migrate.sh
#
# Run this BEFORE deploy-api.sh whenever a release contains a new migration, so the schema is ready
# when the new code starts. (Only safe for additive migrations — see the ordering note in
# DEPLOYMENT.md § Migrations.)
#
# The container image deliberately does NOT run migrations at start-up. With more than one task they
# would race, and a failed migration inside a start-up hook turns into a crash loop that the ECS
# circuit breaker rolls back, hiding the real error.
#
# Because the database is Neon (reachable over the public internet), this runs from your machine or
# CI. No bastion or one-off Fargate task is needed.

set -euo pipefail

INFRA_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
REPO_ROOT="$(cd "${INFRA_DIR}/.." && pwd)"
BACKEND_DIR="${REPO_ROOT}/backend"

cd "${INFRA_DIR}"

if ! ENV_JSON="$(terraform output -json deploy_env 2>/dev/null)"; then
  echo "ERROR: could not read terraform outputs. Run 'terraform init && terraform apply' first." >&2
  exit 1
fi

AWS_REGION="$(jq -r '.aws_region' <<<"${ENV_JSON}")"

# Read the connection string from Secrets Manager rather than asking for it again — one source of
# truth, so it cannot drift from what the running task uses.
SECRET_NAME="$(jq -r '.database_url_secret' <<<"${ENV_JSON}")"

echo "--> Fetching DATABASE_URL from Secrets Manager (${SECRET_NAME})"
DATABASE_URL="$(aws secretsmanager get-secret-value \
  --secret-id "${SECRET_NAME}" \
  --region "${AWS_REGION}" \
  --query 'SecretString' \
  --output text)"

if [[ -z "${DATABASE_URL}" || "${DATABASE_URL}" == "None" ]]; then
  echo "ERROR: DATABASE_URL came back empty." >&2
  exit 1
fi

cd "${BACKEND_DIR}"

echo "--> Pending migration status"
DATABASE_URL="${DATABASE_URL}" npx prisma migrate status || true

# `migrate deploy` only applies existing migration files. Unlike `migrate dev` it never generates a
# migration, never prompts, and never resets the database — it is the only correct command against a
# deployed environment.
echo "--> Applying migrations"
DATABASE_URL="${DATABASE_URL}" npx prisma migrate deploy

echo "--> Seeding (idempotent: creates the bootstrap admin and email templates only if absent)"
DATABASE_URL="${DATABASE_URL}" npm run seed

echo
echo "SUCCESS: database is up to date."
