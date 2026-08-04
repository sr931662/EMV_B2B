-- Post-payment trip voucher: trip/voucher/itinerary references, TCS, named travellers, per-hotel
-- nights and addresses, country-wise notes, and the company-wide terms blocks.

-- CreateEnum
CREATE TYPE "TravellerType" AS ENUM ('ADULT', 'CHILD', 'INFANT');

-- AlterTable: Quote — trip reference and tax.
--
-- quoteNumber is added nullable, backfilled, and only then made NOT NULL + UNIQUE. Adding it as
-- NOT NULL in one step would fail against existing rows.
ALTER TABLE "Quote" ADD COLUMN "quoteNumber" TEXT;

-- TRIP-<created date>-<first 6 of the uuid>. The uuid fragment guarantees uniqueness without a
-- lookup, and the date makes the reference readable to whoever is holding the invoice.
UPDATE "Quote"
SET "quoteNumber" = 'TRIP-' || TO_CHAR("createdAt", 'YYMMDD') || '-' || UPPER(LEFT(REPLACE("id"::text, '-', ''), 6));

ALTER TABLE "Quote" ALTER COLUMN "quoteNumber" SET NOT NULL;
CREATE UNIQUE INDEX "Quote_quoteNumber_key" ON "Quote"("quoteNumber");

-- Defaults of 0 are deliberate: existing quotes were priced and shown to customers before TCS was
-- modelled, and back-dating a tax onto them would misstate what those customers were told.
ALTER TABLE "Quote" ADD COLUMN "tcsRate" DECIMAL(5,2) NOT NULL DEFAULT 0;
ALTER TABLE "Quote" ADD COLUMN "tcsAmount" DECIMAL(12,2) NOT NULL DEFAULT 0;

-- Issued at booking confirmation, so null for everything that has not reached it.
ALTER TABLE "Quote" ADD COLUMN "voucherNumber" TEXT;
ALTER TABLE "Quote" ADD COLUMN "itineraryNumber" TEXT;
CREATE UNIQUE INDEX "Quote_voucherNumber_key" ON "Quote"("voucherNumber");
CREATE UNIQUE INDEX "Quote_itineraryNumber_key" ON "Quote"("itineraryNumber");

-- CreateTable: named travellers. Quote.adults/children/infants stay as the counts the trip was
-- priced on; these are the names the hotel and the voucher need.
CREATE TABLE "QuoteTraveller" (
    "id" TEXT NOT NULL,
    "quoteId" TEXT NOT NULL,
    "fullName" TEXT NOT NULL,
    "dob" DATE NOT NULL,
    "type" "TravellerType" NOT NULL DEFAULT 'ADULT',
    "archived" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "QuoteTraveller_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "QuoteTraveller_quoteId_idx" ON "QuoteTraveller"("quoteId");
CREATE INDEX "QuoteTraveller_archived_idx" ON "QuoteTraveller"("archived");

ALTER TABLE "QuoteTraveller" ADD CONSTRAINT "QuoteTraveller_quoteId_fkey"
    FOREIGN KEY ("quoteId") REFERENCES "Quote"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AlterTable: PackageHotel — address and nights.
ALTER TABLE "PackageHotel" ADD COLUMN "hotelAddress" TEXT;
ALTER TABLE "PackageHotel" ADD COLUMN "nights" INTEGER NOT NULL DEFAULT 1;

-- Spread each package's nights across its hotels rather than leaving every hotel at 1, so the
-- derived check-out date lands on the trip's actual end date instead of finishing early. The
-- remainder goes to the first hotel, which is the usual arrangement (a longer opening stay).
-- Approximate by construction — an admin correcting one package is a two-second edit, whereas a
-- voucher whose dates do not reach the return flight is a support call.
WITH counts AS (
    SELECT ph."packageId",
           COUNT(*)::int AS hotel_count,
           MIN(ph."sortOrder") AS first_sort
    FROM "PackageHotel" ph
    WHERE ph."archived" = false
    GROUP BY ph."packageId"
)
UPDATE "PackageHotel" ph
SET "nights" = GREATEST(
        1,
        (p."nights" / c.hotel_count)
        + CASE WHEN ph."sortOrder" = c.first_sort THEN p."nights" % c.hotel_count ELSE 0 END
    )
FROM counts c
JOIN "Package" p ON p."id" = c."packageId"
WHERE ph."packageId" = c."packageId"
  AND ph."archived" = false
  AND c.hotel_count > 0
  AND p."nights" > 0;

-- AlterTable: country-wise notes for the voucher.
ALTER TABLE "Destination" ADD COLUMN "generalNotes" TEXT;
ALTER TABLE "Destination" ADD COLUMN "toursAndTransfersNotes" TEXT;

-- CreateTable: company-wide terms, editable without a deploy.
CREATE TABLE "ContentBlock" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "archived" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ContentBlock_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ContentBlock_name_key" ON "ContentBlock"("name");
CREATE INDEX "ContentBlock_archived_idx" ON "ContentBlock"("archived");

-- CreateTable: operational settings an admin changes without a deploy.
CREATE TABLE "AppSetting" (
    "key" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AppSetting_pkey" PRIMARY KEY ("key")
);

-- Seeded at 0, NOT at a guessed statutory rate. TCS on overseas tour packages is set by policy and
-- changes with each budget; shipping a number nobody confirmed would put a wrong tax on real
-- invoices. An admin sets the real rate before the first TCS-bearing quote is issued.
INSERT INTO "AppSetting" ("key", "value", "updatedAt") VALUES ('TCS_RATE_PERCENT', '0', NOW());
