-- Freeze each quote's wholesale price basis (see PROJECT_SPEC.md: copy-on-select applied to
-- price). Added nullable, backfilled, then constrained — the table already has rows, so a
-- straight `ADD COLUMN ... NOT NULL` would fail.

-- AlterTable
ALTER TABLE "Quote" ADD COLUMN "rawPriceAtQuote" DECIMAL(12,2);

-- Backfill 1 (exact). sellingPrice was always computed as rawPrice + markupAmount, so the
-- difference recovers the precise wholesale price each existing quote was actually built on.
-- Preferred over reading Package.rawPrice, which may have changed since: the live price would
-- leave sellingPrice <> rawPriceAtQuote + markupAmount on repriced rows, breaking the very
-- invariant this column exists to guarantee.
UPDATE "Quote"
SET "rawPriceAtQuote" = "sellingPrice" - "markupAmount"
WHERE "sellingPrice" - "markupAmount" >= 0;

-- Backfill 2 (fallback). Any row the derivation could not satisfy takes the package's current
-- price — best effort for dev data.
UPDATE "Quote" q
SET "rawPriceAtQuote" = p."rawPrice"
FROM "Package" p
WHERE p."id" = q."packageId"
  AND q."rawPriceAtQuote" IS NULL;

-- Backfill 3 (last resort) so the NOT NULL constraint can be applied at all.
UPDATE "Quote" SET "rawPriceAtQuote" = 0 WHERE "rawPriceAtQuote" IS NULL;

ALTER TABLE "Quote" ALTER COLUMN "rawPriceAtQuote" SET NOT NULL;
