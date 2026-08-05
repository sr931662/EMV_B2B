-- CreateEnum
CREATE TYPE "CancellationChargeType" AS ENUM ('PERCENT_OF_TOTAL', 'FIXED_AMOUNT', 'NIGHTS', 'NONE');

-- CreateEnum
CREATE TYPE "NoteBlockType" AS ENUM ('TERMS_AND_CONDITIONS', 'SCOPE_OF_SERVICES', 'CANCELLATION_POLICY_TEXT', 'AMENDMENT_POLICY', 'GENERAL_NOTE', 'TOURS_AND_TRANSFERS_NOTE', 'VISA_NOTE', 'PAYMENT_TERMS', 'OTHER');

-- CreateEnum
CREATE TYPE "DocumentSubject" AS ENUM ('TRAVELLER', 'BOOKING');

-- AlterTable
ALTER TABLE "ContentBlock" ADD COLUMN     "isGlobal" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "searchText" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "sortOrder" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "type" "NoteBlockType" NOT NULL DEFAULT 'OTHER';

-- AlterTable
ALTER TABLE "Package" ADD COLUMN     "cancellationPolicyId" TEXT;

-- AlterTable
ALTER TABLE "QuoteInsurance" ADD COLUMN     "insurancePlanId" TEXT;

-- AlterTable
ALTER TABLE "VisaRequiredDocument" ADD COLUMN     "documentTypeId" TEXT;

-- CreateTable
CREATE TABLE "DocumentType" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "category" "VisaDocumentCategory" NOT NULL DEFAULT 'OTHER',
    "subject" "DocumentSubject" NOT NULL DEFAULT 'TRAVELLER',
    "description" TEXT,
    "sampleImageUrl" TEXT,
    "requirementNotes" TEXT,
    "isMandatoryByDefault" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "searchText" TEXT NOT NULL DEFAULT '',
    "archived" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DocumentType_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FaqItem" (
    "id" TEXT NOT NULL,
    "question" TEXT NOT NULL,
    "answer" TEXT NOT NULL,
    "category" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "searchText" TEXT NOT NULL DEFAULT '',
    "archived" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FaqItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CancellationPolicy" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "description" TEXT,
    "notes" TEXT,
    "searchText" TEXT NOT NULL DEFAULT '',
    "archived" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CancellationPolicy_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CancellationTier" (
    "id" TEXT NOT NULL,
    "policyId" TEXT NOT NULL,
    "daysBeforeTravelMin" INTEGER NOT NULL,
    "daysBeforeTravelMax" INTEGER,
    "chargeType" "CancellationChargeType" NOT NULL DEFAULT 'PERCENT_OF_TOTAL',
    "chargeValue" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "currencyCode" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "archived" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CancellationTier_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InsurancePlan" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "coverageSummary" TEXT,
    "inclusions" TEXT,
    "exclusions" TEXT,
    "brochureUrl" TEXT,
    "coverageAmount" DECIMAL(12,2),
    "premiumAdult" DECIMAL(12,2),
    "premiumChild" DECIMAL(12,2),
    "currencyCode" TEXT,
    "minAgeYears" INTEGER,
    "maxAgeYears" INTEGER,
    "maxTripDays" INTEGER,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "searchText" TEXT NOT NULL DEFAULT '',
    "archived" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "InsurancePlan_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "DocumentType_name_key" ON "DocumentType"("name");

-- CreateIndex
CREATE UNIQUE INDEX "DocumentType_slug_key" ON "DocumentType"("slug");

-- CreateIndex
CREATE INDEX "DocumentType_archived_idx" ON "DocumentType"("archived");

-- CreateIndex
CREATE INDEX "DocumentType_category_idx" ON "DocumentType"("category");

-- CreateIndex
CREATE INDEX "DocumentType_searchText_trgm" ON "DocumentType" USING GIN ("searchText" gin_trgm_ops);

-- CreateIndex
CREATE INDEX "FaqItem_archived_idx" ON "FaqItem"("archived");

-- CreateIndex
CREATE INDEX "FaqItem_category_idx" ON "FaqItem"("category");

-- CreateIndex
CREATE INDEX "FaqItem_searchText_trgm" ON "FaqItem" USING GIN ("searchText" gin_trgm_ops);

-- CreateIndex
CREATE UNIQUE INDEX "CancellationPolicy_name_key" ON "CancellationPolicy"("name");

-- CreateIndex
CREATE UNIQUE INDEX "CancellationPolicy_slug_key" ON "CancellationPolicy"("slug");

-- CreateIndex
CREATE INDEX "CancellationPolicy_archived_idx" ON "CancellationPolicy"("archived");

-- CreateIndex
CREATE INDEX "CancellationPolicy_searchText_trgm" ON "CancellationPolicy" USING GIN ("searchText" gin_trgm_ops);

-- CreateIndex
CREATE INDEX "CancellationTier_policyId_idx" ON "CancellationTier"("policyId");

-- CreateIndex
CREATE INDEX "CancellationTier_archived_idx" ON "CancellationTier"("archived");

-- CreateIndex
CREATE INDEX "CancellationTier_currencyCode_idx" ON "CancellationTier"("currencyCode");

-- CreateIndex
CREATE UNIQUE INDEX "InsurancePlan_slug_key" ON "InsurancePlan"("slug");

-- CreateIndex
CREATE INDEX "InsurancePlan_archived_idx" ON "InsurancePlan"("archived");

-- CreateIndex
CREATE INDEX "InsurancePlan_currencyCode_idx" ON "InsurancePlan"("currencyCode");

-- CreateIndex
CREATE INDEX "InsurancePlan_searchText_trgm" ON "InsurancePlan" USING GIN ("searchText" gin_trgm_ops);

-- CreateIndex
CREATE INDEX "ContentBlock_type_idx" ON "ContentBlock"("type");

-- CreateIndex
CREATE INDEX "Package_cancellationPolicyId_idx" ON "Package"("cancellationPolicyId");

-- CreateIndex
CREATE INDEX "QuoteInsurance_insurancePlanId_idx" ON "QuoteInsurance"("insurancePlanId");

-- CreateIndex
CREATE INDEX "VisaRequiredDocument_documentTypeId_idx" ON "VisaRequiredDocument"("documentTypeId");

-- AddForeignKey
ALTER TABLE "Package" ADD CONSTRAINT "Package_cancellationPolicyId_fkey" FOREIGN KEY ("cancellationPolicyId") REFERENCES "CancellationPolicy"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuoteInsurance" ADD CONSTRAINT "QuoteInsurance_insurancePlanId_fkey" FOREIGN KEY ("insurancePlanId") REFERENCES "InsurancePlan"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CancellationTier" ADD CONSTRAINT "CancellationTier_policyId_fkey" FOREIGN KEY ("policyId") REFERENCES "CancellationPolicy"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CancellationTier" ADD CONSTRAINT "CancellationTier_currencyCode_fkey" FOREIGN KEY ("currencyCode") REFERENCES "Currency"("code") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InsurancePlan" ADD CONSTRAINT "InsurancePlan_currencyCode_fkey" FOREIGN KEY ("currencyCode") REFERENCES "Currency"("code") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VisaRequiredDocument" ADD CONSTRAINT "VisaRequiredDocument_documentTypeId_fkey" FOREIGN KEY ("documentTypeId") REFERENCES "DocumentType"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ---------------------------------------------------------------------------
-- BACKFILL — turn the free-text visa checklist into named document types
--
-- `VisaRequiredDocument.documentName` was free text, so the same document appeared as "Bank
-- Statement", "bank statement" and "6-month bank statements" across products. The filter on
-- "documents required" could never work against that, and no two products agreed on wording.
--
-- One DocumentType per distinct name, matched case-insensitively, keeping the most common spelling
-- as the canonical one. `documentName` is NOT cleared: a product may legitimately say
-- "Passport (first and last page)" where the type is simply "Passport", and rewriting authored
-- text during a migration is not this migration's business.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION pg_temp.doc_slug(input TEXT) RETURNS TEXT AS $$
  SELECT trim(both '-' from regexp_replace(lower(coalesce(input, '')), '[^a-z0-9]+', '-', 'g'));
$$ LANGUAGE SQL IMMUTABLE;

INSERT INTO "DocumentType" (
  "id", "name", "slug", "category", "subject", "isMandatoryByDefault",
  "sortOrder", "searchText", "archived", "createdAt", "updatedAt"
)
SELECT
  gen_random_uuid()::TEXT,
  ranked."name",
  pg_temp.doc_slug(ranked."name"),
  ranked."category",
  -- Everything on a visa checklist is produced by a person, not by the booking. A booking-level
  -- document (a hotel voucher, a covering letter) is a distinction an admin makes afterwards; the
  -- migration does not guess it.
  'TRAVELLER',
  ranked."isMandatory",
  0,
  lower(ranked."name"),
  false,
  now(),
  now()
FROM (
  SELECT DISTINCT ON (lower(trim(d."documentName")))
    trim(d."documentName") AS "name",
    d."category",
    d."isMandatory"
  FROM "VisaRequiredDocument" d
  WHERE d."archived" = false AND trim(coalesce(d."documentName", '')) <> ''
  -- The most-used spelling wins, so "Bank Statement" beats a one-off "bank stmt".
  ORDER BY lower(trim(d."documentName")), d."createdAt" ASC
) AS ranked
ON CONFLICT ("name") DO NOTHING;

-- Slug collisions: two names normalising to one slug ("E-Ticket" / "E Ticket"). Suffix rather than
-- fail — a slug is a URL convenience, not worth aborting a migration over.
UPDATE "DocumentType" t
SET "slug" = t."slug" || '-' || left(t."id", 6)
WHERE EXISTS (
  SELECT 1 FROM "DocumentType" other
  WHERE other."slug" = t."slug" AND other."id" <> t."id" AND other."createdAt" <= t."createdAt"
);

UPDATE "VisaRequiredDocument" d
SET "documentTypeId" = t."id"
FROM "DocumentType" t
WHERE d."documentTypeId" IS NULL
  AND lower(trim(d."documentName")) = lower(t."name");

-- ---------------------------------------------------------------------------
-- Verification — a checklist row left unlinked means the backfill's assumption was wrong
-- ---------------------------------------------------------------------------

DO $$
DECLARE
  orphans INTEGER;
BEGIN
  SELECT count(*) INTO orphans
  FROM "VisaRequiredDocument"
  WHERE "archived" = false
    AND trim(coalesce("documentName", '')) <> ''
    AND "documentTypeId" IS NULL;

  IF orphans > 0 THEN
    RAISE EXCEPTION
      'Phase 4 backfill incomplete: % checklist row(s) have no document type. Nothing committed.',
      orphans;
  END IF;
END $$;

DROP FUNCTION pg_temp.doc_slug(TEXT);
