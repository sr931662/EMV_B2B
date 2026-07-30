# API_SURFACE.md

Ground-truth inventory of every backend endpoint that actually exists, read directly from
`backend/src/routes/*.js` (not from memory, not from `PROJECT_SPEC.md`'s prose — those are
cross-checked against this, not the other way round). **The frontend must only call endpoints
listed here.** If a screen needs something not on this list, that's a backend gap to raise, not
a route to invent.

All routes are mounted under `/api` (see `backend/src/index.js`). Base URL comes from
`VITE_API_URL` (default `http://localhost:4000`).

Every route except `POST /api/auth/register|login|verify-otp|forgot-password|reset-password`
requires `Authorization: Bearer <token>`. A 401 means "not logged in / session expired"; the
frontend should clear auth state and redirect to `/login` on any 401 (see `src/api/client.js`).

Tenancy note that matters for error handling: quotes and visa requests return **404**, not 403,
when a partner requests a resource that exists but isn't theirs (deliberate — a 403 would leak
that the id exists). Don't special-case this in the UI beyond a normal "not found" state.

---

## 1. Auth — `/api/auth`

| Method | Path | Access | Body | Notes |
|---|---|---|---|---|
| POST | `/register` | public | `{companyName, companyLogo?, ownerName, gstNumber, panNumber?, businessEmail, mobile, officeAddress, city, state, country, pincode, website?, password}` | Partner self-registration. Creates `User(role=partner, isVerified=false)` + `PartnerProfile`. `businessEmail` doubles as the login email. Returns the user (no token yet — must verify OTP first). |
| POST | `/verify-otp` | public | `{email, otp}` | OTP is 6 digits, 10 min TTL, delivered by email (console-logged in dev). Returns `{user, token, expiresIn}`. |
| POST | `/login` | public | `{email, password}` | 403 if not verified or archived (suspended). Returns `{user, token, expiresIn}`. |
| POST | `/forgot-password` | public | `{email}` | Always returns the same generic 200 message, whether or not the email exists (no account enumeration). |
| POST | `/reset-password` | public | `{email, otp, newPassword}` | Also revokes all existing sessions (bumps `tokenVersion`) — old tokens stop working immediately. |
| GET | `/me` | self | — | Returns `{user}` including `partnerProfile` if the caller is a partner. Use this to rehydrate auth state on page load. |

---

## 2. Data libraries — `/api/destinations`, `/api/day-templates`, `/api/hotels`

Write (create/patch/archive/restore): **admin + data_feeder**. Read: **all three roles**.
Soft-delete throughout: `DELETE /:id` archives, `POST /:id/restore` un-archives, lists exclude
archived unless `?includeArchived=true`.

### `/api/destinations`
| Method | Path | Body / Query |
|---|---|---|
| GET | `/` | `?includeArchived=true\|false` |
| GET | `/:id` | — |
| POST | `/` | `{name}` — if the name matches an archived destination, it's restored instead of erroring |
| PATCH | `/:id` | `{name}` |
| DELETE | `/:id` | archive |
| POST | `/:id/restore` | — |

### `/api/day-templates` (the itinerary-day library)
| Method | Path | Body / Query |
|---|---|---|
| GET | `/` | `?destinationId=<uuid>` (the dependent-dropdown query), `?includeArchived` |
| GET | `/:id` | — |
| POST | `/` | `{destinationId, title, description}` |
| PATCH | `/:id` | `{title?, description?}` |
| DELETE | `/:id` | archive |
| POST | `/:id/restore` | — |

### `/api/hotels` (the hotel library)
| Method | Path | Body / Query |
|---|---|---|
| GET | `/` | `?destinationId=<uuid>`, `?includeArchived` |
| GET | `/:id` | — |
| POST | `/` | `{destinationId, name, category, description, images: string[]}` |
| PATCH | `/:id` | `{name?, category?, description?, images?}` |
| DELETE | `/:id` | archive |
| POST | `/:id/restore` | — |

A day-template/hotel row whose parent destination is archived is hidden from `GET /` and
`?destinationId=` results (even though its own `archived` may be `false`), unless
`?includeArchived=true`. `GET /:id` still returns it directly, with `destinationArchived: true`.

---

## 3. Packages — `/api/packages`

Write: **admin only**. Read (list/detail/PDF): **admin + partner**. `data_feeder` has **no**
access to this area at all (raw wholesale pricing).

| Method | Path | Body / Query |
|---|---|---|
| GET | `/` | Marketplace list (summary fields only). `?destinationId=&tag=&minPrice=&maxPrice=&minDays=&maxDays=&search=&includeArchived=` |
| GET | `/:id` | Full itinerary payload: package + ordered `packageDays[]` + `packageHotels[]` (sorted by `sortOrder`) + destination. Returns `destinationArchived: true|false`. |
| GET | `/:id/emv-quote.pdf` | Streams the EMV-branded PDF (raw price, no markup). **No payment required, any authenticated role.** |
| POST | `/` | `{destinationId, title, days, nights, rawPrice, inclusions, exclusions, gallery?: string[], tags?: string[], dayTemplateIds: string[], hotelIds?: string[]}`. `days` must equal `dayTemplateIds.length`. Each `dayTemplateId`/`hotelId` is copied (not linked) into `PackageDay`/`PackageHotel` — editing the library afterward never touches this package. |
| PATCH | `/:id` | Same fields, all optional; `dayTemplateIds`/`hotelIds` if present **replace** the whole itinerary/hotel list. |
| DELETE | `/:id` | archive |
| POST | `/:id/restore` | — |

Package titles and destination names are rejected (400) if they contain `/emv|ease\s*my\s*vacations/i` — that guard lives server-side, but surface the message if it comes back.

---

## 4. Quotes (white-label) — `/api/quotes`

Write: **partner only, own quotes**. Read: **partner (own) + admin (all, `?partnerId=` filter)**.

| Method | Path | Body / Query |
|---|---|---|
| GET | `/` | `?partnerId=` (admin only), `?status=`, `?includeArchived=` |
| GET | `/:id` | Full detail incl. `pricing` block: `rawPriceAtQuote`, `markupAmount`, `sellingPrice`, `livePackageRawPrice`, `rawPriceChangedSinceQuote` (informational only). |
| GET | `/:id/quote.pdf` | Streams the partner's white-label PDF. **No payment required, at any status.** |
| POST | `/` | `{packageId, leadName, contactNumber, email, travelDate, adults, children?, infants?, specialRequests?, markupAmount, branding: "EMV"\|"OWN"}`. `sellingPrice` is computed server-side (`rawPriceAtQuote + markupAmount`) — never send it, it's ignored if present. |
| PATCH | `/:id` | Same editable fields. **Only allowed while `status === "QUOTE_GENERATED"`** — 409 afterward ("Quote locked, already in booking flow"). |
| POST | `/:id/confirm-customer` | — | Moves `QUOTE_GENERATED → CUSTOMER_APPROVED` ("my customer said yes"). Required before payment can be submitted. |
| DELETE | `/:id` | archive — 409 if `status` is `BOOKING_CONFIRMED` or `ORDER_COMPLETED` (can't archive a confirmed/completed booking). |
| POST | `/:id/payment` | **multipart/form-data**, partner only. Fields: `transactionId`, `amount`, `notes?`, file field **`screenshot`** (jpg/jpeg/png/pdf, ≤5MB). Only accepted when quote is `CUSTOMER_APPROVED` (or `PENDING_VERIFICATION` with a live `INFO_REQUESTED` payment). 409 if a payment is already `PENDING_VERIFICATION`/`APPROVED` for this quote. |

`Quote.status` ladder: `QUOTE_GENERATED → CUSTOMER_APPROVED → PAYMENT_SUBMITTED → PENDING_VERIFICATION → BOOKING_CONFIRMED` (or back to `CUSTOMER_APPROVED` on payment rejection) `→ ORDER_COMPLETED` / `REJECTED`.

---

## 5. Payments — submission is per-resource (above/below); verification is admin-only

### Admin verification queue — `/api/admin/payments`
Handles **both** `PACKAGE` (quote) and `VISA` payments through one queue — rows carry a
superset of fields; irrelevant ones are `null` for a given `type`. Each row carries `amountDue`
(the **wholesale** amount the partner owes TravNexa — `sellingPrice - markupAmount`, which
recovers `rawPriceAtQuote` for packages / `baseFeeAtRequest × passengerCount` for visas) alongside
`sellingPrice` and `markupAmount` (kept for context — what the partner's own customer pays and
the partner's own profit). `reconciliationMismatch` is set when the partner's paid `amount`
differs from `amountDue`, **never** from `sellingPrice` — the markup must never flow to TravNexa.
Populated for both types.

| Method | Path | Body / Query |
|---|---|---|
| GET | `/` | `?status=` (default `PENDING_VERIFICATION`), `?type=PACKAGE\|VISA`, `?includeArchived=` |
| GET | `/:id` | Full detail + `screenshotUrl` |
| GET | `/:id/screenshot` | Streams the uploaded proof image/PDF |
| POST | `/:id/approve` | `{adminRemarks?}` — **the only thing that confirms a booking.** Package → quote `BOOKING_CONFIRMED`. Visa → request `VISA_PROCESSING_STARTED` directly (fires 2 emails/notifications). |
| POST | `/:id/reject` | `{adminRemarks}` (**required**) — rejects the payment only. Package → quote back to `CUSTOMER_APPROVED`. Visa → request back to `APPLICATION_SUBMITTED`. The deal stays alive; partner resubmits payment. |
| POST | `/:id/request-info` | `{adminRemarks}` (**required**) — payment → `INFO_REQUESTED`; quote/request stays `PENDING_VERIFICATION`. Partner can still resubmit a corrected payment while in this state. |

Only valid from `PENDING_VERIFICATION`/`INFO_REQUESTED` — 409 naming the current state otherwise (so re-approving is a 409).

### Partner submission
- Package: `POST /api/quotes/:id/payment` (see §4).
- Visa: `POST /api/visa-requests/:id/payment` (see §6).

Both are multipart with file field `screenshot`, and both return the same shared SLA message
in the response body: *"Your payment has been submitted successfully. It is currently pending
verification by the TravNexa Global team. Verification usually takes 24 to 48 hours."*

---

## 6. Visa — config (`/api/visa-countries`) + requests (`/api/visa-requests`) + admin actions

### Country + required-document config — write: admin only; read: **admin + partner** (`data_feeder` excluded — `baseFee` is wholesale pricing, same reasoning as packages)
| Method | Path | Body / Query |
|---|---|---|
| GET | `/api/visa-countries` | `?includeArchived=`. Each row includes `baseFee` (wholesale per-passenger fee). |
| GET | `/api/visa-countries/:id` | — |
| POST | `/api/visa-countries` | `{name, baseFee?}` (archived-name restore, same as destinations; `baseFee` defaults to `0`) |
| PATCH | `/api/visa-countries/:id` | `{name?, baseFee?}` — at least one required |
| DELETE | `/api/visa-countries/:id` | archive |
| POST | `/api/visa-countries/:id/restore` | — |
| GET | `/api/visa-countries/:countryId/documents` | required-document checklist for that country, `?includeArchived=` |
| POST | `/api/visa-countries/:countryId/documents` | `{documentName, isMandatory?}` (default `true`) |
| PATCH | `/api/visa-countries/:countryId/documents/:docId` | `{documentName?, isMandatory?}` |
| DELETE | `/api/visa-countries/:countryId/documents/:docId` | archive |
| POST | `/api/visa-countries/:countryId/documents/:docId/restore` | — |

### Visa requests — write: partner only, own; read: partner (own) + admin (all, `?partnerId=`)
| Method | Path | Body / Query |
|---|---|---|
| GET | `/api/visa-requests` | `?partnerId=` (admin only), `?status=`, `?includeArchived=` |
| GET | `/api/visa-requests/:id` | Full detail: passengers + each passenger's uploaded docs + `requiredDocuments` (the request's **own frozen checklist snapshot**, not the country's current one) + `documentReadiness: {readyToSubmit, missing: [{passengerId, passengerName, missingDocs}]}` + `pricing: {baseFeeAtRequest, passengerCount, visaCost, markupAmount, sellingPrice, liveCountryFee, feeChangedSinceRequest}` (informational only past `feeChangedSinceRequest`; all maths uses `baseFeeAtRequest`, never `liveCountryFee`) + `latestPayment`. |
| POST | `/api/visa-requests` | `{visaCountryId, passengers: [{fullName, gender, dob, nationality, passportNumber, passportExpiry, travelDate, returnDate}, ...], markupAmount?}` (≥1 passenger; `markupAmount` defaults `0`). `sellingPrice = country.baseFee (frozen) × passengers.length + markupAmount`, computed server-side — never send it, it's ignored if present. Returns `applicationNumber` (format `VISA-XXXXXXXX-XXXXXX`). |
| PATCH | `/api/visa-requests/:id` | `{passengers?: [...], markupAmount?}` — **at least one required**, independently optional. `passengers` **replaces the whole list** (archives old passengers + their document uploads, same as before) — send it only when passengers actually changed; sending `markupAmount` alone recomputes `sellingPrice` from the frozen fee without touching passengers or their uploads. Only while `status === "APPLICATION_SUBMITTED"`. |
| DELETE | `/api/visa-requests/:id` | archive — 409 once `PAYMENT_APPROVED`/`VISA_PROCESSING_STARTED`/`COMPLETED`. |
| POST | `/api/visa-requests/:id/passengers/:passengerId/documents` | **multipart**, file field **`document`**. Body field `documentName` — must match one of the request's own `requiredDocuments` names (400 "not a recognized document for this request" otherwise). Re-uploading the same `documentName` replaces the previous file. No status gate — can upload at any request status. |
| GET | `/api/visa-requests/:id/passengers/:passengerId/documents/:uploadId/file` | Streams the uploaded file. |
| POST | `/api/visa-requests/:id/payment` | **multipart**, file field **`screenshot`**. Fields: `transactionId`, `amount`, `notes?`. **Blocked with 400 "Upload all mandatory documents for every passenger first" unless `documentReadiness.readyToSubmit` is true.** Only accepted from `APPLICATION_SUBMITTED` (or `PENDING_VERIFICATION` with a live `INFO_REQUESTED` payment). |

### Admin visa actions — `/api/admin/visa-requests`
| Method | Path | Body |
|---|---|---|
| POST | `/:id/complete` | — | Only from `VISA_PROCESSING_STARTED` → `COMPLETED`. |
| POST | `/:id/reject-application` | `{adminRemarks}` (**required**) | Kills the **whole application** (→ `REJECTED`), distinct from rejecting one payment. Only from `APPLICATION_SUBMITTED`/`PENDING_VERIFICATION` — 409 otherwise. |

`VisaRequest.status` ladder: `APPLICATION_SUBMITTED → PAYMENT_SUBMITTED → PENDING_VERIFICATION → PAYMENT_APPROVED → VISA_PROCESSING_STARTED → COMPLETED`, with `REJECTED` reachable either via payment rejection→back-to-submitted, or the outright `reject-application` action.

---

## 7. Notifications — `/api/notifications`

Every authenticated role, own notifications only (identical 404 pattern if you try someone else's id).

| Method | Path | Body / Query |
|---|---|---|
| GET | `/` | `?unreadOnly=true\|false` |
| GET | `/unread-count` | `{count}` — poll this for the bell badge |
| POST | `/:id/read` | mark one read |
| POST | `/read-all` | mark all mine read |
| DELETE | `/:id` | archive (dismiss) |

Known `type` values in active use: `PAYMENT_SUBMITTED`, `PAYMENT_APPROVED`, `PAYMENT_REJECTED`,
`INFO_REQUESTED`, `VISA_REQUEST_SUBMITTED`, `VISA_PROCESSING_STARTED`, `VISA_REQUEST_REJECTED`,
`ORDER_COMPLETED`, `QUOTE_READY`, `ADMIN_NEW_PACKAGE_ORDER`, `ADMIN_NEW_VISA_REQUEST`. It's a
free-text column, not an enum — treat this as a convention, render unknown types generically.

---

## 8. Admin CMS — all admin-only

### Agencies (partners) — `/api/admin/agencies`
| Method | Path | Body / Query |
|---|---|---|
| GET | `/` | `?search=` (company name or email), `?status=active\|suspended\|unverified`, `?includeArchived=`. Row: `companyName, ownerName, businessEmail, city, isVerified, archived, quoteCount, visaRequestCount`. |
| GET | `/:id` | Profile + `quotes[]` (summary, incl. archived) + `visaRequests[]` (summary, incl. archived) + `payments[]` (combined history across both, incl. archived). |
| POST | `/:id/suspend` | archive + revoke all sessions immediately |
| POST | `/:id/activate` | un-archive (their old token still won't work — they must log in again) |

### Staff users (admin/data_feeder accounts) — `/api/admin/users`
| Method | Path | Body / Query |
|---|---|---|
| GET | `/` | `?includeArchived=`. Only `admin`/`data_feeder` rows — partners are at `/agencies`. |
| POST | `/` | `{email, password, role: "admin"\|"data_feeder"}` — created pre-verified, no OTP. |
| POST | `/:id/suspend` | 400 if you try to suspend your own account |
| POST | `/:id/activate` | — |

### Email templates — `/api/admin/email-templates`
| Method | Path | Body / Query |
|---|---|---|
| GET | `/` | `?includeArchived=` |
| GET | `/:id` | — |
| POST | `/` | `{name, subject, body}` — `name` must be `^[a-z][a-z0-9_]*$` (it's a code lookup key, immutable after creation) |
| PATCH | `/:id` | `{subject?, body?}` |
| DELETE | `/:id` | archive (safe — `renderTemplate` falls back to a generic message if a lookup misses) |
| POST | `/:id/restore` | — |

`{{placeholder}}` tokens in `subject`/`body` get interpolated at send time — useful if a template-editing screen wants to show available variables per template name (see the event table in `PROJECT_SPEC.md` for which vars each of the 14 seeded templates uses).

### Reports — `/api/admin/reports/summary`
| Method | Path | Query |
|---|---|---|
| GET | `/summary` | `?from=&to=` (ISO dates) — **applies only to the `payments` block**, not the other counts |

Response shape:
```jsonc
{
  "generatedAt": "...", "dateRange": {"from": "...", "to": "..."} | null,
  "agencies": {"total": 0, "active": 0, "suspended": 0, "unverified": 0},
  "packages": {"active": 0},
  "quotes": {"total": 0, "byStatus": {"QUOTE_GENERATED": 0, "...": 0}},
  "visaRequests": {"total": 0, "byStatus": {"APPLICATION_SUBMITTED": 0, "...": 0}},
  "payments": {
    "totalSubmitted": 0, "pendingVerification": 0,
    "approved": {"count": 0, "revenue": "0"},
    "rejected": 0
  },
  "recentActivity": [{"paymentId": "...", "agencyName": "...", "type": "PACKAGE", "amount": "...", "status": "...", "date": "..."}]
}
```
`byStatus` always includes every enum value (zero-filled). `revenue` is a decimal string.

---

## 9. Partner dashboard — `/api/dashboard`

**Partner-only** (admin gets 403 here; partner gets 403 on any `/api/admin/*` route).

| Method | Path |
|---|---|
| GET | `/` |

Response shape:
```jsonc
{
  "quotes": {"total": 0, "byStatus": {"QUOTE_GENERATED": 0, "...": 0}},
  "visaRequests": {"total": 0, "byStatus": {"APPLICATION_SUBMITTED": 0, "...": 0}},
  "pendingPayments": 0, "approvedOrders": 0,
  "recentActivity": [{"paymentId": "...", "subject": "...", "type": "PACKAGE", "amount": "...", "status": "...", "date": "..."}],
  "unreadNotifications": 0,
  "latestPackages": [ /* up to 5 packageService summary rows */ ]
}
```

---

## Error shape (every endpoint)

Non-2xx responses are always `{ "error": "message" }`, and validation failures additionally
carry `{ "error": "...", "details": [{ "field": "...", "message": "..." }] }`. There is no other
error envelope anywhere in the API — build one error-handling path in the fetch client and reuse
it everywhere.
