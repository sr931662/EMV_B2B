-- CreateEnum
CREATE TYPE "VendorType" AS ENUM ('HOTEL_SUPPLIER', 'DMC', 'TRANSPORT', 'ACTIVITY', 'INSURANCE', 'VISA', 'OTHER');

-- CreateEnum
CREATE TYPE "RateBasis" AS ENUM ('PER_ROOM_PER_NIGHT', 'PER_PERSON_PER_NIGHT', 'PER_ROOM_PER_STAY', 'PER_PERSON_PER_STAY');

-- CreateEnum
CREATE TYPE "Occupancy" AS ENUM ('SINGLE', 'DOUBLE', 'TRIPLE', 'QUAD', 'EXTRA_ADULT', 'CHILD_WITH_BED', 'CHILD_NO_BED', 'INFANT');

-- CreateEnum
CREATE TYPE "PaxType" AS ENUM ('ADULT', 'CHILD', 'INFANT', 'GROUP');

-- CreateEnum
CREATE TYPE "TransferBasis" AS ENUM ('SIC', 'PRIVATE', 'NONE');

-- AlterTable
ALTER TABLE "DayTemplateEvent" ADD COLUMN     "activityId" TEXT;

-- AlterTable
ALTER TABLE "PackageDayEvent" ADD COLUMN     "sourceActivityId" TEXT;

-- CreateTable
CREATE TABLE "Vendor" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "types" "VendorType"[],
    "contactPerson" TEXT,
    "email" TEXT,
    "phone" TEXT,
    "address" TEXT,
    "website" TEXT,
    "countryId" TEXT,
    "gstNumber" TEXT,
    "panNumber" TEXT,
    "paymentTerms" TEXT,
    "creditDays" INTEGER,
    "defaultCurrencyCode" TEXT,
    "notes" TEXT,
    "searchText" TEXT NOT NULL DEFAULT '',
    "archived" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Vendor_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HotelVendor" (
    "id" TEXT NOT NULL,
    "hotelId" TEXT NOT NULL,
    "vendorId" TEXT NOT NULL,
    "contractRef" TEXT NOT NULL DEFAULT '',
    "contractFrom" DATE,
    "contractTo" DATE,
    "allocationRooms" INTEGER,
    "releaseDays" INTEGER,
    "cancellationPolicyId" TEXT,
    "isPreferred" BOOLEAN NOT NULL DEFAULT false,
    "notes" TEXT,
    "archived" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "HotelVendor_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HotelRate" (
    "id" TEXT NOT NULL,
    "hotelId" TEXT NOT NULL,
    "hotelVendorId" TEXT,
    "vendorId" TEXT,
    "roomType" TEXT NOT NULL,
    "mealPlan" TEXT NOT NULL,
    "occupancy" "Occupancy" NOT NULL DEFAULT 'DOUBLE',
    "validFrom" DATE NOT NULL,
    "validTo" DATE NOT NULL,
    "basis" "RateBasis" NOT NULL DEFAULT 'PER_ROOM_PER_NIGHT',
    "amount" DECIMAL(12,2) NOT NULL,
    "currencyCode" TEXT NOT NULL,
    "taxPercent" DECIMAL(5,2),
    "minNights" INTEGER,
    "maxNights" INTEGER,
    "blackoutDates" DATE[],
    "isPublished" BOOLEAN NOT NULL DEFAULT false,
    "notes" TEXT,
    "archived" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "HotelRate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Activity" (
    "id" TEXT NOT NULL,
    "destinationId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "description" TEXT,
    "category" TEXT,
    "durationMinutes" INTEGER,
    "suggestedStartMinute" INTEGER,
    "meetingPoint" TEXT,
    "inclusions" TEXT,
    "exclusions" TEXT,
    "notes" TEXT,
    "coverImageUrl" TEXT,
    "images" TEXT[],
    "minAgeYears" INTEGER,
    "maxPax" INTEGER,
    "searchText" TEXT NOT NULL DEFAULT '',
    "archived" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Activity_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ActivityRate" (
    "id" TEXT NOT NULL,
    "activityId" TEXT NOT NULL,
    "vendorId" TEXT,
    "paxType" "PaxType" NOT NULL DEFAULT 'ADULT',
    "transfer" "TransferBasis" NOT NULL DEFAULT 'SIC',
    "validFrom" DATE NOT NULL,
    "validTo" DATE NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "currencyCode" TEXT NOT NULL,
    "minPax" INTEGER,
    "maxPax" INTEGER,
    "isPublished" BOOLEAN NOT NULL DEFAULT false,
    "notes" TEXT,
    "archived" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ActivityRate_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Vendor_name_key" ON "Vendor"("name");

-- CreateIndex
CREATE UNIQUE INDEX "Vendor_slug_key" ON "Vendor"("slug");

-- CreateIndex
CREATE INDEX "Vendor_archived_idx" ON "Vendor"("archived");

-- CreateIndex
CREATE INDEX "Vendor_countryId_idx" ON "Vendor"("countryId");

-- CreateIndex
CREATE INDEX "Vendor_defaultCurrencyCode_idx" ON "Vendor"("defaultCurrencyCode");

-- CreateIndex
CREATE INDEX "Vendor_searchText_trgm" ON "Vendor" USING GIN ("searchText" gin_trgm_ops);

-- CreateIndex
CREATE INDEX "HotelVendor_hotelId_idx" ON "HotelVendor"("hotelId");

-- CreateIndex
CREATE INDEX "HotelVendor_vendorId_idx" ON "HotelVendor"("vendorId");

-- CreateIndex
CREATE INDEX "HotelVendor_archived_idx" ON "HotelVendor"("archived");

-- CreateIndex
CREATE INDEX "HotelVendor_cancellationPolicyId_idx" ON "HotelVendor"("cancellationPolicyId");

-- CreateIndex
CREATE UNIQUE INDEX "HotelVendor_hotelId_vendorId_contractRef_key" ON "HotelVendor"("hotelId", "vendorId", "contractRef");

-- CreateIndex
CREATE INDEX "HotelRate_hotelId_validFrom_validTo_idx" ON "HotelRate"("hotelId", "validFrom", "validTo");

-- CreateIndex
CREATE INDEX "HotelRate_hotelVendorId_idx" ON "HotelRate"("hotelVendorId");

-- CreateIndex
CREATE INDEX "HotelRate_vendorId_idx" ON "HotelRate"("vendorId");

-- CreateIndex
CREATE INDEX "HotelRate_currencyCode_idx" ON "HotelRate"("currencyCode");

-- CreateIndex
CREATE INDEX "HotelRate_archived_idx" ON "HotelRate"("archived");

-- CreateIndex
CREATE INDEX "HotelRate_isPublished_idx" ON "HotelRate"("isPublished");

-- CreateIndex
CREATE UNIQUE INDEX "Activity_slug_key" ON "Activity"("slug");

-- CreateIndex
CREATE INDEX "Activity_destinationId_idx" ON "Activity"("destinationId");

-- CreateIndex
CREATE INDEX "Activity_archived_idx" ON "Activity"("archived");

-- CreateIndex
CREATE INDEX "Activity_category_idx" ON "Activity"("category");

-- CreateIndex
CREATE INDEX "Activity_searchText_trgm" ON "Activity" USING GIN ("searchText" gin_trgm_ops);

-- CreateIndex
CREATE INDEX "ActivityRate_activityId_validFrom_validTo_idx" ON "ActivityRate"("activityId", "validFrom", "validTo");

-- CreateIndex
CREATE INDEX "ActivityRate_vendorId_idx" ON "ActivityRate"("vendorId");

-- CreateIndex
CREATE INDEX "ActivityRate_currencyCode_idx" ON "ActivityRate"("currencyCode");

-- CreateIndex
CREATE INDEX "ActivityRate_archived_idx" ON "ActivityRate"("archived");

-- CreateIndex
CREATE INDEX "ActivityRate_isPublished_idx" ON "ActivityRate"("isPublished");

-- CreateIndex
CREATE INDEX "DayTemplateEvent_activityId_idx" ON "DayTemplateEvent"("activityId");

-- AddForeignKey
ALTER TABLE "DayTemplateEvent" ADD CONSTRAINT "DayTemplateEvent_activityId_fkey" FOREIGN KEY ("activityId") REFERENCES "Activity"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Vendor" ADD CONSTRAINT "Vendor_countryId_fkey" FOREIGN KEY ("countryId") REFERENCES "Country"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Vendor" ADD CONSTRAINT "Vendor_defaultCurrencyCode_fkey" FOREIGN KEY ("defaultCurrencyCode") REFERENCES "Currency"("code") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HotelVendor" ADD CONSTRAINT "HotelVendor_hotelId_fkey" FOREIGN KEY ("hotelId") REFERENCES "Hotel"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HotelVendor" ADD CONSTRAINT "HotelVendor_vendorId_fkey" FOREIGN KEY ("vendorId") REFERENCES "Vendor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HotelVendor" ADD CONSTRAINT "HotelVendor_cancellationPolicyId_fkey" FOREIGN KEY ("cancellationPolicyId") REFERENCES "CancellationPolicy"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HotelRate" ADD CONSTRAINT "HotelRate_hotelId_fkey" FOREIGN KEY ("hotelId") REFERENCES "Hotel"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HotelRate" ADD CONSTRAINT "HotelRate_hotelVendorId_fkey" FOREIGN KEY ("hotelVendorId") REFERENCES "HotelVendor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HotelRate" ADD CONSTRAINT "HotelRate_vendorId_fkey" FOREIGN KEY ("vendorId") REFERENCES "Vendor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HotelRate" ADD CONSTRAINT "HotelRate_currencyCode_fkey" FOREIGN KEY ("currencyCode") REFERENCES "Currency"("code") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Activity" ADD CONSTRAINT "Activity_destinationId_fkey" FOREIGN KEY ("destinationId") REFERENCES "Destination"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ActivityRate" ADD CONSTRAINT "ActivityRate_activityId_fkey" FOREIGN KEY ("activityId") REFERENCES "Activity"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ActivityRate" ADD CONSTRAINT "ActivityRate_vendorId_fkey" FOREIGN KEY ("vendorId") REFERENCES "Vendor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ActivityRate" ADD CONSTRAINT "ActivityRate_currencyCode_fkey" FOREIGN KEY ("currencyCode") REFERENCES "Currency"("code") ON DELETE RESTRICT ON UPDATE CASCADE;
