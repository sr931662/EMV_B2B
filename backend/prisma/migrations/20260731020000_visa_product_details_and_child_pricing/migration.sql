-- Round 2 of the visa marketplace: the remaining card fields (validity, max stay, entry type,
-- imagery) and per-passenger-type pricing.
--
-- Hand-written so the fee rename carries its data across. `migrate diff` would drop
-- VisaProduct.baseFee and add an empty adultFee, silently zeroing every configured price.

-- CreateEnum
CREATE TYPE "VisaEntryType" AS ENUM ('SINGLE', 'MULTIPLE');

-- CreateEnum
CREATE TYPE "PassengerType" AS ENUM ('ADULT', 'CHILD');

-- AlterTable: country presentation. All nullable — nothing is required to keep an existing
-- country listed, it just renders without imagery until an admin adds a URL.
ALTER TABLE "VisaCountry" ADD COLUMN "shortName" TEXT;
ALTER TABLE "VisaCountry" ADD COLUMN "coverImageUrl" TEXT;
ALTER TABLE "VisaCountry" ADD COLUMN "flagImageUrl" TEXT;

-- AlterTable: the two remaining day counts and the entry type.
-- Left NULL rather than guessed, for the same reason the processing days were: a validity or stay
-- length printed on a card is a promise, and inventing one is worse than showing nothing.
ALTER TABLE "VisaProduct" ADD COLUMN "validityDays" INTEGER;
ALTER TABLE "VisaProduct" ADD COLUMN "maxStayDays" INTEGER;
ALTER TABLE "VisaProduct" ADD COLUMN "entryType" "VisaEntryType" NOT NULL DEFAULT 'SINGLE';

-- Fee split. The existing baseFee becomes the ADULT fee — that is what it has always meant, since
-- every passenger was charged it — so the rename preserves current pricing exactly.
ALTER TABLE "VisaProduct" RENAME COLUMN "baseFee" TO "adultFee";
ALTER TABLE "VisaProduct" ADD COLUMN "childFee" DECIMAL(12,2) NOT NULL DEFAULT 0;

-- Children start at the adult rate rather than 0. Anything else would silently CUT the price of
-- every configured product the moment this migration ran; an admin lowering it is a deliberate act.
UPDATE "VisaProduct" SET "childFee" = "adultFee";

-- AlterTable: passengers are adults unless someone says otherwise, which matches every row that
-- already exists (they were all charged the single flat fee).
ALTER TABLE "VisaPassenger" ADD COLUMN "passengerType" "PassengerType" NOT NULL DEFAULT 'ADULT';

-- AlterTable: per-type snapshots alongside the original one.
ALTER TABLE "VisaRequest" ADD COLUMN "adultFeeAtRequest" DECIMAL(12,2) NOT NULL DEFAULT 0;
ALTER TABLE "VisaRequest" ADD COLUMN "childFeeAtRequest" DECIMAL(12,2) NOT NULL DEFAULT 0;

-- Backfill from the fee these requests were actually priced at, so historical rows recompute to
-- the same sellingPrice they already have. Not the product's CURRENT fee — that would rewrite
-- history and break the copy-on-select guarantee.
UPDATE "VisaRequest"
SET "adultFeeAtRequest" = "baseFeeAtRequest",
    "childFeeAtRequest" = "baseFeeAtRequest";
