-- Bring the LIBRARY up to parity with what packages can hold.
--
-- The gap this closes: Hotel had 4 fields while PackageHotel had 17, and DayTemplate had 2 while
-- PackageDay carried content plus a whole schedule of events. Because library entries are COPIED
-- into packages (locked rule 2), anything missing from the source is something an admin had to
-- retype for every package the entry appeared in -- which is the opposite of what a library is for.
--
-- Also replaces the name-string matching between Destination and VisaCountry with a real foreign
-- key: the old lookup silently returned nothing the moment the two libraries spelled a country
-- differently.
--
-- Purely additive. Every new column is nullable or defaulted and the new tables start empty.


-- AlterTable
ALTER TABLE "DayTemplate" ADD COLUMN     "brief" TEXT,
ADD COLUMN     "coverImageUrl" TEXT,
ADD COLUMN     "inclusions" TEXT,
ADD COLUMN     "mealsIncluded" "MealType"[],
ADD COLUMN     "notes" TEXT;
-- AlterTable
ALTER TABLE "Destination" ADD COLUMN     "coverImageUrl" TEXT,
ADD COLUMN     "flagImageUrl" TEXT,
ADD COLUMN     "shortName" TEXT,
ADD COLUMN     "visaCountryId" TEXT;
-- AlterTable
ALTER TABLE "Hotel" ADD COLUMN     "address" TEXT,
ADD COLUMN     "checkInMinute" INTEGER,
ADD COLUMN     "checkOutMinute" INTEGER,
ADD COLUMN     "coverImageUrl" TEXT,
ADD COLUMN     "googleRating" DECIMAL(2,1),
ADD COLUMN     "googleRatingCount" INTEGER,
ADD COLUMN     "mapLink" TEXT,
ADD COLUMN     "mealPlan" TEXT,
ADD COLUMN     "refundable" BOOLEAN,
ADD COLUMN     "roomType" TEXT,
ADD COLUMN     "servicesOffered" TEXT,
ADD COLUMN     "starRating" INTEGER;
-- CreateTable
CREATE TABLE "DayTemplateEvent" (
    "id" TEXT NOT NULL,
    "dayTemplateId" TEXT NOT NULL,
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
    CONSTRAINT "DayTemplateEvent_pkey" PRIMARY KEY ("id")
);
-- CreateTable
CREATE TABLE "HolidayType" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "description" TEXT,
    "icon" TEXT,
    "imageUrl" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "archived" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "HolidayType_pkey" PRIMARY KEY ("id")
);
-- CreateTable
CREATE TABLE "HolidayTypeOnPackage" (
    "packageId" TEXT NOT NULL,
    "holidayTypeId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "HolidayTypeOnPackage_pkey" PRIMARY KEY ("packageId","holidayTypeId")
);
-- CreateTable
CREATE TABLE "HolidayTypeOnDestination" (
    "destinationId" TEXT NOT NULL,
    "holidayTypeId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "HolidayTypeOnDestination_pkey" PRIMARY KEY ("destinationId","holidayTypeId")
);
-- CreateIndex
CREATE INDEX "DayTemplateEvent_dayTemplateId_idx" ON "DayTemplateEvent"("dayTemplateId");
-- CreateIndex
CREATE INDEX "DayTemplateEvent_parentEventId_idx" ON "DayTemplateEvent"("parentEventId");
-- CreateIndex
CREATE INDEX "DayTemplateEvent_archived_idx" ON "DayTemplateEvent"("archived");
-- CreateIndex
CREATE UNIQUE INDEX "HolidayType_name_key" ON "HolidayType"("name");
-- CreateIndex
CREATE UNIQUE INDEX "HolidayType_slug_key" ON "HolidayType"("slug");
-- CreateIndex
CREATE INDEX "HolidayType_archived_idx" ON "HolidayType"("archived");
-- CreateIndex
CREATE INDEX "HolidayTypeOnPackage_holidayTypeId_idx" ON "HolidayTypeOnPackage"("holidayTypeId");
-- CreateIndex
CREATE INDEX "HolidayTypeOnDestination_holidayTypeId_idx" ON "HolidayTypeOnDestination"("holidayTypeId");
-- CreateIndex
CREATE INDEX "Destination_visaCountryId_idx" ON "Destination"("visaCountryId");
-- AddForeignKey
ALTER TABLE "Destination" ADD CONSTRAINT "Destination_visaCountryId_fkey" FOREIGN KEY ("visaCountryId") REFERENCES "VisaCountry"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE "DayTemplateEvent" ADD CONSTRAINT "DayTemplateEvent_dayTemplateId_fkey" FOREIGN KEY ("dayTemplateId") REFERENCES "DayTemplate"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE "DayTemplateEvent" ADD CONSTRAINT "DayTemplateEvent_parentEventId_fkey" FOREIGN KEY ("parentEventId") REFERENCES "DayTemplateEvent"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE "HolidayTypeOnPackage" ADD CONSTRAINT "HolidayTypeOnPackage_packageId_fkey" FOREIGN KEY ("packageId") REFERENCES "Package"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE "HolidayTypeOnPackage" ADD CONSTRAINT "HolidayTypeOnPackage_holidayTypeId_fkey" FOREIGN KEY ("holidayTypeId") REFERENCES "HolidayType"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE "HolidayTypeOnDestination" ADD CONSTRAINT "HolidayTypeOnDestination_destinationId_fkey" FOREIGN KEY ("destinationId") REFERENCES "Destination"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE "HolidayTypeOnDestination" ADD CONSTRAINT "HolidayTypeOnDestination_holidayTypeId_fkey" FOREIGN KEY ("holidayTypeId") REFERENCES "HolidayType"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Backfill the destination -> visa country link where both libraries already agree on the name.
-- Case-insensitive because that is exactly the mismatch the old string comparison kept hitting.
-- Anything that does not match is left NULL for an admin to link by hand; guessing here would be
-- worse than an empty visa section.
UPDATE "Destination" d
SET "visaCountryId" = vc."id"
FROM "VisaCountry" vc
WHERE LOWER(TRIM(d."name")) = LOWER(TRIM(vc."name"))
  AND d."visaCountryId" IS NULL;
