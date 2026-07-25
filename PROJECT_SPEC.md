# PROJECT_SPEC.md

> **Claude Code: re-read this file at the start of every session before writing or modifying code.**
> These facts are locked. Do not silently change them. If a request conflicts with a rule below, stop and flag the conflict instead of guessing.

## App

B2B travel portal. Travel agencies ("partners") buy holiday packages and visa services from **EMV** (the wholesaler) and resell them, white-labelled, to their own end customers.

## Stack

- Backend: Node.js + Express
- Database: PostgreSQL + Prisma ORM
- Frontend: React + Vite
- Auth: JWT
- Local Postgres: Docker Compose

## Roles

- **admin** — full control, verifies manual payments, manages library + CMS.
- **data_feeder** — intern role, library-only access (can add/edit library entries, cannot touch packages, bookings, payments, or users).
- **partner** — travel agency; browses packages, generates white-labelled quotes, books, pays manually.

## KEY RULES (never violate)

1. **Soft-delete everywhere.** Every deletable entity has an `archived` boolean (or equivalent status flag). Never hard-delete rows. "Deleting" in the UI means setting `archived = true` and excluding archived rows from default queries.
2. **Library entries are COPIED, never linked.** When a partner or admin selects a library entry (hotel, activity, transfer, etc.) into a package, its data is copied into the package at that moment. There is no live foreign-key relationship between a package's contents and the library entry it came from. Editing a package afterwards never touches the library, and editing the library never touches existing packages.
3. **Payment unlocks BOOKING CONFIRMATION only.** Both quote PDFs (EMV quote and white-label quote) are always generatable/downloadable, before and without any payment. Payment/verification only gates the step where a booking becomes "confirmed."
4. **Two quotes per package, always both present:**
   - (a) **EMV-branded quote** — raw EMV price, auto-generated, fixed content sourced from the itinerary page. Shown to partners/admin, never to the end customer.
   - (b) **Partner's white-labelled quote** — partner's own branding, price = raw EMV price + partner's markup, all EMV branding/pricing hidden.
5. **Markup formula:** `selling price = raw EMV price + partner markup`. Markup is set per partner (and/or per package — confirm scope when this is implemented; do not assume per-line-item markup unless specified).
6. **Manual payments only.** No payment gateway integration. Partners pay via UPI/QR/bank transfer and upload a screenshot as proof. An admin manually reviews and verifies the payment before it unlocks booking confirmation.

## Build order (do not reorder without asking)

1. Schema (Prisma models — see `DATA_MODELS.md`)
2. Auth + roles + OTP
3. Data libraries (admin/data_feeder managed reference data: hotels, activities, transfers, etc.)
4. Packages + EMV quote
5. White-label quote (partner markup)
6. Payment + verification (manual, screenshot-based)
7. Visa services
8. Email / notifications
9. Admin CMS
10. Responsive UI polish

## Current status

**Step 1 (schema) complete.** Applied via migrations `20260725120902_init_schema` (17 models,
6 enums) and `20260725122517_add_token_version`. `DATA_MODELS.md` mirrors it.

**Step 2 (auth + roles + OTP) complete — backend only, no frontend.**
- `POST /api/auth/{register,verify-otp,login,forgot-password,reset-password}`, `GET /api/auth/me`
- `authMiddleware` (JWT + live DB re-check), `roleMiddleware(...roles)`, global `errorHandler`,
  `validate(zodSchema)`. Every async handler is wrapped in `asyncHandler` — Express 4 does not
  forward promise rejections, and we use no per-route try/catch.
- Bootstrap admin seeded via `npx prisma db seed` (`admin@emv.com` / `Admin@123`, idempotent).
- OTPs are `console.log`-ed only. Real SMTP delivery is build step 8 — search `TODO: send via email`.
- **Session revocation.** `User.tokenVersion` (Int, default 0) is baked into every JWT and
  compared against the live row on each request; a mismatch is `401 "Session expired, please log
  in again"`. `resetPassword` increments it, so a password reset kills every token minted before
  it — verified end-to-end. `requestPasswordReset` deliberately does **not** increment: it is
  unauthenticated, so bumping there would let anyone force-logout any user by email alone.
  `authService.incrementTokenVersion(userId)` is exported for step 3's admin CMS to call when
  archiving a user. Tokens predating this change carry no `tokenVersion` claim and are rejected.

**Step 3 (data libraries) complete — backend only, no frontend.**
- `/api/destinations`, `/api/day-templates`, `/api/hotels` — full CRUD, one
  controller/service/routes file each, zod-validated bodies/params/query.
- Access, via `roleMiddleware` on every route (`src/utils/roles.js`): write (create/patch/
  archive/restore) = `admin` + `data_feeder`; read = all three roles. Nothing is public —
  each router does `router.use(authMiddleware)` first.
- Soft-delete: `DELETE /:id` sets `archived=true`, `POST /:id/restore` clears it. Lists exclude
  archived unless `?includeArchived=true`. `GET /:id` always returns the row, archived or not,
  so an admin can inspect before restoring.
- `?destinationId=<uuid>` on day-templates and hotels is the dependent-dropdown query the
  package builder will call in step 4.
- Creating a destination whose name matches an **archived** one restores that row (200,
  `restored: true`) instead of 409 — otherwise the unique constraint makes an archived name
  permanently unusable. Name matching is case-insensitive, so the library cannot accumulate
  Dubai/dubai/DUBAI.
- PATCH bodies are `.strict()` and exclude `destinationId`: a library entry never moves
  between destinations.

**RESOLVED — parent-archive visibility: Option B.** Children are hidden when their parent
destination is archived, via a **read-time filter**, and are **never cascade-mutated**.
- Archiving a destination writes nothing to its day templates or hotels. Their own
  `archived` flags stay exactly as they were.
- `GET /api/day-templates` and `GET /api/hotels` — both unfiltered and `?destinationId=` —
  add `destination: { is: { archived: false } }` alongside `archived: false`, so a child under
  an archived destination disappears from browsing.
- `?includeArchived=true` bypasses both conditions and shows everything (admin view).
- `GET /:id` still returns such a row with `200` — a direct fetch by id is a deliberate act,
  not browsing — and the response carries `destinationArchived: true|false` so the UI can warn.
- Restoring the destination makes every child reappear untouched; nothing needs un-archiving.

Why B over cascade: cascading would have to remember which children were *already* archived
before the parent was, in order to restore correctly. The read-time filter keeps
`archived` meaning exactly one thing — "someone archived this row" — and makes destination
archive/restore a pure, reversible, single-row operation.

**Step 4 (packages + EMV quote) complete — backend only, no frontend.**
- `/api/packages` — CRUD + `GET /:id/emv-quote.pdf`. Write (`POST`/`PATCH`/`DELETE`/`restore`)
  is **admin only**; read (list, detail, EMV PDF) is **admin + partner**
  (`CAN_WRITE_PACKAGES` / `CAN_READ_PACKAGES` in `src/utils/roles.js`).
- **`data_feeder` has NO package access at all** — not write, not read, not the EMV PDF. Raw
  wholesale prices are hidden from interns; their world stays library-only
  (`/api/destinations`, `/api/day-templates`, `/api/hotels`). Verified: a data_feeder token
  gets 403 on the package list and on the PDF download, while still getting 200 on the library.
- **Copy-on-select (locked rule 2)** lives in `packageService.buildDayCopies` /
  `buildHotelCopies`. They return *copied scalars only*; `PackageDay`/`PackageHotel` have no
  column that could hold a source id, so the link cannot exist even by accident. `dayNumber` is
  the 1-based position in the caller's `dayTemplateIds` array. Repeated ids are allowed — each
  position becomes an independent copy ("Day at leisure" twice is legitimate).
  Each id must exist, not be archived, and belong to the package's destination, else 400 naming
  `dayTemplateIds[i] (uuid)`. Package + all copies commit in one `$transaction`.
- `days` must equal `dayTemplateIds.length` — enforced on create and on edit against the
  *resulting* values, so changing `days` alone is also a 400.
- `PackageHotel.sortOrder` (Int, default 0; migration `20260725130050_add_packagehotel_sortorder`)
  is the 0-based position in the submitted `hotelIds` array. Detail queries and the EMV PDF order
  hotels by `sortOrder`, **not** alphabetically, so the admin's chosen order (flagship first) is
  what partners and customers see. `PackageDay` needs no equivalent — `dayNumber` already carries
  its order.
- `PATCH` with fresh `dayTemplateIds`/`hotelIds` replaces the itinerary by **archiving** the old
  copies and inserting new ones (rule 1 — never deleted), so superseded itineraries stay
  auditable. All reads filter `archived: false` on the child rows.
- Marketplace `GET /` excludes archived packages and packages under an archived destination
  (Option B), supports `?destinationId= &tag= &minPrice= &maxPrice= &minDays= &maxDays= &search=`
  (title, case-insensitive) plus `?includeArchived=true`, and returns summary fields only.
  `GET /:id` is the full itinerary payload and returns hidden rows with `destinationArchived`.
- **EMV quote PDF (rules 3 & 4a).** `services/pdfService.js` (pdfkit) renders the fixed
  EMV-branded quote at the **raw** price — never markup — from the same payload the itinerary
  page uses, so page and PDF cannot disagree. Written to `backend/storage/quotes/emv/`
  (gitignored) as `emv-quote-<packageId>.pdf`, regenerated on create and every edit, path
  stored **relative** to the backend root in `Package.emvQuotePdfPath`.
  Generation runs *after* the DB transaction commits (filesystem work cannot be transactional);
  if it fails the download route regenerates on demand, so the quote is never permanently
  missing. **No payment check exists anywhere on the download path** — verified with zero
  `Payment` rows in the database.
  Amounts render as `INR 1,84,500.50`, not `₹`: pdfkit's built-in Helvetica is WinAnsi-encoded
  and has no glyph for U+20B9. Embedding a Unicode font is the fix when a brand font arrives.

**Step 5 (white-label quote) complete — backend only, no frontend.**
- `/api/quotes` — `POST`, `GET /`, `GET /:id`, `PATCH /:id`, `DELETE /:id` (archive),
  `POST /:id/confirm-customer`, `GET /:id/quote.pdf`.
- Access: write is **partner only**; read (list, detail, PDF) is **partner + admin**
  (`CAN_WRITE_QUOTES` / `CAN_READ_QUOTES`). `data_feeder` has none.
- **Tenancy.** `quoteService.getForUser` gates every single-quote operation on
  `partnerId === req.user.id` (admin bypasses). "Not found" and "not yours" return the
  **identical 404** — a 403 would confirm the id exists, which leaks across partners.
  Verified: partner B gets 404 on A's detail/PDF/PATCH/DELETE/confirm, and A's quotes are
  absent from B's list.
- **Pricing (rule 5).** `sellingPrice = package.rawPrice + markupAmount`, computed server-side
  with `Prisma.Decimal` (never JS floats — this value gets invoiced). `partnerId` comes from the
  token. Server-owned fields (`sellingPrice`, `partnerId`, `status`, `pdfPath`, …) are stripped
  from request bodies before validation, so a client-sent `sellingPrice` is silently ignored
  rather than rejected. `markupAmount` must be >= 0.
- **Status lifecycle.** Created as `QUOTE_GENERATED`. `PATCH` is allowed **only** in that status;
  afterwards 409 "Quote locked, already in booking flow". `POST /:id/confirm-customer` moves
  `QUOTE_GENERATED -> CUSTOMER_APPROVED` (the partner recording "my customer said yes"); step 6's
  payment flow keys off `CUSTOMER_APPROVED`.
- **The white-label PDF (rule 4b)** — `pdfService.generateQuotePdf(quote, package, partnerProfile)`,
  written to `backend/storage/quotes/partner/quote-<quoteId>.pdf`, regenerated on every edit.
  - `branding: 'OWN'` — every brand element comes from `PartnerProfile`; **no EMV string appears
    anywhere**, including the PDF `/Info` metadata dictionary and the suggested download filename.
  - `branding: 'EMV'` — EMV-branded styling as a presentation choice.
  - **Both modes show `sellingPrice` only.** The raw price and the markup are never printed,
    itemised or totalled in either mode — the customer sees one number.
  - Enforced by a scrub assertion in the smoke test: `"Ease My Vacations"`, `"EMV"`/`"emv"`,
    the raw price (formatted and unformatted), the markup, and the word `"markup"` must each
    occur **zero** times across both the decoded page text *and* the raw file bytes; the
    partner's `companyName` and the selling price must be present. The EMV-mode check finds
    `"Ease My Vacations"` with the same machinery, which proves the scrub is not a vacuous pass.
  - `companyLogo` is only embedded when it resolves to a real local file under `storage/` with a
    png/jpg extension. Remote URLs are **never fetched** — partner-supplied URLs dereferenced
    server-side would be an SSRF vector — and degrade to a text wordmark.
  - Downloadable with no payment, at any status (rule 3), `Cache-Control: no-store`.

**RESOLVED — raw-price drift: snapshot column.** Quotes freeze the wholesale price at creation;
an admin reprice never disturbs an existing quote.
- `Quote.rawPriceAtQuote Decimal(12,2)` (migration `20260725132028_add_quote_rawprice_snapshot`)
  is set from `Package.rawPrice` at the instant the quote is created, and never changes. This is
  locked rule 2's copy-on-select principle applied to price.
- **All selling-price maths uses `rawPriceAtQuote`**, on create *and* on every `PATCH` markup
  recompute: `sellingPrice = rawPriceAtQuote + markupAmount`. The live `Package.rawPrice` is
  never read for arithmetic. A partner who has already handed a customer a quote cannot have its
  numbers moved by EMV repricing the package afterwards.
- `rawPriceAtQuote` is in the stripped `SERVER_OWNED` list — a client can never set or move it.
- `rawPriceChangedSinceQuote` survives on create/detail/update responses as an **informational**
  flag only (snapshot vs live package price). Nothing computes from it.
- Backfill: existing rows took `sellingPrice - markupAmount`, which recovers the exact wholesale
  basis each quote was built on and preserves `sellingPrice = rawPriceAtQuote + markupAmount`.
  Reading the live `Package.rawPrice` instead would have broken that invariant on any repriced
  row. Package price was the documented fallback; verified all 4 dev rows satisfy the invariant.

**RESOLVED — EMV branding cannot be authored into white-label text.** `src/utils/brandGuard.js`
rejects `/emv|ease\s*my\s*vacations/i` in **package titles** and **destination names**, on create
and on edit, with 400 "… cannot contain EMV branding — it would leak into partner white-label
quotes." Both strings are reproduced verbatim inside partner-branded PDFs, so the only reliable
place to stop the leak is where the text is authored — no PDF-renderer care can compensate.

**Archive lock on confirmed quotes.** `DELETE /api/quotes/:id` returns 409 "Cannot archive a
confirmed/completed quote" for `BOOKING_CONFIRMED` and `ORDER_COMPLETED`: those rows are the
commercial record behind a verified payment, and hiding them from default queries would leave the
money trail incomplete. `QUOTE_GENERATED`, `CUSTOMER_APPROVED` and `REJECTED` stay archivable.

**Step 6 (manual payment + admin verification) complete — backend only, no frontend.**
- `POST /api/quotes/:id/payment` (multipart, partner-only, ownership-checked) and the admin queue
  `/api/admin/payments` (`GET /`, `GET /:id`, `GET /:id/screenshot`, `POST /:id/approve`,
  `POST /:id/reject`, `POST /:id/request-info`). The whole `/api/admin/*` surface is admin-only,
  applied once via `router.use(roleMiddleware('admin'))` so no future route can miss it.
- **Uploads.** multer to disk at `backend/storage/payments/` (gitignored). `.jpg/.jpeg/.png/.pdf`
  only, checked on **both** extension and declared MIME type; 5MB limit; client filename is never
  used on disk (random name + validated extension). Path stored relative to the backend root.
  A failed request's orphan upload is removed in the global error handler — the one place every
  failed request passes through.
- **Payment lifecycle.** Submit requires quote `CUSTOMER_APPROVED` (`QUOTE_GENERATED` → 400
  "confirm your customer approved before paying"; anything else → 409 naming the state). Payment
  is created `PENDING_VERIFICATION` and the quote moves `PAYMENT_SUBMITTED` → `PENDING_VERIFICATION`
  in the **same transaction**, so payment and quote state can never desync.
- **Verification.** `approve` → payment `APPROVED` + `verifiedById`/`verifiedAt`, quote
  `BOOKING_CONFIRMED`. This is the only thing that confirms a booking (rules 3 & 6). `reject`
  → payment `REJECTED`, quote **back to `CUSTOMER_APPROVED`** (not `REJECTED`): the customer still
  wants the holiday, only the proof was unusable, so returning it to the payable state lets the
  partner retry without rebuilding the quote. `request-info` → payment `INFO_REQUESTED`, quote
  stays `PENDING_VERIFICATION`. `adminRemarks` is **required** on reject and request-info,
  optional on approve. Admin actions are only valid from `PENDING_VERIFICATION`/`INFO_REQUESTED`,
  else 409 naming the state (so re-approving is a 409).
- **One live payment per quote.** Application check returns a friendly 409; a **partial unique
  index** `Payment_one_live_payment_per_quote` on `quoteId WHERE archived = false AND status IN
  ('PENDING_VERIFICATION','APPROVED')` makes it unraceable. `REJECTED` rows accumulate freely so a
  partner can resubmit; a superseded `INFO_REQUESTED` row is archived, never deleted (rule 1).
  Prisma cannot express a partial unique index, so it is raw SQL in the migration; a violation
  arrives as P2002, which the error handler already renders as 409.
- **Reconciliation.** `amount` is stored exactly as submitted — never coerced to the expected
  figure, since partners legitimately part-pay or round. `Payment.reconciliationMismatch`
  (stored, not derived, so it is a frozen audit signal) is set when `amount !== sellingPrice`,
  and the admin queue surfaces `amount`, `sellingPrice` and the flag side by side.
- **Rule 3 holds throughout.** The quote PDF downloads at `CUSTOMER_APPROVED`,
  `PENDING_VERIFICATION` and `BOOKING_CONFIRMED` alike — verified at each stage. Payment gates
  only the booking, never a document.
- Migration: `20260725133111_add_payment_verification_fields`
  (`Payment.reconciliationMismatch`, `Payment.verifiedAt`, partial unique index).

**Verification SLA message (recorded here as the source of truth — CORRECTED).**
`paymentService.VERIFICATION_SLA_MESSAGE` is shared by both the package (quote) and visa payment
flows, so one edit covers both:
> "Your payment has been submitted successfully. It is currently pending verification by the
> Ease My Vacations team. Verification usually takes 24 to 48 hours."

(Step 6 originally invented a "12-24 hours" wording, in the absence of any SLA text in this file
at the time — that number was wrong and has been replaced. Any earlier reference in this document
to "12-24 hours" or "12 to 24 hours" is superseded by the text above.)

**RESOLVED — `INFO_REQUESTED` was a dead end.** The brief required both "quote stays
PENDING_VERIFICATION" and "a new payment submission supersedes", which contradicted the rule that
payment is only accepted from `CUSTOMER_APPROVED`. Resolution: submission is also allowed when the
quote is `PENDING_VERIFICATION` **and** it has a live `INFO_REQUESTED` payment. The quote stays
under review (it is not handed back to the partner) while the corrected proof can still be sent.

**Step 7 (visa services) complete — backend only, no frontend.**
- `/api/visa-countries` (+ nested `/:countryId/documents`), `/api/visa-requests`,
  `/api/admin/visa-requests/:id/complete`. `POST /api/visa-requests/:id/payment` reuses step 6's
  `paymentService`/upload machinery exactly, and `/api/admin/payments` (from step 6) now handles
  `type: VISA` rows too.
- **Access.** Country + required-document config: write = admin only; read = **every
  authenticated role, `data_feeder` included** (`CAN_READ_VISA_CONFIG`) — unlike packages/quotes,
  there is no pricing data here for interns to be kept away from, and the brief specified
  "authenticated read". Visa requests: write = partner only; read = partner (own) + admin (all,
  `?partnerId=`) — same shape as quotes, including the identical-404 tenancy pattern
  (`visaRequestService.getForUser`, verified: partner B gets 404 on A's detail, document upload,
  and payment).
- **Country config mirrors destinations exactly:** case-insensitive name matching, archived-name
  restore-instead-of-409, and Option B (a required document is hidden from the browsing list when
  its country is archived, via read-time filter, `?includeArchived=true` bypasses it).
- **`applicationNumber`** is `VISA-<time36>-<random hex>` — readable enough to quote over the
  phone. `@unique` in the schema; a generation retry loop (5 attempts) handles the
  astronomically-unlikely collision case rather than surfacing a raw P2002.
- **Passengers use the replace-pattern from packages:** `PATCH` with a fresh `passengers` array
  archives the old rows and inserts new ones in one transaction, allowed only while
  `APPLICATION_SUBMITTED` (locked, same reasoning as quotes after `QUOTE_GENERATED`). Going
  further than the package precedent: the superseded passengers' **document uploads are archived
  alongside them**, because an upload has no meaning independent of the passenger it was
  submitted for — unlike Option B's day-templates/hotels, which stay independently useful under
  an archived destination. Verified: replacing passengers resets `documentReadiness.readyToSubmit`
  to `false`, and the old passenger's uploads are all `archived: true` afterward.
- **Document upload (Part C).** `documentName` is validated against **the request's own frozen
  checklist snapshot** (see "RESOLVED — visa checklist snapshot" below), not the country's live
  list, then copied onto `VisaDocumentUpload` as a plain string — never an FK back to
  `VisaRequiredDocument` (locked rule 2) — so re-configuring the checklist later can never
  invalidate an already-submitted upload. A second upload for the same `documentName` supersedes
  the first (old row archived, new row inserted). Files land in `backend/storage/visa-documents/`
  (gitignored), distinct from payment screenshots.
  **No status gate** — unlike `PATCH` passengers, the brief did not restrict when a document may
  be uploaded, so uploading/replacing is allowed at any request status. Worth revisiting if
  uploads should freeze once `VISA_PROCESSING_STARTED`.
- **`readyToSubmit` (the validate-before-submission gate) reads the request's OWN frozen
  checklist snapshot — see "RESOLVED — visa checklist snapshot" below.** Verified end-to-end:
  uploading each passenger's mandatory document flips `readyToSubmit` from `false` to `true`, and
  replacing passengers resets it.
- **Payment (Part D) mirrors step 6's quote-payment flow field-for-field:** payable only from
  `APPLICATION_SUBMITTED` (or `PENDING_VERIFICATION` with a live `INFO_REQUESTED` payment, same
  supersede exception quotes already needed), blocked while a `PENDING_VERIFICATION`/`APPROVED`
  payment exists, `PAYMENT_SUBMITTED` → `PENDING_VERIFICATION` in one transaction. The one addition
  is the `readyToSubmit` precondition, checked after the status gate and before the blocking-payment
  check: 400 "Upload all mandatory documents for every passenger first" (with the `missing` list)
  if not ready.
- **`Payment.reconciliationMismatch` is always `false` for `VISA` rows.** `VisaRequest` carries no
  price/fee field anywhere in the schema, so — unlike quotes, where `amount` is checked against
  `sellingPrice` — there is nothing to reconcile a visa payment's amount against. If EMV wants fee
  reconciliation for visas, a fee field needs adding to `VisaRequest`; out of scope for this step
  since it was not requested.
- **Admin verification reuses `/api/admin/payments` unchanged at the route level.**
  `paymentService.toQueueRow` now returns one stable superset shape for both types (`packageTitle`
  /`destination`/`leadName`/`sellingPrice`/`quoteStatus` are `PACKAGE`-only;
  `countryName`/`applicationNumber`/`passengerCount`/`visaRequestStatus` are `VISA`-only; unused
  fields are `null`), so the admin queue UI can render both without a type switch.
  `approve`/`reject` branch on `payment.quoteId` vs `payment.visaRequestId`: **approve** lands the
  visa request directly on `VISA_PROCESSING_STARTED` (the brief allowed one hop or two through an
  intermediate `PAYMENT_APPROVED` write — one hop was chosen, since nothing ever reads a resting
  `PAYMENT_APPROVED` value); **reject** returns it to `APPLICATION_SUBMITTED` (same "the deal is
  still alive, only the proof was bad" reasoning as quotes → `CUSTOMER_APPROVED`); **request-info**
  is already generic and needed no change (it never touched quote/visa-request status).
  `POST /api/admin/visa-requests/:id/complete` (new, admin-only) moves
  `VISA_PROCESSING_STARTED` → `COMPLETED`; guarded 409 from any other status.
- **One live payment per visa request** — partial unique index
  `Payment_one_live_payment_per_visa_request` on `visaRequestId WHERE archived = false AND status
  IN ('PENDING_VERIFICATION','APPROVED')`, mirroring `Payment_one_live_payment_per_quote` exactly.
  `quoteId`/`visaRequestId` are mutually exclusive per row and both nullable, so the two indexes
  never interact. Migration: `20260725135328_add_visarequest_payment_index`.
- **Archive lock** on `VisaRequest`: 409 once `PAYMENT_APPROVED`/`VISA_PROCESSING_STARTED`/
  `COMPLETED` (`PAYMENT_APPROVED` included defensively — it is not a resting value in practice
  since approval writes `VISA_PROCESSING_STARTED` directly, but the guard costs nothing and covers
  a future code path or a crash mid-transition). Verified: archive blocked immediately after
  approval and again after completion.
- **Verification SLA wording** — reused `paymentService.VERIFICATION_SLA_MESSAGE` for both package
  and visa submissions (one shared constant). The wording itself was corrected in a later pass:
  see "Verification SLA message" above — it now reads "24 to 48 hours", not the step-6 original
  "12-24 hours".
- **Verification performed:** no exhaustive smoke-test suite was written for this step (per
  instruction), but a lightweight route-wiring check (auth/role/param-validation on every new
  endpoint, including the nested `mergeParams` router) and one full lifecycle pass (39 assertions:
  create → readiness gate → per-passenger upload/replace → passenger replace resets readiness →
  cross-tenant 404s → payment → admin queue shows `type: VISA` fields → approve →
  `VISA_PROCESSING_STARTED` → archive-blocked → complete → `COMPLETED` → archive-blocked-again)
  both passed. All 8 pre-existing smoke suites (steps 2–6 plus the two hardening passes) were
  re-run afterward and still pass — `paymentService.js` and `src/utils/roles.js` were both
  modified by this step.

**Open/ambiguous item not resolved in this step:** `VisaRequestStatus.REJECTED` (an enum value
distinct from `PaymentStatus.REJECTED`) is never set by any code path built here — payment
rejection sends the request back to `APPLICATION_SUBMITTED`, not to this value. It may be meant
for an admin to reject an application outright (independent of any payment), but no such
endpoint was in the brief, so none was built. Flagging rather than guessing at the intended flow.

**RESOLVED in step 9** — `POST /api/admin/visa-requests/:id/reject-application` now sets this
value. See step 9's carried-over fix #3.

**RESOLVED — visa checklist snapshot: copy-on-select applied a third time.** `readyToSubmit`
originally read the country's LIVE `VisaRequiredDocument` list, which meant an admin editing a
country's checklist after a request was created could shift the requirements underneath a partner
who had already satisfied the old one — potentially blocking payment for someone who did
everything right. Fixed the same way as `PackageDay`/`PackageHotel` (rule 2) and
`Quote.rawPriceAtQuote`: freeze a copy at the moment of creation.
- `VisaRequestRequiredDoc` (migration `20260725141349_add_visarequest_required_doc_snapshot`):
  `id`, `visaRequestId` (FK → `VisaRequest`, `onDelete: Restrict`), `documentName`, `isMandatory`,
  `archived`, timestamps. **No FK to `VisaRequiredDocument`** — deliberately, so re-configuring
  the checklist later can never reach an existing request's copy.
- On `VisaRequest` create, the country's current non-archived `VisaRequiredDocument` rows are
  copied into `VisaRequestRequiredDoc` for that request, **in the same transaction** as the
  request + passengers (`visaRequestService.createRequestWithRetry`).
- `readyToSubmit`, the missing-docs list, the request detail's `requiredDocuments`, and the
  document-upload `documentName` recognition check **all now read the request's own snapshot**
  (`visaRequestService.getRequiredDocSnapshot`) — never the live country list.
  `visaDocumentService.listActiveRequiredDocuments` (the live list) is now used only at the one
  moment it should be: taking the snapshot at request creation.
- Backfill: existing requests had no snapshot at all (the table didn't exist), so each was
  backfilled from its country's *current* checklist — the closest available approximation, since
  no earlier record of "the checklist as it stood at creation" exists anywhere. A request whose
  country checklist is empty simply gets zero snapshot rows.
- Verified directly (11 checks): a request's `requiredDocuments` stays exactly what it was at
  creation after the admin adds a new mandatory document to the country; the new document is
  correctly rejected as "not a recognized document for this request" if uploaded against the old
  request; `readyToSubmit` stays `true` on the old request despite the live checklist growing;
  payment succeeds on the old request despite the drift; a **new** request created after the edit
  correctly picks up both documents in its own snapshot.

**Step 8 (email automation + in-app notifications) complete — backend only, no frontend.**
- `EMAIL_TRANSPORT` env var picks the transport: `console` (default) renders the full email to
  the server console; `smtp` uses `nodemailer` against `SMTP_HOST`/`SMTP_PORT`/`SMTP_USER`/
  `SMTP_PASS`/`SMTP_FROM` (already in `.env.example`, wired but inert with placeholder creds).
  `services/emailService.js` — `sendEmail({to,subject,html,text})` **never throws**: every send
  is try/caught and logged, so a broken transport can never fail the request that triggered it,
  let alone roll back a DB write it runs near.
- **`EmailTemplate`-driven content.** `renderTemplate(name, vars)` loads the row by `name`,
  interpolates `{{placeholder}}` (missing vars render as empty string, not `"undefined"`), and
  returns `{subject, html, text}` — `text` is a crude tag-stripped fallback, since
  `EmailTemplate` has only one `body` field. An unknown/archived template name falls back to a
  generic inline message rather than crashing the caller (verified). 12 templates seeded via
  `prisma/seed.js` (`seedEmailTemplates`, create-only/idempotent by `name` — re-running the seed
  after an admin hand-edits a template's wording in the future CMS must never revert it):
  `partner_welcome_otp`, `partner_password_reset`, `package_payment_submitted`,
  `package_payment_approved`, `package_payment_rejected`, `visa_request_submitted`,
  `visa_payment_approved`, `visa_payment_rejected`, `visa_processing_started`, `visa_completed`,
  `admin_new_package_order`, `admin_new_visa_request`.
- **In-app notifications.** `services/notificationService.js` — `createNotification(userId, type,
  message)`, `createNotificationForMany(userIds, type, message)` (fan-out to all admins),
  `listActiveAdminUsers()` (single definition of "admin" reused by both the email and
  notification sides, per the locked instruction "Admin recipient = all active admin users'
  emails"). `GET /api/notifications` (`?unreadOnly=true`), `GET /api/notifications/unread-count`,
  `POST /:id/read`, `POST /read-all`, `DELETE /:id` (archive) — every role gets its own bell feed
  (partner AND admin), ownership-checked with the same identical-404 pattern as
  quotes/visa-requests (`notificationService.getForUser`; verified: admin marking a partner's
  notification read gets 404, and each user's list never contains another user's rows).
- **`afterCommit(fn)`** (`src/utils/afterCommit.js`) wraps every email + notification call site:
  it runs strictly after the triggering `prisma.$transaction`/`update` has already resolved, and
  catches/logs any error from `fn` rather than letting it propagate — a Notification insert or an
  email send failing can never unwind a payment approval or a booking confirmation that already
  committed.
- **Event → email → notification wiring** (full table below). Fired from `authService`
  (registration, forgot-password), `paymentService` (submit/approve/reject for both `PACKAGE` and
  `VISA` payments — the existing `notifyPlaceholder` TODOs are gone, replaced in place), and
  `visaRequestService.complete()`.
- **Verification performed:** no exhaustive per-step smoke suite (per instruction), but a
  43-assertion pass through every event in the table below — registration/reset emails,
  full package payment lifecycle (submit → approve, and a second quote through reject, and a
  third through request-info), full visa lifecycle (submit → approve → complete), and all five
  notification endpoints including cross-user ownership — all passed, plus the emailService
  bug below was caught and fixed by it. All 11 pre-existing smoke/lifecycle suites were re-run
  afterward and still pass — `authService.js`, `paymentService.js`, and
  `visaRequestService.js` were all touched by this step.

**Bug caught during verification (fixed, not just noted):** `emailService.renderTemplate`'s
fallback path (used when a template name isn't found) destructured a `{ subject, html }` object
while the real code path expects `{ subject, body }` (matching `EmailTemplate`'s actual column
names) — so a missing-template fallback was silently rendering as an **empty** email instead of
the intended placeholder text. Caught by directly testing the fallback path before wiring
anything into it; fixed by making `fallbackTemplate` return the same `{subject, body}` shape as a
real database row.

### Event → email template → notification mapping

| Event (where it fires) | Partner email | Partner notification `type` | Admin email | Admin notification `type` |
|---|---|---|---|---|
| Partner registers (`authService.registerPartner`) | `partner_welcome_otp` | — | — | — |
| Forgot/reset password (`authService.requestPasswordReset`) | `partner_password_reset` | — | — | — |
| Package payment submitted (`paymentService.submitForQuote`) | `package_payment_submitted` | `PAYMENT_SUBMITTED` | `admin_new_package_order` | `ADMIN_NEW_PACKAGE_ORDER` |
| Package payment approved (`paymentService.approve`, `quoteId` branch) | `package_payment_approved` | `PAYMENT_APPROVED` | — | — |
| Package payment rejected (`paymentService.reject`, `quoteId` branch) | `package_payment_rejected` | `PAYMENT_REJECTED` | — | — |
| Visa payment submitted (`paymentService.submitForVisaRequest`) | `visa_request_submitted` | `VISA_REQUEST_SUBMITTED` | `admin_new_visa_request` | `ADMIN_NEW_VISA_REQUEST` |
| Visa payment approved (`paymentService.approve`, `visaRequestId` branch) | `visa_payment_approved` **and** `visa_processing_started` (both fire — approval lands on `VISA_PROCESSING_STARTED` in one hop) | `PAYMENT_APPROVED` **and** `VISA_PROCESSING_STARTED` (both created) | — | — |
| Visa payment rejected (`paymentService.reject`, `visaRequestId` branch) | `visa_payment_rejected` | `PAYMENT_REJECTED` | — | — |
| Payment info requested — either type (`paymentService.requestInfo`) | `payment_info_requested` *(step 9 fix — was "none" in step 8)* | `INFO_REQUESTED` | — | — |
| Visa completed (`visaRequestService.complete`) | `visa_completed` | `ORDER_COMPLETED` | — | — |
| Quote created (`quoteService.create`, step 9 fix) | — | `QUOTE_READY` (fires after the PDF is actually generated) | — | — |
| Visa application rejected outright (`visaRequestService.rejectApplication`, step 9 fix, admin action) | `visa_application_rejected` | `VISA_REQUEST_REJECTED` | — | — |

**Judgment calls / things flagged rather than guessed:**
1. **RESOLVED in step 9 — `request-info` now sends `payment_info_requested`.** Originally fired
   only an in-app notification since none of step 8's 12 templates covered it. See step 9's
   carried-over fix #1.
2. **`partner_password_reset` is used for every role**, not just partners. `requestPasswordReset`
   in `authService` is generic across admin/data_feeder/partner, but only one reset template was
   specified and its name assumes a partner. The body wording was kept role-neutral ("Hello,"
   rather than "Dear partner") specifically so it doesn't read wrong for a staff account, but the
   template's *name* still says "partner". Flagging in case a role-neutral template name is
   preferred later.
3. **RESOLVED in step 9 — `QUOTE_READY` now fires** from `quoteService.create`, once the PDF has
   actually been generated. See step 9's carried-over fix #2.
4. **Two notifications fire for one admin action on visa approval** (`PAYMENT_APPROVED` +
   `VISA_PROCESSING_STARTED`), mirroring the two emails the brief explicitly asked for
   ("`visa_payment_approved` + `visa_processing_started` as appropriate"). Kept 1:1 parity
   between email and bell-feed rather than collapsing to a single notification.
5. **Admin emails are fanned out with `Promise.all`, not sequentially** — if there are ever many
   admins this sends concurrently rather than one at a time. Each `sendEmail` already never
   throws, so a slow/broken transport for one admin cannot stall or fail the others.
6. **`afterCommit` awaits its callback rather than truly backgrounding it** (no job queue exists).
   This means a request's response waits for all emails/notifications to finish sending before
   returning — negligible for the console transport, real latency once SMTP is live. Acceptable
   for now since correctness (errors caught, never rolls back state) was the requirement, not
   response latency; a queue is the natural upgrade if SMTP send time becomes noticeable.

**Step 9 (admin CMS + 3 carried-over fixes) complete. BACKEND IS NOW COMPLETE (steps 1–9).**
No frontend exists anywhere in this codebase — every endpoint below has been exercised only via
HTTP calls from Node scripts, never a browser. Step 10 (responsive UI) is the only remaining
build-order item.

- **Agency (partner) management** — `/api/admin/agencies`: `GET /` (`?search=` on
  company/email, `?status=active|suspended|unverified`, `?includeArchived`), `GET /:id` (profile
  + quotes + visa requests + payment history, all including archived rows — an audit view, not a
  browsing list), `POST /:id/suspend` (archive + `authService.incrementTokenVersion`), `POST
  /:id/activate` (un-archive only, tokenVersion untouched — they log in fresh). Verified
  end-to-end: a partner's token works, gets suspended, the SAME token is immediately rejected by
  `authMiddleware`'s existing DB re-check (401) with no new code needed there, gets reactivated,
  and even the OLD pre-suspension token stays dead (tokenVersion bump persists across
  activate) — only a fresh login works again.
- **`status` and `includeArchived` interaction (judgment call):** `status=suspended` itself
  means "show archived rows", so it overrides `includeArchived` rather than requiring both.
  Buckets (`active`/`suspended`/`unverified`) are mutually exclusive by construction, so they
  can never double-count one agency.
- **Staff user management** — `/api/admin/users`: `GET /` (admin + data_feeder only; partners
  live at `/agencies`), `POST /` (thin wrapper over the existing `authService.createStaffUser` —
  `isVerified: true`, no OTP), `POST /:id/suspend` + `/:id/activate` (same archive+revoke
  pattern). **An admin cannot suspend their own account** (400) — checked before the target-role
  lookup. Cross-resource guard verified: `/agencies/:id/suspend` on a `data_feeder` id and
  `/users/:id/suspend` on a partner id both 404 (each route only recognises its own role scope).
- **Email template CRUD** — `/api/admin/email-templates`: full `GET /`, `GET /:id`, `POST /`
  (name must be a safe lowercase identifier — it's a code-referenced lookup key, not a display
  name), `PATCH /:id` (`subject?`/`body?`, name immutable once created), `DELETE /:id` (archive).
  **`POST /:id/restore` was added beyond the brief's literal route list** — every other
  archivable resource in this app has one, and archiving a template with no way back would be a
  real gap; the brief simply didn't enumerate it. `emailService.renderTemplate` already treats a
  missing-or-archived name as "fall back to the generic message" (`where: {name, archived:
  false}`), so archiving needed no new guard — confirmed by inspection, not just assumed.
- **Reports/analytics** — `GET /api/admin/reports/summary` (single endpoint, a fixed number of
  grouped/aggregate Promise.all queries regardless of data volume — verified against real
  accumulated dev data, not just an empty DB). Shape:
  ```
  {
    generatedAt, dateRange: {from,to} | null,
    agencies:      { total, active, suspended, unverified },
    packages:      { active },
    quotes:        { total, byStatus: { <every QuoteStatus>: count } },
    visaRequests:  { total, byStatus: { <every VisaRequestStatus>: count } },
    payments: {
      totalSubmitted, pendingVerification,
      approved: { count, revenue },
      rejected,
    },
    recentActivity: [ { paymentId, agencyName, type, amount, status, date } ×10 ],
  }
  ```
  `byStatus` is always zero-filled for every enum value, even ones with no rows yet, so a
  dashboard never has to handle a missing key. `?from=&to=` apply **only** to the `payments`
  block (verified: a date range in 2020 correctly returns `totalSubmitted: 0` against a DB full
  of 2026 test data) — agency/package/quote/visa counts are point-in-time totals, not
  windowed history, per the brief.
- **Revenue formula (judgment call, matches the brief's exact wording):** approved package
  revenue sums the **quote's `sellingPrice`**, not `payment.amount` — a partner may legitimately
  part-pay or round (`reconciliationMismatch`), so `sellingPrice` is the true expected revenue.
  Approved visa revenue sums `payment.amount` directly, since `VisaRequest` has no price field at
  all — it's the only number that exists. The two are summed as `Prisma.Decimal`, never floats.
- **Partner dashboard** — `GET /api/dashboard` (partner-only; admin hitting it gets 403, verified,
  and a partner hitting `/api/admin/reports/summary` also gets 403). Shape:
  ```
  {
    quotes:       { total, byStatus: {...} },
    visaRequests: { total, byStatus: {...} },
    pendingPayments, approvedOrders,
    recentActivity: [ { paymentId, subject, type, amount, status, date } ×10 ],
    unreadNotifications,
    latestPackages: [ ...packageService summary rows ×5 ],
  }
  ```
  Every query is pre-scoped to `partnerId: user.id` (or, for payments, an OR-across-`quote`/
  `visaRequest` relation filter — the same pattern proven in step-7's agency detail query).
  `recentActivity` orders by `updatedAt`, not `createdAt`, so a payment's later approval/
  rejection re-surfaces it as recent, not just its original submission.

**Three carried-over fixes, closing gaps flagged in steps 7 and 8:**

1. **`payment_info_requested` email (13th template).** `paymentService.requestInfo`
   previously fired only an in-app notification because no template covered it (flagged in step
   8). Now sends `payment_info_requested` to the partner with `{companyName, subject, remarks}`
   for **both** `PACKAGE` and `VISA` payments — `subject` is a pre-built phrase
   (`"Bali Escape 2N"` or `"visa application VISA-…"`) computed once and reused for both the
   email and the existing notification message. Verified: the email now fires where previously
   none did.
2. **`QUOTE_READY` notification.** `quoteService.create` now fires it via `afterCommit`, **after**
   `refreshQuotePdf` has actually run — so the notification's "ready to download" claim is true
   at the moment it's sent, not merely once the DB row exists. Verified: creating a quote
   produces a `QUOTE_READY` row naming the package.
3. **`POST /api/admin/visa-requests/:id/reject-application`** (body: `adminRemarks`, required).
   Sets `VisaRequestStatus.REJECTED` — an enum value nothing in steps 1–8 ever set (flagged as an
   open item in step 7). Allowed only from `APPLICATION_SUBMITTED`/`PENDING_VERIFICATION`; 409
   naming the state otherwise — verified refused once `VISA_PROCESSING_STARTED`. **Distinct from
   `paymentService.reject`**, which only rejects one payment and keeps the application alive at
   `APPLICATION_SUBMITTED` for a resubmission; this kills the whole application outright, and
   deliberately does not touch any Payment row on the request (no cascade was requested).
   **Deviation from the brief's literal wording, made for correctness:** the brief described the
   email as "`visa_payment_rejected`-style", but that template's actual body says "please review
   and submit a corrected payment" — which is simply wrong once the whole application is
   rejected; there is nothing left to resubmit. Added a distinct `visa_application_rejected`
   template (14th) with correct wording instead of reusing one that would mislead the partner.
   Verified: the sent email's text does **not** contain "corrected payment".

**Bug caught during verification (not just a judgment call):** none new in this step — the step-8
`emailService` fallback bug was already fixed in that step. This step's 59-assertion check found
zero defects in the new code on its own; the ONE real bug found while building this step was
in the *test harness itself* (a reused multipart upload helper hardcoded the field name
`"screenshot"`, silently 400'ing when reused against the document-upload endpoint, which expects
`"document"` — caught because a downstream `null.id` crashed the check script rather than being
swallowed, then traced and fixed in the test, not the app).

**Verification performed:** no exhaustive per-step smoke suite (per instruction), but a
59-assertion pass covering every new endpoint above plus both dashboard payload shapes and all
three carried-over fixes — all passed. All 12 pre-existing smoke/lifecycle suites (steps 2–8)
were re-run afterward and still pass — `paymentService.js`, `quoteService.js`,
`visaRequestService.js`, and `src/utils/roles.js` were all touched by this step.

### Full backend endpoint surface (all 9 steps)

| Area | Base path | Access |
|---|---|---|
| Auth | `/api/auth` | public (register/login/OTP/reset) + self (`/me`) |
| Data libraries | `/api/destinations`, `/api/day-templates`, `/api/hotels` | write: admin+data_feeder; read: all roles |
| Packages | `/api/packages` (+ `/:id/emv-quote.pdf`) | write: admin; read: admin+partner |
| Quotes | `/api/quotes` (+ `/:id/quote.pdf`, `/:id/payment`) | write: partner (own); read: partner (own)+admin |
| Visa config | `/api/visa-countries` (+ nested `/:countryId/documents`) | write: admin; read: all roles |
| Visa requests | `/api/visa-requests` (+ passenger documents, `/:id/payment`) | write: partner (own); read: partner (own)+admin |
| Payment verification | `/api/admin/payments` | admin only |
| Visa admin actions | `/api/admin/visa-requests` (`/:id/complete`, `/:id/reject-application`) | admin only |
| Notifications | `/api/notifications` | self only, every role |
| **Agencies (new)** | `/api/admin/agencies` | admin only |
| **Staff users (new)** | `/api/admin/users` | admin only |
| **Email templates (new)** | `/api/admin/email-templates` | admin only |
| **Reports (new)** | `/api/admin/reports/summary` | admin only |
| **Partner dashboard (new)** | `/api/dashboard` | partner only |

### Deferred to the frontend phase (step 10) — not built, not started

- All UI/UX: every response above has been validated by direct HTTP calls only.
- File upload widgets, PDF viewers/download buttons, the notification bell, admin CMS screens
  for every resource above.
- Anything requiring a running browser session (login flow UX, form validation feedback, toast/
  error presentation) — the API returns structured errors (`{error, details?}`) but nothing
  renders them yet.
- Real SMTP sending was never exercised end-to-end against a live mail server — only the
  `console` transport has been used in every verification pass. `EMAIL_TRANSPORT=smtp` is wired
  (`nodemailer` + `SMTP_*` env vars) but inert with placeholder credentials.
- A job queue for email/notification delivery (`afterCommit` still awaits inline — flagged in
  step 8, unchanged here since no queue infrastructure was requested).
