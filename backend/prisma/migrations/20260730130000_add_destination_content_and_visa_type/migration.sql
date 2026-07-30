-- CreateEnum
CREATE TYPE "VisaType" AS ENUM ('REGULAR', 'E_VISA');

-- AlterTable
ALTER TABLE "Destination" ADD COLUMN     "aboutDestination" TEXT,
ADD COLUMN     "faqs" TEXT,
ADD COLUMN     "packages" TEXT;

-- AlterTable
ALTER TABLE "VisaRequest" ADD COLUMN     "evisaDocumentPath" TEXT,
ADD COLUMN     "visaType" "VisaType" NOT NULL DEFAULT 'REGULAR';
