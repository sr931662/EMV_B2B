-- Phase 2 of the itinerary: the travel a package PLANS, the travel a trip actually BOOKED, and
-- the insurance policy covering it.
--
-- Purely additive: new tables start empty and the one new column is nullable, so nothing that is
-- already published changes until an admin fills it in.
--
-- The plan/actuals split is the point. A package is sold for hundreds of departures, so a real
-- flight number on the template would be right for one booking and wrong for the rest.


-- CreateEnum
CREATE TYPE "TransportMode" AS ENUM ('FLIGHT', 'TRAIN', 'BUS', 'FERRY', 'CAR');
-- AlterTable
ALTER TABLE "Package" ADD COLUMN     "insuranceDetails" TEXT;
-- CreateTable
CREATE TABLE "PackageTransport" (
    "id" TEXT NOT NULL,
    "packageId" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "mode" "TransportMode" NOT NULL DEFAULT 'FLIGHT',
    "fromCity" TEXT NOT NULL,
    "toCity" TEXT NOT NULL,
    "dayNumber" INTEGER,
    "classOfService" TEXT,
    "notes" TEXT,
    "archived" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "PackageTransport_pkey" PRIMARY KEY ("id")
);
-- CreateTable
CREATE TABLE "QuoteTransport" (
    "id" TEXT NOT NULL,
    "quoteId" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "mode" "TransportMode" NOT NULL DEFAULT 'FLIGHT',
    "fromCity" TEXT NOT NULL,
    "toCity" TEXT NOT NULL,
    "operator" TEXT,
    "vehicleNumber" TEXT,
    "vehicleModel" TEXT,
    "departureAt" TIMESTAMP(3),
    "arrivalAt" TIMESTAMP(3),
    "boardingPoint" TEXT,
    "seatClass" TEXT,
    "fareType" TEXT,
    "baggageAllowance" TEXT,
    "bookingReference" TEXT,
    "notes" TEXT,
    "archived" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "QuoteTransport_pkey" PRIMARY KEY ("id")
);
-- CreateTable
CREATE TABLE "QuoteInsurance" (
    "id" TEXT NOT NULL,
    "quoteId" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "policyNumber" TEXT,
    "coverageAmount" DECIMAL(12,2),
    "validFrom" DATE,
    "validTo" DATE,
    "documentUrl" TEXT,
    "notes" TEXT,
    "archived" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "QuoteInsurance_pkey" PRIMARY KEY ("id")
);
-- CreateIndex
CREATE INDEX "PackageTransport_packageId_idx" ON "PackageTransport"("packageId");
-- CreateIndex
CREATE INDEX "PackageTransport_archived_idx" ON "PackageTransport"("archived");
-- CreateIndex
CREATE INDEX "QuoteTransport_quoteId_idx" ON "QuoteTransport"("quoteId");
-- CreateIndex
CREATE INDEX "QuoteTransport_archived_idx" ON "QuoteTransport"("archived");
-- CreateIndex
CREATE INDEX "QuoteInsurance_quoteId_idx" ON "QuoteInsurance"("quoteId");
-- CreateIndex
CREATE INDEX "QuoteInsurance_archived_idx" ON "QuoteInsurance"("archived");
-- AddForeignKey
ALTER TABLE "PackageTransport" ADD CONSTRAINT "PackageTransport_packageId_fkey" FOREIGN KEY ("packageId") REFERENCES "Package"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE "QuoteTransport" ADD CONSTRAINT "QuoteTransport_quoteId_fkey" FOREIGN KEY ("quoteId") REFERENCES "Quote"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE "QuoteInsurance" ADD CONSTRAINT "QuoteInsurance_quoteId_fkey" FOREIGN KEY ("quoteId") REFERENCES "Quote"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
