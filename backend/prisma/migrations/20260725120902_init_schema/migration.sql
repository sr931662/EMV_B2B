-- CreateEnum
CREATE TYPE "Role" AS ENUM ('admin', 'data_feeder', 'partner');

-- CreateEnum
CREATE TYPE "Branding" AS ENUM ('EMV', 'OWN');

-- CreateEnum
CREATE TYPE "QuoteStatus" AS ENUM ('QUOTE_GENERATED', 'CUSTOMER_APPROVED', 'PAYMENT_SUBMITTED', 'PENDING_VERIFICATION', 'BOOKING_CONFIRMED', 'ORDER_COMPLETED', 'REJECTED');

-- CreateEnum
CREATE TYPE "PaymentType" AS ENUM ('PACKAGE', 'VISA');

-- CreateEnum
CREATE TYPE "PaymentStatus" AS ENUM ('PENDING_VERIFICATION', 'APPROVED', 'REJECTED', 'INFO_REQUESTED');

-- CreateEnum
CREATE TYPE "VisaRequestStatus" AS ENUM ('APPLICATION_SUBMITTED', 'PAYMENT_SUBMITTED', 'PENDING_VERIFICATION', 'PAYMENT_APPROVED', 'VISA_PROCESSING_STARTED', 'COMPLETED', 'REJECTED');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "role" "Role" NOT NULL,
    "isVerified" BOOLEAN NOT NULL DEFAULT false,
    "otpCode" TEXT,
    "otpExpiresAt" TIMESTAMP(3),
    "archived" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PartnerProfile" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "companyName" TEXT NOT NULL,
    "companyLogo" TEXT,
    "ownerName" TEXT NOT NULL,
    "gstNumber" TEXT,
    "panNumber" TEXT,
    "businessEmail" TEXT NOT NULL,
    "mobile" TEXT NOT NULL,
    "officeAddress" TEXT NOT NULL,
    "city" TEXT NOT NULL,
    "state" TEXT NOT NULL,
    "country" TEXT NOT NULL,
    "pincode" TEXT NOT NULL,
    "website" TEXT,
    "archived" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PartnerProfile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Destination" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "archived" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Destination_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DayTemplate" (
    "id" TEXT NOT NULL,
    "destinationId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "archived" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DayTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Hotel" (
    "id" TEXT NOT NULL,
    "destinationId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "images" TEXT[],
    "archived" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Hotel_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Package" (
    "id" TEXT NOT NULL,
    "destinationId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "days" INTEGER NOT NULL,
    "nights" INTEGER NOT NULL,
    "rawPrice" DECIMAL(12,2) NOT NULL,
    "inclusions" TEXT NOT NULL,
    "exclusions" TEXT NOT NULL,
    "gallery" TEXT[],
    "tags" TEXT[],
    "emvQuotePdfPath" TEXT,
    "archived" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Package_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PackageDay" (
    "id" TEXT NOT NULL,
    "packageId" TEXT NOT NULL,
    "dayNumber" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "archived" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PackageDay_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PackageHotel" (
    "id" TEXT NOT NULL,
    "packageId" TEXT NOT NULL,
    "hotelName" TEXT NOT NULL,
    "hotelCategory" TEXT NOT NULL,
    "hotelDescription" TEXT NOT NULL,
    "archived" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PackageHotel_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Quote" (
    "id" TEXT NOT NULL,
    "packageId" TEXT NOT NULL,
    "partnerId" TEXT NOT NULL,
    "leadName" TEXT NOT NULL,
    "contactNumber" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "travelDate" DATE NOT NULL,
    "adults" INTEGER NOT NULL,
    "children" INTEGER NOT NULL DEFAULT 0,
    "infants" INTEGER NOT NULL DEFAULT 0,
    "specialRequests" TEXT,
    "markupAmount" DECIMAL(12,2) NOT NULL,
    "sellingPrice" DECIMAL(12,2) NOT NULL,
    "branding" "Branding" NOT NULL,
    "pdfPath" TEXT,
    "status" "QuoteStatus" NOT NULL DEFAULT 'QUOTE_GENERATED',
    "archived" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Quote_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Payment" (
    "id" TEXT NOT NULL,
    "type" "PaymentType" NOT NULL,
    "quoteId" TEXT,
    "visaRequestId" TEXT,
    "transactionId" TEXT NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "screenshotPath" TEXT NOT NULL,
    "notes" TEXT,
    "status" "PaymentStatus" NOT NULL DEFAULT 'PENDING_VERIFICATION',
    "adminRemarks" TEXT,
    "verifiedById" TEXT,
    "archived" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Payment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VisaCountry" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "archived" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "VisaCountry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VisaRequiredDocument" (
    "id" TEXT NOT NULL,
    "visaCountryId" TEXT NOT NULL,
    "documentName" TEXT NOT NULL,
    "isMandatory" BOOLEAN NOT NULL DEFAULT true,
    "archived" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "VisaRequiredDocument_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VisaRequest" (
    "id" TEXT NOT NULL,
    "partnerId" TEXT NOT NULL,
    "visaCountryId" TEXT NOT NULL,
    "applicationNumber" TEXT NOT NULL,
    "status" "VisaRequestStatus" NOT NULL DEFAULT 'APPLICATION_SUBMITTED',
    "archived" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "VisaRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VisaPassenger" (
    "id" TEXT NOT NULL,
    "visaRequestId" TEXT NOT NULL,
    "fullName" TEXT NOT NULL,
    "gender" TEXT NOT NULL,
    "dob" DATE NOT NULL,
    "nationality" TEXT NOT NULL,
    "passportNumber" TEXT NOT NULL,
    "passportExpiry" DATE NOT NULL,
    "travelDate" DATE NOT NULL,
    "returnDate" DATE NOT NULL,
    "archived" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "VisaPassenger_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VisaDocumentUpload" (
    "id" TEXT NOT NULL,
    "visaPassengerId" TEXT NOT NULL,
    "documentName" TEXT NOT NULL,
    "filePath" TEXT NOT NULL,
    "archived" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "VisaDocumentUpload_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Notification" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "isRead" BOOLEAN NOT NULL DEFAULT false,
    "archived" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Notification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EmailTemplate" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "archived" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EmailTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE INDEX "User_role_idx" ON "User"("role");

-- CreateIndex
CREATE INDEX "User_archived_idx" ON "User"("archived");

-- CreateIndex
CREATE UNIQUE INDEX "PartnerProfile_userId_key" ON "PartnerProfile"("userId");

-- CreateIndex
CREATE INDEX "PartnerProfile_archived_idx" ON "PartnerProfile"("archived");

-- CreateIndex
CREATE UNIQUE INDEX "Destination_name_key" ON "Destination"("name");

-- CreateIndex
CREATE INDEX "Destination_archived_idx" ON "Destination"("archived");

-- CreateIndex
CREATE INDEX "DayTemplate_destinationId_idx" ON "DayTemplate"("destinationId");

-- CreateIndex
CREATE INDEX "DayTemplate_archived_idx" ON "DayTemplate"("archived");

-- CreateIndex
CREATE INDEX "Hotel_destinationId_idx" ON "Hotel"("destinationId");

-- CreateIndex
CREATE INDEX "Hotel_archived_idx" ON "Hotel"("archived");

-- CreateIndex
CREATE INDEX "Package_destinationId_idx" ON "Package"("destinationId");

-- CreateIndex
CREATE INDEX "Package_archived_idx" ON "Package"("archived");

-- CreateIndex
CREATE INDEX "PackageDay_packageId_idx" ON "PackageDay"("packageId");

-- CreateIndex
CREATE INDEX "PackageDay_archived_idx" ON "PackageDay"("archived");

-- CreateIndex
CREATE INDEX "PackageHotel_packageId_idx" ON "PackageHotel"("packageId");

-- CreateIndex
CREATE INDEX "PackageHotel_archived_idx" ON "PackageHotel"("archived");

-- CreateIndex
CREATE INDEX "Quote_packageId_idx" ON "Quote"("packageId");

-- CreateIndex
CREATE INDEX "Quote_partnerId_idx" ON "Quote"("partnerId");

-- CreateIndex
CREATE INDEX "Quote_status_idx" ON "Quote"("status");

-- CreateIndex
CREATE INDEX "Quote_archived_idx" ON "Quote"("archived");

-- CreateIndex
CREATE INDEX "Payment_quoteId_idx" ON "Payment"("quoteId");

-- CreateIndex
CREATE INDEX "Payment_visaRequestId_idx" ON "Payment"("visaRequestId");

-- CreateIndex
CREATE INDEX "Payment_verifiedById_idx" ON "Payment"("verifiedById");

-- CreateIndex
CREATE INDEX "Payment_type_idx" ON "Payment"("type");

-- CreateIndex
CREATE INDEX "Payment_status_idx" ON "Payment"("status");

-- CreateIndex
CREATE INDEX "Payment_archived_idx" ON "Payment"("archived");

-- CreateIndex
CREATE UNIQUE INDEX "VisaCountry_name_key" ON "VisaCountry"("name");

-- CreateIndex
CREATE INDEX "VisaCountry_archived_idx" ON "VisaCountry"("archived");

-- CreateIndex
CREATE INDEX "VisaRequiredDocument_visaCountryId_idx" ON "VisaRequiredDocument"("visaCountryId");

-- CreateIndex
CREATE INDEX "VisaRequiredDocument_archived_idx" ON "VisaRequiredDocument"("archived");

-- CreateIndex
CREATE UNIQUE INDEX "VisaRequest_applicationNumber_key" ON "VisaRequest"("applicationNumber");

-- CreateIndex
CREATE INDEX "VisaRequest_partnerId_idx" ON "VisaRequest"("partnerId");

-- CreateIndex
CREATE INDEX "VisaRequest_visaCountryId_idx" ON "VisaRequest"("visaCountryId");

-- CreateIndex
CREATE INDEX "VisaRequest_status_idx" ON "VisaRequest"("status");

-- CreateIndex
CREATE INDEX "VisaRequest_archived_idx" ON "VisaRequest"("archived");

-- CreateIndex
CREATE INDEX "VisaPassenger_visaRequestId_idx" ON "VisaPassenger"("visaRequestId");

-- CreateIndex
CREATE INDEX "VisaPassenger_archived_idx" ON "VisaPassenger"("archived");

-- CreateIndex
CREATE INDEX "VisaDocumentUpload_visaPassengerId_idx" ON "VisaDocumentUpload"("visaPassengerId");

-- CreateIndex
CREATE INDEX "VisaDocumentUpload_archived_idx" ON "VisaDocumentUpload"("archived");

-- CreateIndex
CREATE INDEX "Notification_userId_idx" ON "Notification"("userId");

-- CreateIndex
CREATE INDEX "Notification_isRead_idx" ON "Notification"("isRead");

-- CreateIndex
CREATE INDEX "Notification_archived_idx" ON "Notification"("archived");

-- CreateIndex
CREATE UNIQUE INDEX "EmailTemplate_name_key" ON "EmailTemplate"("name");

-- CreateIndex
CREATE INDEX "EmailTemplate_archived_idx" ON "EmailTemplate"("archived");

-- AddForeignKey
ALTER TABLE "PartnerProfile" ADD CONSTRAINT "PartnerProfile_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DayTemplate" ADD CONSTRAINT "DayTemplate_destinationId_fkey" FOREIGN KEY ("destinationId") REFERENCES "Destination"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Hotel" ADD CONSTRAINT "Hotel_destinationId_fkey" FOREIGN KEY ("destinationId") REFERENCES "Destination"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Package" ADD CONSTRAINT "Package_destinationId_fkey" FOREIGN KEY ("destinationId") REFERENCES "Destination"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PackageDay" ADD CONSTRAINT "PackageDay_packageId_fkey" FOREIGN KEY ("packageId") REFERENCES "Package"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PackageHotel" ADD CONSTRAINT "PackageHotel_packageId_fkey" FOREIGN KEY ("packageId") REFERENCES "Package"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Quote" ADD CONSTRAINT "Quote_packageId_fkey" FOREIGN KEY ("packageId") REFERENCES "Package"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Quote" ADD CONSTRAINT "Quote_partnerId_fkey" FOREIGN KEY ("partnerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_quoteId_fkey" FOREIGN KEY ("quoteId") REFERENCES "Quote"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_visaRequestId_fkey" FOREIGN KEY ("visaRequestId") REFERENCES "VisaRequest"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_verifiedById_fkey" FOREIGN KEY ("verifiedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VisaRequiredDocument" ADD CONSTRAINT "VisaRequiredDocument_visaCountryId_fkey" FOREIGN KEY ("visaCountryId") REFERENCES "VisaCountry"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VisaRequest" ADD CONSTRAINT "VisaRequest_partnerId_fkey" FOREIGN KEY ("partnerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VisaRequest" ADD CONSTRAINT "VisaRequest_visaCountryId_fkey" FOREIGN KEY ("visaCountryId") REFERENCES "VisaCountry"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VisaPassenger" ADD CONSTRAINT "VisaPassenger_visaRequestId_fkey" FOREIGN KEY ("visaRequestId") REFERENCES "VisaRequest"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VisaDocumentUpload" ADD CONSTRAINT "VisaDocumentUpload_visaPassengerId_fkey" FOREIGN KEY ("visaPassengerId") REFERENCES "VisaPassenger"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
