-- Phase 1 of the Library MDM migration: the snapshot boundary.
--
-- Fixes a live defect. A quote froze its price (rawPriceAtQuote, tcsRate, tcsAmount) and nothing
-- else, while voucherService read quote.package.packageHotels / packageDays LIVE. Editing a package
-- therefore rewrote vouchers already issued to customers, with no record that anything moved.
--
-- From here, a quote captures the resolved itinerary at generation time and everything
-- customer-facing reads that instead of the live library.
--
-- Purely additive: a new table only. Quotes issued before this have no snapshot, and the voucher
-- resolver falls back to the live package for them, so historical vouchers keep rendering exactly
-- as they do today.

-- CreateTable
CREATE TABLE "QuoteSnapshot" (
    "id" TEXT NOT NULL,
    "quoteId" TEXT NOT NULL,
    "schemaVersion" INTEGER NOT NULL DEFAULT 1,
    "capturedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "document" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "QuoteSnapshot_pkey" PRIMARY KEY ("id")
);

-- One snapshot per quote, enforced by the database rather than by convention: a second snapshot
-- would mean two different answers to "what was this customer promised".
CREATE UNIQUE INDEX "QuoteSnapshot_quoteId_key" ON "QuoteSnapshot"("quoteId");

ALTER TABLE "QuoteSnapshot" ADD CONSTRAINT "QuoteSnapshot_quoteId_fkey"
    FOREIGN KEY ("quoteId") REFERENCES "Quote"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
