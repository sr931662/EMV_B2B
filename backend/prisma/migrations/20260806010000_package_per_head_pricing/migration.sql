-- Per-head package pricing: a package now prices adults and children separately, and a quote
-- freezes both at creation the same way it already froze one flat price.

-- Package.rawPrice -> Package.adultRawPrice. A rename, not a drop+add: every existing package's
-- price is exactly its adult price (children priced flat at 0/free unless an admin sets otherwise
-- afterwards) — there is no meaningful backfill decision to make here.
ALTER TABLE "Package" RENAME COLUMN "rawPrice" TO "adultRawPrice";
ALTER TABLE "Package" ADD COLUMN "childRawPrice" DECIMAL(12,2) NOT NULL DEFAULT 0;

-- Quote.rawPriceAtQuote is NOT renamed (see schema.prisma's comment on why) — it now specifically
-- means the adult portion frozen at quote time. childRawPriceAtQuote is its new sibling; existing
-- quotes get 0, which is correct — they were priced before per-head pricing existed, and
-- retroactively inventing a child rate for them would misstate what the customer was actually
-- quoted (same reasoning already applied to tcsRate/tcsAmount defaulting to 0 on old rows).
ALTER TABLE "Quote" ADD COLUMN "childRawPriceAtQuote" DECIMAL(12,2) NOT NULL DEFAULT 0;
