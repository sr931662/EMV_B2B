-- CONTRACT STEP — VisaCountry merges into Country for good.
--
-- Phase 3 (20260805091933_country_hierarchy_expand) created Country as a mirror of VisaCountry,
-- reusing the SAME id for every row so the two tables agreed on identity from day one. That is
-- what makes this migration safe as a single step rather than its own expand/backfill/contract
-- sequence: every visaCountryId already IS a valid Country id, so repointing a foreign key at
-- Country needs no data transformation, only a constraint change.
--
-- Nothing has been deployed yet (see PROJECT_SPEC.md's phase log), so there is no rolling-deploy
-- window where old code would read a column this migration has already dropped. That is the
-- specific condition that normally forces expand/contract into two deploys; it does not apply here.
--
-- Order matters throughout: constraints before the columns they reference, dependent tables before
-- VisaCountry itself.

-- ---------------------------------------------------------------------------
-- 1. Country absorbs VisaCountry.baseFee
-- ---------------------------------------------------------------------------

ALTER TABLE "Country" ADD COLUMN "baseFee" DECIMAL(12,2) NOT NULL DEFAULT 0;

UPDATE "Country" c
SET "baseFee" = vc."baseFee"
FROM "VisaCountry" vc
WHERE c."id" = vc."id";

-- ---------------------------------------------------------------------------
-- 2. VisaProduct: countryId becomes the sole, required link
-- ---------------------------------------------------------------------------

-- Verify before touching constraints: a NOT NULL added over a real gap fails loudly here, rather
-- than as a cryptic constraint-violation deep in the ALTER below.
DO $$
DECLARE
  orphans INTEGER;
BEGIN
  SELECT count(*) INTO orphans FROM "VisaProduct" WHERE "countryId" IS NULL;
  IF orphans > 0 THEN
    RAISE EXCEPTION 'Contract step aborted: % VisaProduct row(s) have no countryId.', orphans;
  END IF;
END $$;

-- countryId's FK (VisaProduct_countryId_fkey) already exists — added back in the Phase 3 expand
-- step alongside the nullable column. Only the NOT NULL and the retirement of visaCountryId are
-- new here.
ALTER TABLE "VisaProduct" DROP CONSTRAINT "VisaProduct_visaCountryId_fkey";
ALTER TABLE "VisaProduct" DROP COLUMN "visaCountryId";
ALTER TABLE "VisaProduct" ALTER COLUMN "countryId" SET NOT NULL;

-- ---------------------------------------------------------------------------
-- 3. VisaRequest: visaCountryId renamed to countryId, repointed at Country
-- ---------------------------------------------------------------------------
--
-- A rename-in-place, not add+backfill+drop: the column's VALUES need no change (same ids), only
-- its target table and name. ALTER TABLE ... RENAME COLUMN preserves every existing row untouched.

ALTER TABLE "VisaRequest" DROP CONSTRAINT "VisaRequest_visaCountryId_fkey";
ALTER TABLE "VisaRequest" RENAME COLUMN "visaCountryId" TO "countryId";
ALTER TABLE "VisaRequest" ADD CONSTRAINT "VisaRequest_countryId_fkey"
  FOREIGN KEY ("countryId") REFERENCES "Country"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER INDEX "VisaRequest_visaCountryId_idx" RENAME TO "VisaRequest_countryId_idx";

-- ---------------------------------------------------------------------------
-- 4. Destination: visaCountryId dropped outright
-- ---------------------------------------------------------------------------
--
-- Superseded by countryId, which Phase 3's backfill already populated from this exact column for
-- every destination that had one set (see 20260805091933's "First by the explicit visaCountryId"
-- step) — nothing this column could still say, countryId does not already say.

ALTER TABLE "Destination" DROP CONSTRAINT "Destination_visaCountryId_fkey";
DROP INDEX "Destination_visaCountryId_idx";
ALTER TABLE "Destination" DROP COLUMN "visaCountryId";

-- ---------------------------------------------------------------------------
-- 5. VisaCountry dropped
-- ---------------------------------------------------------------------------

DROP INDEX "VisaCountry_searchText_trgm";
DROP TABLE "VisaCountry";
