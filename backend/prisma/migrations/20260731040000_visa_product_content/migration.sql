-- Content for the visa product detail page: the country's about/arrival prose, per-product FAQs,
-- and the structured processing timeline.
--
-- Purely additive — every column is nullable and the new table starts empty, so nothing that is
-- already published changes appearance until an admin fills it in.

-- AlterTable: country-level prose. Shared by every product under the country, because what you
-- need at the border is a fact about the border, not about which visa you bought.
ALTER TABLE "VisaCountry" ADD COLUMN "aboutCountry" TEXT;
ALTER TABLE "VisaCountry" ADD COLUMN "arrivalInfo" TEXT;

-- AlterTable: FAQs are per product — the questions differ between an eVisa and a sticker visa for
-- the same country.
ALTER TABLE "VisaProduct" ADD COLUMN "faqs" TEXT;

-- CreateTable
CREATE TABLE "VisaProcessingStep" (
    "id" TEXT NOT NULL,
    "visaProductId" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "estimatedDays" INTEGER,
    "archived" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "VisaProcessingStep_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "VisaProcessingStep_visaProductId_idx" ON "VisaProcessingStep"("visaProductId");
CREATE INDEX "VisaProcessingStep_archived_idx" ON "VisaProcessingStep"("archived");

ALTER TABLE "VisaProcessingStep" ADD CONSTRAINT "VisaProcessingStep_visaProductId_fkey"
    FOREIGN KEY ("visaProductId") REFERENCES "VisaProduct"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
