-- Same double-payment guard as `Payment_one_live_payment_per_quote` (see
-- 20260725133111_add_payment_verification_fields), mirrored for the visa side of Payment.
--
-- At most one live payment per visa request. REJECTED rows accumulate freely so a partner can
-- resubmit; a superseded INFO_REQUESTED row is archived (never deleted) by paymentService before
-- the new row is inserted. Prisma cannot express a partial unique index, so this is raw SQL.
-- A violation surfaces as P2002, rendered as 409 by the global error handler.
--
-- quoteId is NULL for VISA payments and visaRequestId is NULL for PACKAGE payments, and
-- Postgres allows unlimited NULLs in a unique index, so this index and
-- Payment_one_live_payment_per_quote never interact.
CREATE UNIQUE INDEX "Payment_one_live_payment_per_visa_request"
  ON "Payment" ("visaRequestId")
  WHERE "archived" = false
    AND "status" IN ('PENDING_VERIFICATION'::"PaymentStatus", 'APPROVED'::"PaymentStatus");
