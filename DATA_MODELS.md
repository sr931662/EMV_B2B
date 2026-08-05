# DATA_MODELS.md

Mirror of `backend/prisma/schema.prisma`, evolved across migrations `20260725120902_init_schema`
through `20260726082530_add_visa_pricing` (step 9 — the admin CMS — added no new tables or
columns; it is a pure read/write surface over the models already documented below. The visa
pricing migration, added after step 9, is the most recent schema change — see `VisaCountry` and
`VisaRequest` below).
See `PROJECT_SPEC.md` for the locked rules every model here must satisfy, and for the full
step-by-step build history.

## Cross-cutting design decisions

- **Soft-delete everywhere (locked rule 1).** Every table carries `archived Boolean @default(false)` and is indexed on `archived`, so default queries can filter it cheaply. Nothing is ever hard-deleted.
- **All 17 foreign keys are `onDelete: Restrict`.** In a never-hard-delete system, `Restrict` turns an accidental `delete()` into a loud database error instead of a silent cascade. There is no `Cascade` anywhere by design.
- **Copy-on-select, not linked (locked rule 2), applied four times.** `PackageDay`/`PackageHotel` (itinerary), `Quote.rawPriceAtQuote` (package price), `VisaDocumentUpload.documentName`/`VisaRequestRequiredDoc` (the visa checklist), and `VisaRequest.baseFeeAtRequest` (visa price) all hold copied snapshots with **no** FK back to `DayTemplate`/`Hotel`/`Package`/`VisaRequiredDocument`/`VisaCountry`. Editing the library, repricing a package, reconfiguring a visa country's checklist, or repricing a visa country's fee can never mutate anything already built from it, and vice versa.
- **Payment never gates PDFs (locked rule 3).** `Package.emvQuotePdfPath` and `Quote.pdfPath` are both independent of any `Payment` row. A `Quote` is fully usable with zero payments attached; `Payment` only drives the transition into `BOOKING_CONFIRMED`.
- **IDs** are `String @id @default(uuid())`. **Money** is `Decimal @db.Decimal(12, 2)` (never float). **Calendar dates** (travel/DOB/passport expiry) are `@db.Date` to avoid timezone drift; audit `createdAt`/`updatedAt` are full timestamps.
- Every model has `createdAt` / `updatedAt`.

## Enums

| Enum | Values |
|---|---|
| `Role` | `admin`, `data_feeder`, `partner` |
| `Branding` | `EMV`, `OWN` |
| `QuoteStatus` | `QUOTE_GENERATED`, `CUSTOMER_APPROVED`, `PAYMENT_SUBMITTED`, `PENDING_VERIFICATION`, `BOOKING_CONFIRMED`, `ORDER_COMPLETED`, `REJECTED` |
| `PaymentType` | `PACKAGE`, `VISA` |
| `PaymentStatus` | `PENDING_VERIFICATION`, `APPROVED`, `REJECTED`, `INFO_REQUESTED` |
| `VisaRequestStatus` | `APPLICATION_SUBMITTED`, `PAYMENT_SUBMITTED`, `PENDING_VERIFICATION`, `PAYMENT_APPROVED`, `VISA_PROCESSING_STARTED`, `COMPLETED`, `REJECTED` |

## Models

### Auth & identity

**`User`** — every human in the system; `role` decides what they can reach (admin = all, data_feeder = library only, partner = buy/resell).
- `id`, `email` (unique), `passwordHash`, `role: Role`
- `isVerified`, `otpCode?`, `otpExpiresAt?` — OTP verification (build step 2)
- `archived`, `createdAt`, `updatedAt`
- Relations: `partnerProfile?` (1-1, only when `role = partner`), `quotes[]`, `visaRequests[]`, `notifications[]`, `verifiedPayments[]` (named relation `PaymentVerifiedBy` — payments this user verified as admin)
- Indexes: `role`, `archived`

**`PartnerProfile`** — the white-label source of truth; every partner-branded quote PDF pulls its branding and legal details from here, never from EMV.
- `id`, `userId` (unique FK → `User`)
- `companyName`, `companyLogo?`, `ownerName`, `gstNumber?`, `panNumber?`
- `businessEmail`, `mobile`, `officeAddress`, `city`, `state`, `country`, `pincode`, `website?`
- `archived`, `createdAt`, `updatedAt`
- Indexes: `userId` (via unique), `archived`

### Reusable content (Phase 4)

**`DocumentType`** — a kind of document, named once. `VisaRequiredDocument.documentName` was free
text, so the "documents required" filter could never work on it and no two products agreed on a
name. `VisaRequiredDocument.documentTypeId` now points here; `documentName` survives as the authored
label ("Passport (first and last page)" where the type is simply "Passport").

**`FaqItem`** — a question and answer, attached to a country, destination, package or visa product
through `EntityLink` rather than a foreign key per owner.

**`NoteBlock`** — company-wide prose (terms, scope of services, general notes). This is the former
`ContentBlock`, extended rather than replaced: the model is renamed in code and `@@map("ContentBlock")`
keeps the physical table, because renaming a table in the same deploy that adds its replacement is
what 500s a container mid-rollout. `key` maps onto the original `name` column. The rename belongs to
a contract step. `noteBlockService.missingRequired()` reports blocks a voucher needs and nobody has
written — previously a completely silent failure, which is why every voucher so far has printed with
no terms and conditions at all.

**`CancellationPolicy`** + **`CancellationTier`** — a policy as bands rather than a paragraph. Bands
are `[min, max)` on days before travel, the outermost one open-ended. Written as prose a policy can
only be printed; as tiers `cancellationService.computeCharge` can also answer "what would this cost
to cancel today", which is the question a partner actually asks. `validateTiers` reports gaps and
overlaps, which are otherwise invisible until someone cancels.

**`InsurancePlan`** — the catalogue entry a `QuoteInsurance` row was sold from. Age bands and trip
length are columns, not prose, because they are where claims are actually refused.

### Country/VisaCountry contract step

`VisaCountry` is gone. Migration `20260805170000_visa_country_contract` merged it into `Country`
for good: `Country` gained `baseFee`; `VisaProduct.countryId` (added nullable in Phase 3) became
the sole, required link and `visaCountryId` was dropped; `VisaRequest.visaCountryId` was **renamed**
to `countryId` and repointed at `Country` (a rename, not a backfill — `VisaCountry.id` and the
matching `Country.id` were identical by construction since Phase 3, so no row's value had to
change); `Destination.visaCountryId` was dropped outright, superseded by `countryId`.

This ran as ONE migration rather than its own expand/migrate/contract sequence because nothing had
been deployed yet — the whole reason that split exists is to avoid a window where old code, still
running, reads a column new code has already dropped. With no old code running anywhere, that
window doesn't exist.

**The API shape at the edges is unchanged on purpose.** `visaCountryService.js` and
`visaProductService.js`'s `present()` still return a `visaCountry` object with the pre-merge field
names (`coverImageUrl`, `aboutCountry`, `arrivalInfo`) — mapped from `Country`'s real columns
(`heroImageUrl`, `description`, `travelNotes`) in one place at the service boundary. `create()`
still accepts a `visaCountryId` parameter. Every existing route, controller, and the partner-facing
marketplace pages (`VisaServicesPage`, `VisaProductDetailPage`) therefore needed **zero** changes —
only the six backend files that queried the old `visaCountry` Prisma relation by name
(`visaRequestService`, `quoteSnapshotService`, `itineraryService`, `paymentService`,
`adminAgencyService`, `visaDocumentService`) needed their `select`/`include` blocks repointed at
`country`.

### Suppliers and rates (Phase 5)

**`Vendor`** — someone the business buys from. Contact details, tax numbers and payment terms belong
to the company; what varies per hotel lives on `HotelVendor`.

**`HotelVendor`** — one supplier's contract for one hotel: contract dates, allocation, release days,
cancellation terms, preference. This is the row that makes "a hotel belongs to several vendors" true.
Unique on `(hotelId, vendorId, contractRef)` so a supplier may hold two contracts on one property and
a double-save updates rather than duplicating.

**`HotelRate`** — one line of a rate card. A number is only a price in the company of its validity
dates, basis, room type, meal plan, occupancy and currency; every one of those has caused a mispriced
package somewhere. Validity is **inclusive at both ends**. Overlapping ranges are permitted and
resolved by `rateService`, which prefers the **narrower** range — a promotional week must beat the
season it sits inside, which is why someone loaded it.

**`Activity`** + **`ActivityRate`** — a thing a traveller does, and its several prices (adult, child,
seat-in-coach, private, each for its own season). `DayTemplateEvent.activityId` is a real FK;
`PackageDayEvent.sourceActivityId` deliberately is **not**, because a package day is a frozen copy
(locked rule 2) and a real relation would let archiving an activity be refused by a package that once
included it.

`rateService.priceStay` prices **night by night** — a stay checking in on the 1st and out on the 4th
is three nights, and one that straddles a season change has no single nightly rate. It refuses rather
than guesses on two counts: nights no published rate covers (naming the dates), and a stay drawing on
two currencies (converting needs an exchange rate and a date, which is a business decision).

### How a package meets the library (Phase 6)

Two different relationships, and the difference is what each thing IS.

**Copied** — `PackageDay`, `PackageHotel`. What the customer was sold. Frozen at build time (locked
rule 2) and never re-read from the library.

**Referenced** — `Package.cancellationPolicyId`. Live right up until a quote is generated, at which
point `quoteSnapshotService` freezes it with everything else. That is the difference between "our
terms changed" and "your terms changed after you booked".

**Linked** — FAQs and inclusion/exclusion vocabulary, through `EntityLink`. Statements about what a
package is *about*, used to group, filter and report. Nothing a customer was told hangs off them, so
there is nothing to freeze. The prose a customer reads still lives in `Package.inclusions` /
`Package.exclusions`, which the builder **composes** from the linked vocabulary and stores as text —
so editing an inclusion later changes future packages, never an issued quote.

`QuoteSnapshot.schemaVersion` is **2**: it now also captures `cancellationPolicy` and `terms`.
Version 1 documents lack both, and the voucher reports `cancellation.captured: false` rather than
`policy: null` — the two are not the same, and conflating them would tell a customer their trip is
free to cancel.

### Reference data / intern-maintained library

**`Country`** (Phase 3) — the single row for a country, and the top of the geography hierarchy.
- `id`, `name` (unique), `slug` (unique), `isoAlpha2?`/`isoAlpha3?` (both unique), `dialCode?`, `shortName?`
- `description?`, `flagImageUrl?`, `heroImageUrl?`
- `currencyCode?` (FK → `Currency`) — the default currency for quoting there, not a constraint
- `languages[]`, `timeZones[]`, `bestMonths[]` (month numbers 1–12, so "where in March" is a query)
- `emergencyContacts?`, `embassyDetails?`, `weatherSummary?`, `travelNotes?`
- `searchText` (maintained haystack, trigram-indexed), `archived`, `createdAt`, `updatedAt`
- Relations: `destinations[]`, `visaProducts[]`, `currency?`

  Replaces two overlapping tables. `Destination` used to hold countries *and* cities in one flat
  list, and `VisaCountry` held countries a second time — the two were matched by comparing name
  strings, so "UAE" in one and "United Arab Emirates" in the other silently produced no visa
  information and no error.

  **This is an expand step, not a cutover.** `VisaCountry` still exists and still works;
  `Country.id` is deliberately the same value as the `VisaCountry` it was created from, and
  `countryService.mirrorVisaCountry` keeps the two in step on every visa-country write. The
  contract step — dropping `VisaCountry` and `VisaProduct.visaCountryId`, and making
  `Destination.countryId` required — happens only once every consumer reads through `Country`.
  Nothing is dropped in the same migration that adds its replacement.

**`Destination`** — the top-level geography every library entry and package hangs off.
- `id`, `name` (unique), `archived`, timestamps
- Relations: `dayTemplates[]`, `hotels[]`, `packages[]`

**`DayTemplate`** — reusable itinerary-day text the data_feeder maintains; **copied** into `PackageDay` on select, never linked.
- `id`, `destinationId` (FK → `Destination`), `title`, `description` (text)
- `archived`, timestamps
- Indexes: `destinationId`, `archived`

**`Hotel`** — reusable hotel entry the data_feeder maintains; **copied** into `PackageHotel` on select, never linked.
- `id`, `destinationId` (FK → `Destination`), `name`, `category`, `description` (text), `images` (string[])
- `archived`, timestamps
- Indexes: `destinationId`, `archived`

### Packages (EMV wholesale product)

**`Package`** — the EMV wholesale holiday product at raw (no-markup) price, plus its auto-generated EMV-branded quote PDF.
- `id`, `destinationId` (FK → `Destination`), `title`, `days`, `nights`
- `rawPrice` (Decimal 12,2) — EMV wholesale, **never** includes markup
- `inclusions` (text), `exclusions` (text), `gallery` (string[]), `tags` (string[] — Family/Honeymoon/Luxury/…)
- `emvQuotePdfPath?` — auto-generated EMV-branded PDF; downloadable with no payment (rule 3)
- `archived`, timestamps
- Relations: `packageDays[]`, `packageHotels[]`, `quotes[]`
- Indexes: `destinationId`, `archived`

**`PackageDay`** — a frozen copy of one `DayTemplate` inside a package; deliberately has **no FK to `DayTemplate`** so package edits and library edits stay fully independent.
- `id`, `packageId` (FK → `Package`), `dayNumber`, `title`, `description` (text)
- `archived`, timestamps
- Indexes: `packageId`, `archived`

**`PackageHotel`** — a frozen copy of one `Hotel` inside a package; deliberately has **no FK to `Hotel`**, same reason.
- `id`, `packageId` (FK → `Package`), `hotelName`, `hotelCategory`, `hotelDescription` (text)
- `sortOrder` (Int, default 0) — 0-based position in the `hotelIds` array the admin submitted; detail queries and the EMV PDF order by this, not alphabetically
- `archived`, timestamps
- Indexes: `packageId`, `archived`

### Quotes (partner white-label layer)

**`Quote`** — a partner's customer-facing quote for a package, carrying the lead's details and the marked-up selling price; `branding` picks EMV-branded vs the partner's own white-label output.
- `id`, `packageId` (FK → `Package`), `partnerId` (FK → `User`)
- Lead: `leadName`, `contactNumber`, `email`, `travelDate` (date), `adults`, `children` (default 0), `infants` (default 0), `specialRequests?`
- `rawPriceAtQuote` (Decimal 12,2) — the package's `rawPrice` **frozen** at quote creation; copy-on-select (rule 2) applied to price. All selling-price maths uses this, never the live `Package.rawPrice`, so repricing a package never moves an existing quote
- `markupAmount` (Decimal 12,2), `sellingPrice` (Decimal 12,2) — `sellingPrice = rawPriceAtQuote + markupAmount` (rule 5), recomputed from the snapshot on any markup edit
- `branding: Branding`, `pdfPath?` — downloadable with no payment (rule 3)
- `status: QuoteStatus` (default `QUOTE_GENERATED`)
- `archived`, timestamps
- Relations: `payments[]`
- Indexes: `packageId`, `partnerId`, `status`, `archived`

> **Markup scope:** stored per-quote (`Quote.markupAmount`), not per-line-item — consistent with rule 5. `PROJECT_SPEC.md` rule 5 leaves per-partner default markup open; if a partner-level default is wanted later it belongs on `PartnerProfile` and would still resolve down to `Quote.markupAmount`.

### Payments (manual only — UPI/QR/bank + screenshot, admin-verified)

**`Payment`** — one manual payment attempt with its proof screenshot and admin verdict; shared by package quotes and visa requests, and the **only** thing that unlocks booking confirmation.
- `id`, `type: PaymentType`
- `quoteId?` (FK → `Quote`), `visaRequestId?` (FK → `VisaRequest`) — exactly one is set, matching `type`; enforced in the service layer
- `transactionId`, `amount` (Decimal 12,2), `screenshotPath`, `notes?`
- `reconciliationMismatch` (Boolean, default false) — set at submission when `amount` ≠ the parent's `sellingPrice` (`Quote.sellingPrice` for `type: PACKAGE`, `VisaRequest.sellingPrice` for `type: VISA` — both carry the field now); stored rather than derived so it stays a frozen audit signal
- `status: PaymentStatus` (default `PENDING_VERIFICATION`), `adminRemarks?`, `verifiedById?` (FK → `User`), `verifiedAt?`
- Partial unique indexes (at most one **live** payment per parent, unraceable; raw SQL in the migrations since Prisma cannot express partial unique indexes):
  - `Payment_one_live_payment_per_quote` on `quoteId WHERE archived = false AND status IN ('PENDING_VERIFICATION','APPROVED')`
  - `Payment_one_live_payment_per_visa_request` on `visaRequestId WHERE archived = false AND status IN ('PENDING_VERIFICATION','APPROVED')`
  - `quoteId` and `visaRequestId` are mutually exclusive per row and both nullable, so the two indexes never interact (Postgres allows unlimited NULLs in a unique index)
- `archived`, timestamps
- Indexes: `quoteId`, `visaRequestId`, `verifiedById`, `type`, `status`, `archived`

### Visa services

**`VisaCountry`** — a country EMV processes visas for.
- `id`, `name` (unique)
- `baseFee` (Decimal 12,2, default 0) — admin-set wholesale fee per passenger. Frozen onto `VisaRequest.baseFeeAtRequest` at the moment a request is created (copy-on-select, rule 2, applied a fourth time) — repricing a country never moves an existing request's numbers
- `archived`, timestamps
- Relations: `requiredDocuments[]`, `visaRequests[]`

**`VisaRequiredDocument`** — admin-configured checklist of documents a given country demands, each flagged mandatory or optional.
- `id`, `visaCountryId` (FK → `VisaCountry`), `documentName`, `isMandatory` (default true)
- `archived`, timestamps
- Indexes: `visaCountryId`, `archived`

**`VisaRequest`** — one partner's visa application for one country, tracked through its own status ladder.
- `id`, `partnerId` (FK → `User`), `visaCountryId` (FK → `VisaCountry`), `applicationNumber` (unique)
- `status: VisaRequestStatus` (default `APPLICATION_SUBMITTED`)
- `baseFeeAtRequest` (Decimal 12,2, default 0) — the country's `baseFee` **frozen** at request creation; all pricing maths uses this, never the live `VisaCountry.baseFee`
- `markupAmount` (Decimal 12,2, default 0), `sellingPrice` (Decimal 12,2, default 0) — `sellingPrice = baseFeeAtRequest × passengerCount + markupAmount`, recomputed server-side whenever passengers and/or markupAmount are edited. `passengerCount` is not a stored column — it's the live count of non-archived `VisaPassenger` rows, which can only change while `status = APPLICATION_SUBMITTED` (same lock passengers already had), so it's fixed by construction once payment starts
- `archived`, timestamps
- Relations: `passengers[]`, `payments[]`, `requiredDocSnapshot[]` (→ `VisaRequestRequiredDoc`)
- Indexes: `partnerId`, `visaCountryId`, `status`, `archived`

**`VisaRequestRequiredDoc`** — frozen copy of the country's required-document checklist, taken the instant a `VisaRequest` is created; copy-on-select (rule 2) applied to the visa checklist, the same principle as `PackageDay`/`PackageHotel` and `Quote.rawPriceAtQuote`. `readyToSubmit` and document-upload validation read this, never the live `VisaRequiredDocument` list — so an admin editing a country's checklist can never shift the requirements under a request already in flight.
- `id`, `visaRequestId` (FK → `VisaRequest`), `documentName`, `isMandatory` (default true)
- `archived`, timestamps
- Indexes: `visaRequestId`, `archived`

**`VisaPassenger`** — one traveller on a visa request, with passport and travel dates.
- `id`, `visaRequestId` (FK → `VisaRequest`)
- `fullName`, `gender` (free-text String, not an enum), `dob` (date), `nationality`, `passportNumber`, `passportExpiry` (date), `travelDate` (date), `returnDate` (date)
- `archived`, timestamps
- Relations: `documentUploads[]`
- Indexes: `visaRequestId`, `archived`

**`VisaDocumentUpload`** — one uploaded file for one passenger against one required document; `documentName` is a **copied string, not an FK**, so re-configuring a country's checklist never invalidates already-submitted applications.
- `id`, `visaPassengerId` (FK → `VisaPassenger`), `documentName`, `filePath`
- `archived`, timestamps
- Indexes: `visaPassengerId`, `archived`

### Notifications & CMS

**`Notification`** — in-app message for one user, with read state. Populated by `notificationService.createNotification`/`createNotificationForMany` (build step 8, extended step 9) alongside every partner/admin-facing email event; see `PROJECT_SPEC.md`'s event→email→notification table for the full list of `type` values in active use (`PAYMENT_SUBMITTED`, `PAYMENT_APPROVED`, `PAYMENT_REJECTED`, `INFO_REQUESTED`, `VISA_REQUEST_SUBMITTED`, `VISA_PROCESSING_STARTED`, `VISA_REQUEST_REJECTED`, `ORDER_COMPLETED`, `QUOTE_READY`, `ADMIN_NEW_PACKAGE_ORDER`, `ADMIN_NEW_VISA_REQUEST`). `type` is a free-text column, not an enum, so this list is a convention, not a schema constraint.
- `id`, `userId` (FK → `User`), `type` (string), `message` (text), `isRead` (default false)
- `archived`, timestamps
- Indexes: `userId`, `isRead`, `archived`

**`EmailTemplate`** — admin-editable email copy looked up by `name`, so transactional wording is CMS-managed rather than hardcoded. 14 rows seeded by `prisma/seed.js` (12 in build step 8, 2 more — `payment_info_requested`, `visa_application_rejected` — in step 9's carried-over fixes), create-only/idempotent — the seed will never overwrite a template an admin has since edited. `emailService.renderTemplate(name, vars)` interpolates `{{placeholder}}` tokens in both `subject` and `body`; an unrecognised `name` falls back to a generic inline message rather than erroring. Full CRUD (including restore) is exposed at `/api/admin/email-templates` (build step 9).
- `id`, `name` (unique), `subject`, `body` (text)
- `archived`, timestamps
- Indexes: `archived`

## Deviations from the Prompt 2 field list

One addition, made to satisfy locked rule 1 rather than left as specified — flag if unwanted:

- `archived` + `createdAt`/`updatedAt` were added to `PackageDay`, `PackageHotel`, `VisaPassenger`, `VisaDocumentUpload`, and `Notification`. The prompt omitted them on these five, but all five are removable in the UI (drop a day from an itinerary, remove a passenger, replace an uploaded document, dismiss a notification), and rule 1 forbids hard deletes *everywhere*. Without `archived` those operations would have to hard-delete.
