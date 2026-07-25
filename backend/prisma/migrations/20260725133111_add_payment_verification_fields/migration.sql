-- AlterTable
ALTER TABLE "Payment" ADD COLUMN     "reconciliationMismatch" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "verifiedAt" TIMESTAMP(3);

-- Double-payment guard, at the database level.
--
-- paymentService also checks this in application code and returns a friendly 409, but that
-- check has a race window between SELECT and INSERT. Money correctness deserves a constraint
-- that cannot be raced: at most one live payment per quote. A partial index is used because
-- REJECTED payments must be allowed to accumulate (partner resubmits after a rejection), and
-- INFO_REQUESTED is superseded by a fresh submission rather than blocking it.
--
-- Prisma's schema language cannot express a partial unique index, so it lives here as raw SQL.
-- A violation surfaces as P2002, which the global error handler already renders as a 409.
-- quoteId is NULL for VISA payments, and Postgres allows unlimited NULLs in a unique index,
-- so visa payments are unaffected.
CREATE UNIQUE INDEX "Payment_one_live_payment_per_quote"
  ON "Payment" ("quoteId")
  WHERE "archived" = false
    AND "status" IN ('PENDING_VERIFICATION'::"PaymentStatus", 'APPROVED'::"PaymentStatus");
