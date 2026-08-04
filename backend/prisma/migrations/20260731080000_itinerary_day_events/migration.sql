-- Day-wise itinerary: hotel detail, per-day content, and structured events with sub-events.
--
-- Entirely additive. Every column is nullable or has a default and the new table starts empty, so
-- existing packages keep rendering exactly as they do today until an admin fills the detail in.

-- CreateEnum
CREATE TYPE "DayEventType" AS ENUM ('ARRIVAL', 'CHECK_IN', 'TRANSFER', 'SIGHTSEEING', 'ACTIVITY', 'MEAL', 'LEISURE', 'CHECK_OUT', 'OVERNIGHT', 'DEPARTURE');

-- CreateEnum
CREATE TYPE "MealType" AS ENUM ('BREAKFAST', 'LUNCH', 'DINNER');

-- AlterTable: package-level FAQs, printed after the exclusions.
ALTER TABLE "Package" ADD COLUMN "faqs" TEXT;

-- AlterTable: per-day content. `description` stays the long-form text; these add the summary,
-- caveats, per-day inclusions and imagery the itinerary view lays out around it.
ALTER TABLE "PackageDay" ADD COLUMN "brief" TEXT,
ADD COLUMN "coverImageUrl" TEXT,
ADD COLUMN "inclusions" TEXT,
ADD COLUMN "mealsIncluded" "MealType"[],
ADD COLUMN "notes" TEXT;

-- AlterTable: hotel detail.
--
-- checkInMinute/checkOutMinute are TIMES OF DAY in minutes from midnight, not timestamps — the
-- date a guest checks in comes from the quote's travel date, so a date stored here would be wrong
-- for every trip but one.
--
-- `refundable` is deliberately nullable: NULL means "not stated", which is different from FALSE.
-- Defaulting it either way would print a cancellation stance nobody actually entered.
ALTER TABLE "PackageHotel" ADD COLUMN "checkInMinute" INTEGER,
ADD COLUMN "checkOutMinute" INTEGER,
ADD COLUMN "coverImageUrl" TEXT,
ADD COLUMN "googleRating" DECIMAL(2,1),
ADD COLUMN "googleRatingCount" INTEGER,
ADD COLUMN "mapLink" TEXT,
ADD COLUMN "mealPlan" TEXT,
ADD COLUMN "refundable" BOOLEAN,
ADD COLUMN "roomType" TEXT,
ADD COLUMN "servicesOffered" TEXT,
ADD COLUMN "starRating" INTEGER;

-- CreateTable: the scheduled items on a day. parentEventId gives sub-events without a second
-- table — a day tour with three stops is one row with three children.
CREATE TABLE "PackageDayEvent" (
    "id" TEXT NOT NULL,
    "packageDayId" TEXT NOT NULL,
    "parentEventId" TEXT,
    "sortOrder" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "type" "DayEventType" NOT NULL DEFAULT 'ACTIVITY',
    "startMinute" INTEGER,
    "durationMinutes" INTEGER,
    "mealsIncluded" "MealType"[],
    "availability" TEXT,
    "transferMode" TEXT,
    "luggageAllowance" TEXT,
    "archived" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PackageDayEvent_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "PackageDayEvent_packageDayId_idx" ON "PackageDayEvent"("packageDayId");
CREATE INDEX "PackageDayEvent_parentEventId_idx" ON "PackageDayEvent"("parentEventId");
CREATE INDEX "PackageDayEvent_archived_idx" ON "PackageDayEvent"("archived");

ALTER TABLE "PackageDayEvent" ADD CONSTRAINT "PackageDayEvent_packageDayId_fkey"
    FOREIGN KEY ("packageDayId") REFERENCES "PackageDay"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "PackageDayEvent" ADD CONSTRAINT "PackageDayEvent_parentEventId_fkey"
    FOREIGN KEY ("parentEventId") REFERENCES "PackageDayEvent"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
