-- CreateTable
CREATE TABLE "VisaRequestRequiredDoc" (
    "id" TEXT NOT NULL,
    "visaRequestId" TEXT NOT NULL,
    "documentName" TEXT NOT NULL,
    "isMandatory" BOOLEAN NOT NULL DEFAULT true,
    "archived" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "VisaRequestRequiredDoc_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "VisaRequestRequiredDoc_visaRequestId_idx" ON "VisaRequestRequiredDoc"("visaRequestId");

-- CreateIndex
CREATE INDEX "VisaRequestRequiredDoc_archived_idx" ON "VisaRequestRequiredDoc"("archived");

-- AddForeignKey
ALTER TABLE "VisaRequestRequiredDoc" ADD CONSTRAINT "VisaRequestRequiredDoc_visaRequestId_fkey" FOREIGN KEY ("visaRequestId") REFERENCES "VisaRequest"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Backfill: existing visa requests predate this table, so they have no snapshot at all. Best
-- effort for dev data — copy each request's country's CURRENT non-archived checklist in, which
-- is the closest available approximation of "the checklist as it stood when the request was
-- created" (no better source exists; the live checklist is all there ever was before this
-- migration). Requests whose country checklist is empty simply get zero snapshot rows, which
-- computeReadiness already treats as "nothing mandatory to satisfy".
INSERT INTO "VisaRequestRequiredDoc" ("id", "visaRequestId", "documentName", "isMandatory", "archived", "createdAt", "updatedAt")
SELECT gen_random_uuid(), vr."id", vrd."documentName", vrd."isMandatory", false, NOW(), NOW()
FROM "VisaRequest" vr
JOIN "VisaRequiredDocument" vrd ON vrd."visaCountryId" = vr."visaCountryId" AND vrd."archived" = false;
