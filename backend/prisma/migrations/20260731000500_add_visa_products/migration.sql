-- Visa products: one sellable option per country (eVisa, sticker, VoA...), with the structured
-- fields the marketplace filters need.
--
-- Written by hand rather than generated, because `migrate diff` would drop
-- VisaRequiredDocument.visaCountryId and take the existing checklists with it. Every step below
-- backfills before it tightens a constraint, so existing countries, checklists and in-flight
-- requests keep working.

-- CreateEnum
CREATE TYPE "VisaCategory" AS ENUM ('VISA_FREE', 'VISA_ON_ARRIVAL', 'E_VISA', 'STICKER_VISA');

-- CreateEnum
CREATE TYPE "VisaDocumentCategory" AS ENUM ('PASSPORT', 'BANK_STATEMENT', 'INCOME_TAX_RETURN', 'PRIOR_VISA', 'PHOTO', 'OTHER');

-- CreateTable
CREATE TABLE "VisaProduct" (
    "id" TEXT NOT NULL,
    "visaCountryId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "category" "VisaCategory" NOT NULL,
    "processingDaysMin" INTEGER,
    "processingDaysMax" INTEGER,
    "baseFee" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "archived" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "VisaProduct_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "VisaProduct_visaCountryId_idx" ON "VisaProduct"("visaCountryId");
CREATE INDEX "VisaProduct_archived_idx" ON "VisaProduct"("archived");
CREATE INDEX "VisaProduct_category_idx" ON "VisaProduct"("category");
CREATE INDEX "VisaProduct_processingDaysMax_idx" ON "VisaProduct"("processingDaysMax");

ALTER TABLE "VisaProduct" ADD CONSTRAINT "VisaProduct_visaCountryId_fkey"
    FOREIGN KEY ("visaCountryId") REFERENCES "VisaCountry"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Backfill: every existing country becomes one product carrying its fee, so nothing that is
-- already published disappears from the marketplace.
--
-- STICKER_VISA is the assumed category: it is the only one that is always applicable, and the
-- alternatives would be worse guesses — VISA_FREE / VISA_ON_ARRIVAL are informational and would
-- make an existing, sellable country stop accepting applications.
--
-- processingDaysMin/Max stay NULL on purpose. Inventing a timeline here would show partners a
-- delivery promise nobody made; NULL simply means this product never matches a speed filter until
-- an admin fills it in.
INSERT INTO "VisaProduct" ("id", "visaCountryId", "name", "category", "baseFee", "archived", "createdAt", "updatedAt")
SELECT gen_random_uuid(), c."id", c."name" || ' visa', 'STICKER_VISA', c."baseFee", c."archived", NOW(), NOW()
FROM "VisaCountry" c;

-- AlterTable: point the document checklist at the product instead of the country.
ALTER TABLE "VisaRequiredDocument" ADD COLUMN "visaProductId" TEXT;
ALTER TABLE "VisaRequiredDocument" ADD COLUMN "category" "VisaDocumentCategory" NOT NULL DEFAULT 'OTHER';

UPDATE "VisaRequiredDocument" d
SET "visaProductId" = p."id"
FROM "VisaProduct" p
WHERE p."visaCountryId" = d."visaCountryId";

-- Classify the existing free-text names so the documents filter is not blind on day one.
-- Deliberately conservative: only unambiguous matches are categorised, everything else stays
-- OTHER for an admin to correct. A wrong category here would make the filter hide products that
-- actually qualify, which is worse than leaving them uncategorised.
UPDATE "VisaRequiredDocument" SET "category" = 'PASSPORT'
    WHERE "documentName" ILIKE '%passport%' AND "documentName" NOT ILIKE '%visa%';
UPDATE "VisaRequiredDocument" SET "category" = 'BANK_STATEMENT'
    WHERE "documentName" ILIKE '%bank%';
UPDATE "VisaRequiredDocument" SET "category" = 'INCOME_TAX_RETURN'
    WHERE "documentName" ILIKE '%income tax%' OR "documentName" ILIKE '%itr%';
UPDATE "VisaRequiredDocument" SET "category" = 'PHOTO'
    WHERE "documentName" ILIKE '%photo%' OR "documentName" ILIKE '%photograph%';

-- Safe now that every row has been backfilled above.
ALTER TABLE "VisaRequiredDocument" ALTER COLUMN "visaProductId" SET NOT NULL;

ALTER TABLE "VisaRequiredDocument" DROP CONSTRAINT IF EXISTS "VisaRequiredDocument_visaCountryId_fkey";
DROP INDEX IF EXISTS "VisaRequiredDocument_visaCountryId_idx";
ALTER TABLE "VisaRequiredDocument" DROP COLUMN "visaCountryId";

CREATE INDEX "VisaRequiredDocument_visaProductId_idx" ON "VisaRequiredDocument"("visaProductId");
CREATE INDEX "VisaRequiredDocument_category_idx" ON "VisaRequiredDocument"("category");

ALTER TABLE "VisaRequiredDocument" ADD CONSTRAINT "VisaRequiredDocument_visaProductId_fkey"
    FOREIGN KEY ("visaProductId") REFERENCES "VisaProduct"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AlterTable: existing requests keep visaCountryId and gain the product they would have used.
-- Left nullable — a request created before products existed has no product of its own, and
-- forcing one would be a fiction. Its pricing already lives in baseFeeAtRequest either way.
ALTER TABLE "VisaRequest" ADD COLUMN "visaProductId" TEXT;

UPDATE "VisaRequest" r
SET "visaProductId" = p."id"
FROM "VisaProduct" p
WHERE p."visaCountryId" = r."visaCountryId";

CREATE INDEX "VisaRequest_visaProductId_idx" ON "VisaRequest"("visaProductId");

ALTER TABLE "VisaRequest" ADD CONSTRAINT "VisaRequest_visaProductId_fkey"
    FOREIGN KEY ("visaProductId") REFERENCES "VisaProduct"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
