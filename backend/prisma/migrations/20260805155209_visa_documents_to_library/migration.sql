-- AlterTable
ALTER TABLE "VisaDocumentUpload" ADD COLUMN     "documentTypeId" TEXT;

-- AlterTable
ALTER TABLE "VisaRequestRequiredDoc" ADD COLUMN     "documentTypeId" TEXT;

-- CreateIndex
CREATE INDEX "VisaDocumentUpload_documentTypeId_idx" ON "VisaDocumentUpload"("documentTypeId");

-- CreateIndex
CREATE INDEX "VisaRequestRequiredDoc_documentTypeId_idx" ON "VisaRequestRequiredDoc"("documentTypeId");

-- AddForeignKey
ALTER TABLE "VisaRequestRequiredDoc" ADD CONSTRAINT "VisaRequestRequiredDoc_documentTypeId_fkey" FOREIGN KEY ("documentTypeId") REFERENCES "DocumentType"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VisaDocumentUpload" ADD CONSTRAINT "VisaDocumentUpload_documentTypeId_fkey" FOREIGN KEY ("documentTypeId") REFERENCES "DocumentType"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ---------------------------------------------------------------------------
-- BACKFILL — tie existing checklist snapshots and uploaded files to a document type
--
-- Both tables have only ever carried a free-text `documentName`, matched to the product checklist
-- by string comparison. That is the same fragility Phase 3 removed between destinations and visa
-- countries: reword the checklist and every file already uploaded against it silently orphans.
--
-- Matched case-insensitively on the name, which is exactly what the application was doing at read
-- time. Done once here, in a transaction that can be inspected, rather than on every request.
--
-- Names are NOT rewritten. `documentName` is what the partner was told to produce (locked rule 2),
-- and a migration has no business editing that.
-- ---------------------------------------------------------------------------

UPDATE "VisaRequestRequiredDoc" d
SET "documentTypeId" = t."id"
FROM "DocumentType" t
WHERE d."documentTypeId" IS NULL
  AND lower(trim(d."documentName")) = lower(t."name");

UPDATE "VisaDocumentUpload" u
SET "documentTypeId" = t."id"
FROM "DocumentType" t
WHERE u."documentTypeId" IS NULL
  AND lower(trim(u."documentName")) = lower(t."name");

-- No verification block here, unlike the earlier phases. An unmatched row is EXPECTED and must not
-- abort: a request raised months ago may name a document the library has since renamed, and there
-- is no honest way to guess which type that was. Those rows keep working exactly as they did — on
-- documentName alone — and an admin can link them from the visa screen.
