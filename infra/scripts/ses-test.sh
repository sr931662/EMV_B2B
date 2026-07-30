#!/usr/bin/env bash
#
# Verify the SES setup: identity status, sandbox status, then an optional real send.
#
# Usage:
#   ./ses-test.sh                        # checks only, sends nothing
#   ./ses-test.sh you@example.com        # also sends one test email
#
# Run this BEFORE trying to register a partner in the deployed app — it isolates "SES is
# misconfigured" from "the app is broken", which the app itself cannot tell you: emailService is
# best-effort by design and swallows send failures so a broken mailer can never fail a request.

set -euo pipefail

INFRA_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "${INFRA_DIR}"

ENV_JSON="$(terraform output -json deploy_env)"
AWS_REGION="$(jq -r '.aws_region' <<<"${ENV_JSON}")"
SES_DOMAIN="$(jq -r '.ses_domain' <<<"${ENV_JSON}")"
FROM_ADDRESS="$(jq -r '.ses_from_address' <<<"${ENV_JSON}")"
RECIPIENT="${1:-}"

echo "=========================================================="
echo " region : ${AWS_REGION}"
echo " domain : ${SES_DOMAIN}"
echo " from   : ${FROM_ADDRESS}"
echo "=========================================================="
echo

# ---------------------------------------------------------------------------
# 1. Is the domain verified and signing?
# ---------------------------------------------------------------------------
echo "--> Identity status"
IDENTITY="$(aws sesv2 get-email-identity \
  --email-identity "${SES_DOMAIN}" \
  --region "${AWS_REGION}" \
  --output json)"

VERIFIED="$(jq -r '.VerifiedForSendingStatus' <<<"${IDENTITY}")"
DKIM_STATUS="$(jq -r '.DkimAttributes.Status' <<<"${IDENTITY}")"
MAIL_FROM="$(jq -r '.MailFromAttributes.MailFromDomainStatus // "n/a"' <<<"${IDENTITY}")"

echo "    verified for sending : ${VERIFIED}"
echo "    DKIM                 : ${DKIM_STATUS}"
echo "    MAIL FROM            : ${MAIL_FROM}"

if [[ "${VERIFIED}" != "true" ]]; then
  echo
  echo "NOT VERIFIED. SES will reject every send until the DNS records exist and propagate."
  echo "If your DNS is not in Route 53, add the records from:"
  echo "    terraform output ses_dns_records_to_create"
  echo
  echo "Required DKIM CNAMEs, for reference:"
  jq -r '.DkimAttributes.Tokens[]? | "    \(.)._domainkey.'"${SES_DOMAIN}"' CNAME \(.).dkim.amazonses.com"' <<<"${IDENTITY}"
  exit 1
fi

# ---------------------------------------------------------------------------
# 2. Sandbox check — the single most common reason "email doesn't work" in a new account
# ---------------------------------------------------------------------------
echo
echo "--> Account sending status"
ACCOUNT="$(aws sesv2 get-account --region "${AWS_REGION}" --output json)"
PRODUCTION="$(jq -r '.ProductionAccessEnabled' <<<"${ACCOUNT}")"
QUOTA="$(jq -r '.SendQuota.Max24HourSend' <<<"${ACCOUNT}")"

echo "    production access : ${PRODUCTION}"
echo "    24h send quota    : ${QUOTA}"

if [[ "${PRODUCTION}" != "true" ]]; then
  cat <<'EOF'

    ** STILL IN THE SES SANDBOX **

    Consequences for this app:
      - mail is only delivered to VERIFIED recipient addresses
      - hard cap of 200 messages / 24h, 1 message / second
      - partner OTP emails to real customers will NOT arrive

    Verify a test recipient:
      aws sesv2 create-email-identity --email-identity you@example.com --region <region>
      (then click the confirmation link that address receives)

    Request production access: see DEPLOYMENT.md § Leaving the SES sandbox
EOF
fi

# ---------------------------------------------------------------------------
# 3. Optional real send
# ---------------------------------------------------------------------------
if [[ -z "${RECIPIENT}" ]]; then
  echo
  echo "No recipient given — skipping the test send."
  echo "Re-run as: $0 you@example.com"
  exit 0
fi

echo
echo "--> Sending a test email to ${RECIPIENT}"

# Bare address for the CLI, since --from-email-address rejects a "Name <addr>" display form here.
FROM_BARE="$(sed -E 's/.*<(.+)>.*/\1/' <<<"${FROM_ADDRESS}")"

set +e
MESSAGE_ID="$(aws sesv2 send-email \
  --region "${AWS_REGION}" \
  --from-email-address "${FROM_BARE}" \
  --destination "ToAddresses=${RECIPIENT}" \
  --content 'Simple={Subject={Data="TravNexa SES test",Charset=UTF-8},Body={Text={Data="If you are reading this, SES is configured correctly and the API can send partner OTP emails.",Charset=UTF-8}}}' \
  --query 'MessageId' --output text 2>&1)"
STATUS=$?
set -e

if [[ ${STATUS} -ne 0 ]]; then
  echo "    FAILED: ${MESSAGE_ID}" >&2
  case "${MESSAGE_ID}" in
    *MessageRejected*|*not\ verified*)
      echo "    Cause: recipient not verified (sandbox) or the From identity is not verified." >&2
      ;;
    *AccessDenied*)
      echo "    Cause: the caller lacks ses:SendEmail. Note this script uses YOUR credentials," >&2
      echo "           not the task role — the app's own permissions are granted separately." >&2
      ;;
  esac
  exit 1
fi

echo "    sent, messageId=${MESSAGE_ID}"
echo
echo "SUCCESS. If it does not arrive, check the spam folder, then bounce/complaint events in the"
echo "'${SES_DOMAIN}' configuration set."
