#!/usr/bin/env bash
#
# Build the Vite SPA, sync it to S3, and invalidate the CloudFront cache.
#
# Usage: ./deploy-frontend.sh
#
# Requires: node/npm, aws cli v2, jq, terraform (initialised state).

set -euo pipefail

INFRA_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
REPO_ROOT="$(cd "${INFRA_DIR}/.." && pwd)"
FRONTEND_DIR="${REPO_ROOT}/frontend"

cd "${INFRA_DIR}"

if ! ENV_JSON="$(terraform output -json deploy_env 2>/dev/null)"; then
  echo "ERROR: could not read terraform outputs. Run 'terraform init && terraform apply' first." >&2
  exit 1
fi

AWS_REGION="$(jq -r '.aws_region' <<<"${ENV_JSON}")"
BUCKET="$(jq -r '.frontend_bucket' <<<"${ENV_JSON}")"
DISTRIBUTION_ID="$(jq -r '.distribution_id' <<<"${ENV_JSON}")"
APP_URL="$(terraform output -raw app_url)"

echo "=========================================================="
echo " bucket       : ${BUCKET}"
echo " distribution : ${DISTRIBUTION_ID}"
echo " url          : ${APP_URL}"
echo "=========================================================="

# ---------------------------------------------------------------------------
# Build
# ---------------------------------------------------------------------------
# VITE_API_URL is intentionally NOT set. A production build defaults to same-origin (see the
# comment in frontend/src/api/client.js), which is exactly right here: CloudFront serves the SPA and
# proxies /api/* to the ALB under one hostname, so the browser makes same-origin relative requests
# and CORS never applies. The bundle also stays independent of any specific API hostname.
#
# Set VITE_API_URL only if you host the API on a different origin from the SPA.
echo "--> Building frontend"
cd "${FRONTEND_DIR}"
npm run build

if [[ ! -f dist/index.html ]]; then
  echo "ERROR: build produced no dist/index.html" >&2
  exit 1
fi

# ---------------------------------------------------------------------------
# Sync
# ---------------------------------------------------------------------------
# Two passes, because the right cache header differs by asset class:
#
#  1. Everything under /assets is content-hashed by Vite (index-a1b2c3.js), so the filename changes
#     whenever the content does. Those are safe to cache for a year, immutably.
#  2. index.html must NEVER be cached long — it is the file that points at the hashed assets. A
#     stale index.html would keep serving the previous build's asset URLs after a deploy.
echo "--> Uploading hashed assets (long-lived cache)"
aws s3 sync dist/ "s3://${BUCKET}/" \
  --region "${AWS_REGION}" \
  --delete \
  --exclude "index.html" \
  --cache-control "public,max-age=31536000,immutable"

echo "--> Uploading index.html (no-cache)"
aws s3 cp dist/index.html "s3://${BUCKET}/index.html" \
  --region "${AWS_REGION}" \
  --cache-control "public,max-age=0,must-revalidate" \
  --content-type "text/html; charset=utf-8"

# ---------------------------------------------------------------------------
# Invalidate
# ---------------------------------------------------------------------------
# Only /index.html and the SPA fallback need invalidating — the hashed assets are new paths, so they
# were never in the cache. Invalidating /* on every deploy is slower and, past 1000 paths a month,
# billed.
echo "--> Invalidating CloudFront cache"
INVALIDATION_ID="$(aws cloudfront create-invalidation \
  --distribution-id "${DISTRIBUTION_ID}" \
  --paths "/" "/index.html" \
  --query 'Invalidation.Id' \
  --output text)"

echo "    invalidation ${INVALIDATION_ID} created"
echo "--> Waiting for it to complete"
aws cloudfront wait invalidation-completed \
  --distribution-id "${DISTRIBUTION_ID}" \
  --id "${INVALIDATION_ID}"

echo
echo "SUCCESS: frontend deployed -> ${APP_URL}"
