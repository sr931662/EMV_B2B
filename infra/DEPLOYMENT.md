# TravNexa Global — AWS deployment

Amazon SES for transactional email, ECS Fargate for the API, S3 + CloudFront for the SPA.

```
                      ┌──────────────────────────────┐
   browser ──────────▶│  CloudFront                  │
                      │   /*      → S3 (SPA)         │
                      │   /api/*  → ALB              │
                      └──────────────┬───────────────┘
                                     │
                            ┌────────▼────────┐
                            │  ALB (public)   │
                            └────────┬────────┘
                                     │  :4000
                          ┌──────────▼──────────┐
                          │ Fargate task        │
                          │  Express + Prisma   │──▶ Neon Postgres (external)
                          │  task role          │──▶ SES  (SendEmail)
                          └─────────────────────┘
```

Because the SPA and the API share one CloudFront origin, browser calls to `/api/...` are
same-origin and **CORS never applies**.

---

## ⚠️ Read this first: two known constraints

### 1. Ephemeral storage — uploaded files are destroyed on every task replacement

Uploads and generated PDFs are written to the container's local filesystem:

| What | Where | Code |
|---|---|---|
| Payment proof screenshots | `storage/payments/` | `src/middleware/upload.js` |
| Visa passenger documents | `storage/visa-documents/` | `src/middleware/upload.js` |
| Generated quote PDFs | `storage/quotes/{emv,partner}/` | `src/services/pdfService.js` |

Fargate task storage is **ephemeral**. Every deploy, crash, scale-in or AZ replacement destroys all
of it, and the database rows (`Payment.screenshotPath`, `VisaDocumentUpload.filePath`) are left
pointing at files that no longer exist. Downloads then fail.

This was an explicit, accepted decision for this deployment. Two consequences follow:

- **`desired_count` is pinned to 1.** With two tasks, a file uploaded to task A cannot be read back
  by task B, so downloads would 404 at random depending on which task served the request.
- **`FARGATE_SPOT` is not enabled**, since a Spot reclaim would destroy files with two minutes'
  notice.

**Fix it when this matters** — payment proofs are financial evidence:
- *S3* (recommended): `multer.memoryStorage()` + `PutObject`, PDFs streamed to S3, downloads
  redirected to presigned URLs. `screenshotPath` / `filePath` become S3 keys, so the DB schema is
  unchanged. Then raise `desired_count` and enable Spot.
- *EFS*: mount a filesystem at `/app/storage` and change no application code at all. Faster to do,
  more expensive to run.

### 2. SES starts in the sandbox — OTP emails will not reach real users

A new SES account can only send **to verified addresses**, capped at 200 messages/24h. Partner
registration OTPs to real customers are silently dropped, and because `emailService` is
intentionally best-effort (it logs and swallows failures so a broken mailer can never fail a
request), **the app will look like it worked**. See
[Leaving the SES sandbox](#leaving-the-ses-sandbox).

---

## Prerequisites

- Terraform ≥ 1.5, Docker, AWS CLI v2, `jq`, Node 22
- An AWS account, with credentials that can create VPC/ECS/ALB/IAM/SES/S3/CloudFront resources
- A domain you control, to verify for sending
- A Neon Postgres connection string

> **Use Neon's pooled endpoint** — the host containing `-pooler`. Neon auto-suspends idle compute;
> the direct endpoint produces `P1001 Can't reach database server` on the first request after a
> suspend. The pooled endpoint handles cold starts far better.

---

## First deployment

### 1. Configure

```bash
cd infra
cp terraform.tfvars.example terraform.tfvars
```

Fill in `database_url`, `jwt_secret`, `ses_domain`. Prefer keeping secrets out of the file entirely:

```bash
export TF_VAR_database_url='postgresql://...-pooler.../neondb?sslmode=require'
export TF_VAR_jwt_secret="$(openssl rand -hex 32)"
```

### 2. Provision

```bash
terraform init
terraform plan     # read this; it creates ~56 resources
terraform apply
```

`apply` succeeds before any image exists, but the ECS service will sit with a failing task
(`CannotPullContainerError`) until step 5 pushes one. That is expected — the service becomes healthy
after the first `deploy-api.sh`.

### 3. Add the SES DNS records

If `route53_zone_id` was set, Terraform already created them. Otherwise:

```bash
terraform output ses_dns_records_to_create
```

Add every record at your DNS host: 3 DKIM CNAMEs, the MAIL FROM MX and SPF TXT, and the DMARC TXT.
Verification usually completes within minutes of propagation.

```bash
./scripts/ses-test.sh            # confirms verification + sandbox status
```

### 4. Migrate the database

```bash
./scripts/migrate.sh
```

Applies `prisma migrate deploy` and runs the idempotent seed (bootstrap admin + email templates).

### 5. Deploy

```bash
./scripts/deploy-api.sh          # build → ECR → roll the ECS service
./scripts/deploy-frontend.sh     # build → S3 → invalidate CloudFront
terraform output app_url
```

### 6. Verify

```bash
curl "$(terraform output -raw app_url)/health"        # {"status":"ok",...}
curl "$(terraform output -raw app_url)/health/ready"   # {"status":"ready","database":"up"}
./scripts/ses-test.sh you@example.com                  # real send
```

Then log in with the seeded admin (`admin@emv.com` / `Admin@123`) and **change that password
immediately**.

---

## Routine operations

| Task | Command |
|---|---|
| Deploy API | `./scripts/deploy-api.sh` (tags with the git SHA) |
| Deploy frontend | `./scripts/deploy-frontend.sh` |
| Apply migrations | `./scripts/migrate.sh` |
| Tail logs | `aws logs tail "$(terraform output -json deploy_env \| jq -r .log_group)" --follow` |
| Shell in the task | `aws ecs execute-command --cluster <c> --task <id> --container api --interactive --command /bin/bash` |
| Roll back | `aws ecs update-service --cluster <c> --service <s> --task-definition <family>:<older-revision>` |
| Force a restart | `aws ecs update-service --cluster <c> --service <s> --force-new-deployment` |

### Migrations

`deploy-api.sh` does **not** run migrations, and the container does not run them at start-up: a
failing migration in a start-up hook becomes a crash loop that the deployment circuit breaker rolls
back, hiding the actual error.

Run `migrate.sh` **before** `deploy-api.sh`, which means the old code briefly runs against the new
schema. That is safe for additive changes (new nullable column, new table). For a destructive change
(dropping or renaming a column the running code still selects), use the expand/contract pattern:
deploy code that tolerates both shapes, migrate, then remove the old path in a later release.

---

## Leaving the SES sandbox

Check status:

```bash
terraform output -raw sandbox_check_command | bash
```

`ProductionAccessEnabled: false` (or a 200 quota) means you are still sandboxed.

**Request production access** — Console → SES → *Account dashboard* → *Request production access*,
or:

```bash
aws sesv2 put-account-details \
  --production-access-enabled \
  --mail-type TRANSACTIONAL \
  --website-url "https://yourdomain.com" \
  --use-case-description "B2B travel portal. Transactional only: partner account verification OTPs, password resets, payment status notifications and visa application status updates. Recipients are registered travel-agency partners who opted in at signup. No marketing mail. Bounces and complaints are auto-suppressed via a configuration set." \
  --contact-language EN \
  --region ap-south-1
```

Approval typically takes under 24 hours. Strong applications state the mail is transactional, name
the exact triggers, and describe bounce handling — all true here.

**Meanwhile**, verify individual test recipients:

```bash
aws sesv2 create-email-identity --email-identity you@example.com --region ap-south-1
# then click the link that address receives
```

---

## Cost estimate (ap-south-1, low traffic)

| Item | Monthly (USD) |
|---|---|
| Fargate, 1 task @ 0.5 vCPU / 1 GB, always on | ~18 |
| ALB (hourly + minimal LCUs) | ~18 |
| NAT gateway (`tasks_in_private_subnets = true`) | ~32 |
| CloudFront + S3, low volume | ~1–3 |
| Secrets Manager, 2 secrets | ~0.80 |
| CloudWatch logs, 30-day retention | ~1–3 |
| SES | 0.10 per 1,000 emails |
| **Total** | **~70–75** |

Neon is billed separately.

**Biggest saving:** set `tasks_in_private_subnets = false` to drop the NAT gateway (**−$32/mo**).
Tasks then sit in public subnets with a public IP but remain unreachable from the internet, because
their security group admits traffic only from the ALB's security group. Reasonable for staging.

---

## Security notes

- **Two IAM roles, deliberately split.** The *execution* role (ECS agent) pulls images, writes logs
  and reads the two secrets. The *task* role (your code) can only call SES. Merging them would give
  the application ECR and Secrets Manager access it has no use for.
- **No AWS keys anywhere.** SES is reached through the task role, so credentials are short-lived and
  rotated by AWS. There is no SMTP username/password to store or rotate.
- **SES send is constrained by condition**, not just action: `ses:FromAddress` must match
  `*@your-domain`, so the role cannot send as an arbitrary sender even if app config were tampered
  with.
- **Secrets are injected at container start** from Secrets Manager, so they never appear in the
  image or in `ecs:DescribeTaskDefinition` output.
- **S3 is private**, reachable only through CloudFront via Origin Access Control, scoped by
  `AWS:SourceArn` to this one distribution.
- **Terraform state holds `database_url` and `jwt_secret` in plain text.** `infra/.gitignore` blocks
  it from git; switch to the encrypted S3 backend in `versions.tf` before anyone else runs this.
- **Set `api_certificate_arn`.** Without it the ALB is HTTP-only and the CloudFront→ALB hop carries
  JWTs and payment data unencrypted. Acceptable for a smoke test only.

---

## Troubleshooting

**Tasks start then stop immediately**
```bash
aws ecs describe-tasks --cluster <c> --tasks <id> --query 'tasks[0].{stopped:stoppedReason,containers:containers[].reason}'
```
Usually a bad `DATABASE_URL`, or an arm64 image on an X86_64 task definition (build with
`--platform linux/amd64`; `deploy-api.sh` does).

**Target group unhealthy**
`/health` deliberately does not touch the database, so an unhealthy target means the process is not
listening. Confirm the container binds `0.0.0.0` (it does) and that `container_port` matches `PORT`.

**503 from CloudFront on `/api/*`**
The ALB has no healthy targets. Check the service events:
`aws ecs describe-services --cluster <c> --services <s> --query 'services[0].events[:5]'`

**Frontend shows a stale build**
`index.html` is uploaded with `no-cache` and invalidated on each deploy; hashed assets are immutable.
If it persists, invalidate `/*` manually.

**Deep link 404s on refresh**
Handled by the CloudFront 403/404 → `/index.html` rewrites. If you see it, confirm those
`custom_error_response` blocks are still present.

**Emails don't arrive**
Run `./scripts/ses-test.sh you@example.com`. Remember the app itself never surfaces send failures —
by design — so CloudWatch (`[email:ses] sent to ...` or `[emailService] send to ... failed`) and this
script are the only signals.
