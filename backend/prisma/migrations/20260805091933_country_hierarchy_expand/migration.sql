-- PHASE 3 — COUNTRY HIERARCHY, EXPAND + BACKFILL.
--
-- Two tables described the same real-world thing. `Destination` held countries AND cities in one
-- flat list, and `VisaCountry` held countries again, matched to destinations by comparing name
-- strings. This introduces `Country` as the single row for a country, links `Destination` and
-- `VisaProduct` to it, and copies the existing data across.
--
-- EXPAND ONLY. Nothing is dropped and nothing is made NOT NULL here. `VisaCountry` keeps working
-- exactly as before, `Destination.visaCountryId` keeps working, and every existing query returns
-- what it returned yesterday. Rolling this migration out cannot break a running deploy, which is
-- the whole reason it is split from the contract step.
--
-- The verification block at the bottom aborts the migration if the backfill left anything
-- unlinked. A partial backfill that reports success is far worse than one that refuses to commit.

-- ---------------------------------------------------------------------------
-- 1. Structure
-- ---------------------------------------------------------------------------

-- CreateTable
CREATE TABLE "Country" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "isoAlpha2" TEXT,
    "isoAlpha3" TEXT,
    "dialCode" TEXT,
    "slug" TEXT NOT NULL,
    "shortName" TEXT,
    "description" TEXT,
    "flagImageUrl" TEXT,
    "heroImageUrl" TEXT,
    "currencyCode" TEXT,
    "languages" TEXT[],
    "timeZones" TEXT[],
    "emergencyContacts" TEXT,
    "embassyDetails" TEXT,
    "weatherSummary" TEXT,
    "bestMonths" INTEGER[],
    "travelNotes" TEXT,
    "searchText" TEXT NOT NULL DEFAULT '',
    "archived" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Country_pkey" PRIMARY KEY ("id")
);

-- AlterTable
ALTER TABLE "Destination" ADD COLUMN     "bestSeason" TEXT,
ADD COLUMN     "city" TEXT,
ADD COLUMN     "countryId" TEXT,
ADD COLUMN     "latitude" DECIMAL(9,6),
ADD COLUMN     "longitude" DECIMAL(9,6),
ADD COLUMN     "seoDescription" TEXT,
ADD COLUMN     "seoKeywords" TEXT[],
ADD COLUMN     "seoTitle" TEXT,
ADD COLUMN     "shortCode" TEXT,
ADD COLUMN     "state" TEXT,
ADD COLUMN     "timeZone" TEXT,
ADD COLUMN     "weatherSummary" TEXT;

-- AlterTable
ALTER TABLE "VisaProduct" ADD COLUMN     "countryId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "Country_name_key" ON "Country"("name");

-- CreateIndex
CREATE UNIQUE INDEX "Country_isoAlpha2_key" ON "Country"("isoAlpha2");

-- CreateIndex
CREATE UNIQUE INDEX "Country_isoAlpha3_key" ON "Country"("isoAlpha3");

-- CreateIndex
CREATE UNIQUE INDEX "Country_slug_key" ON "Country"("slug");

-- CreateIndex
CREATE INDEX "Country_archived_idx" ON "Country"("archived");

-- CreateIndex
CREATE INDEX "Country_currencyCode_idx" ON "Country"("currencyCode");

-- CreateIndex
CREATE INDEX "Destination_countryId_idx" ON "Destination"("countryId");

-- CreateIndex
CREATE INDEX "VisaProduct_countryId_idx" ON "VisaProduct"("countryId");

-- The same trigram index every other searchable master table already has. Created here in raw SQL
-- because `gin_trgm_ops` needs the extension; also declared in schema.prisma so drift detection
-- knows it exists and stops planning a DROP for it.
CREATE INDEX IF NOT EXISTS "Country_searchText_trgm" ON "Country" USING GIN ("searchText" gin_trgm_ops);

-- AddForeignKey
ALTER TABLE "Country" ADD CONSTRAINT "Country_currencyCode_fkey" FOREIGN KEY ("currencyCode") REFERENCES "Currency"("code") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Destination" ADD CONSTRAINT "Destination_countryId_fkey" FOREIGN KEY ("countryId") REFERENCES "Country"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VisaProduct" ADD CONSTRAINT "VisaProduct_countryId_fkey" FOREIGN KEY ("countryId") REFERENCES "Country"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ---------------------------------------------------------------------------
-- 2. Backfill
-- ---------------------------------------------------------------------------

-- Slug helper, scoped to this migration and dropped at the end. Inline `regexp_replace` chains
-- repeated four times is where a subtle difference between two of them hides.
CREATE OR REPLACE FUNCTION pg_temp.country_slug(input TEXT) RETURNS TEXT AS $$
  SELECT trim(both '-' from regexp_replace(lower(coalesce(input, '')), '[^a-z0-9]+', '-', 'g'));
$$ LANGUAGE SQL IMMUTABLE;

-- 2a. Every VisaCountry becomes a Country. This side goes first because it carries the richer
--     content (flag, arrival info, about text) and, being a genuine country list rather than a
--     mixed one, it is the more trustworthy source when both tables name the same place.
INSERT INTO "Country" (
  "id", "name", "slug", "shortName", "description", "flagImageUrl", "heroImageUrl",
  "languages", "timeZones", "bestMonths", "travelNotes", "searchText",
  "archived", "createdAt", "updatedAt"
)
SELECT
  vc."id",                                  -- Reusing the id keeps the two rows traceable to each
                                            -- other without a mapping table, and makes the later
                                            -- contract step a rename rather than a re-point.
  vc."name",
  pg_temp.country_slug(vc."name"),
  vc."shortName",
  vc."aboutCountry",
  vc."flagImageUrl",
  vc."coverImageUrl",
  ARRAY[]::TEXT[],
  ARRAY[]::TEXT[],
  ARRAY[]::INTEGER[],
  vc."arrivalInfo",
  lower(coalesce(vc."name", '') || ' ' || coalesce(vc."shortName", '')),
  vc."archived",
  vc."createdAt",
  vc."updatedAt"
FROM "VisaCountry" vc
ON CONFLICT ("name") DO NOTHING;

-- 2b. Destinations that are actually countries. Today the table is flat, so a destination named
--     "Thailand" IS the country; one named "Phuket" is not. There is no reliable way to tell them
--     apart from a name alone, so the rule is deliberately conservative: a destination becomes a
--     country only when nothing in VisaCountry already claims that name. Anything ambiguous is left
--     for a human to reclassify in the admin shell rather than guessed at here.
INSERT INTO "Country" (
  "id", "name", "slug", "shortName", "description", "flagImageUrl", "heroImageUrl",
  "languages", "timeZones", "bestMonths", "travelNotes", "searchText",
  "archived", "createdAt", "updatedAt"
)
SELECT
  gen_random_uuid()::TEXT,
  d."name",
  pg_temp.country_slug(d."name"),
  d."shortName",
  d."aboutDestination",
  d."flagImageUrl",
  d."coverImageUrl",
  ARRAY[]::TEXT[],
  ARRAY[]::TEXT[],
  ARRAY[]::INTEGER[],
  d."generalNotes",
  lower(coalesce(d."name", '') || ' ' || coalesce(d."shortName", '')),
  d."archived",
  d."createdAt",
  d."updatedAt"
FROM "Destination" d
WHERE NOT EXISTS (SELECT 1 FROM "Country" c WHERE lower(c."name") = lower(d."name"))
ON CONFLICT ("name") DO NOTHING;

-- Slug collisions. Two differently-named countries can normalise to the same slug ("Cote d'Ivoire"
-- and "Cote-d-Ivoire"), and slug is UNIQUE. Suffix the later ones rather than failing the migration
-- over a cosmetic field.
UPDATE "Country" c
SET "slug" = c."slug" || '-' || left(c."id", 6)
WHERE EXISTS (
  SELECT 1 FROM "Country" other
  WHERE other."slug" = c."slug" AND other."id" <> c."id" AND other."createdAt" <= c."createdAt"
);

-- 2c. Link destinations to their country.
--     First by the explicit visaCountryId, which is the only signal that cannot have drifted...
UPDATE "Destination" d
SET "countryId" = d."visaCountryId"
WHERE d."visaCountryId" IS NOT NULL
  AND d."countryId" IS NULL
  AND EXISTS (SELECT 1 FROM "Country" c WHERE c."id" = d."visaCountryId");

--     ...then by name, which is what the application was already doing implicitly. Doing it here
--     once, in a transaction that can be inspected, is strictly better than doing it on every
--     request forever.
UPDATE "Destination" d
SET "countryId" = c."id"
FROM "Country" c
WHERE d."countryId" IS NULL AND lower(c."name") = lower(d."name");

-- 2d. Visa products point at the merged country. Safe because 2a reused VisaCountry ids verbatim.
UPDATE "VisaProduct" p
SET "countryId" = p."visaCountryId"
WHERE p."countryId" IS NULL
  AND EXISTS (SELECT 1 FROM "Country" c WHERE c."id" = p."visaCountryId");

-- ---------------------------------------------------------------------------
-- 3. Verification — abort rather than commit a partial backfill
-- ---------------------------------------------------------------------------

DO $$
DECLARE
  orphan_destinations INTEGER;
  orphan_products     INTEGER;
BEGIN
  SELECT count(*) INTO orphan_destinations FROM "Destination" WHERE "countryId" IS NULL;
  SELECT count(*) INTO orphan_products     FROM "VisaProduct" WHERE "countryId" IS NULL;

  -- Destinations are allowed to be unlinked at this point ONLY if they are cities that no country
  -- row matches, which cannot happen given 2b creates a country for every unmatched destination.
  -- If it happens anyway the assumption behind this migration is wrong and it must not commit.
  IF orphan_destinations > 0 THEN
    RAISE EXCEPTION
      'Phase 3 backfill incomplete: % destination(s) have no country. Nothing has been committed.',
      orphan_destinations;
  END IF;

  IF orphan_products > 0 THEN
    RAISE EXCEPTION
      'Phase 3 backfill incomplete: % visa product(s) have no country. Nothing has been committed.',
      orphan_products;
  END IF;
END $$;

DROP FUNCTION pg_temp.country_slug(TEXT);
