-- Central record of every file stored in Cloudinary.
--
-- Purely additive: a new table only. The existing URL columns are untouched and keep working, so
-- nothing that already renders an image changes. The table records the one thing a URL cannot —
-- Cloudinary's public_id, which delete and replace both need.

-- CreateEnum
CREATE TYPE "MediaKind" AS ENUM ('IMAGE', 'VIDEO', 'RAW');

-- CreateEnum
CREATE TYPE "MediaVisibility" AS ENUM ('PUBLIC', 'AUTHENTICATED');

-- CreateTable
CREATE TABLE "MediaAsset" (
    "id" TEXT NOT NULL,
    "publicId" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "kind" "MediaKind" NOT NULL DEFAULT 'IMAGE',
    "visibility" "MediaVisibility" NOT NULL DEFAULT 'PUBLIC',
    "folder" TEXT NOT NULL,
    "format" TEXT,
    "bytes" INTEGER,
    "width" INTEGER,
    "height" INTEGER,
    "originalFilename" TEXT,
    "purpose" TEXT NOT NULL,
    "ownerType" TEXT,
    "ownerId" TEXT,
    "uploadedById" TEXT,
    "archived" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MediaAsset_pkey" PRIMARY KEY ("id")
);

-- publicId IS the file. Two rows pointing at one public_id would let deleting either of them
-- silently break the other.
CREATE UNIQUE INDEX "MediaAsset_publicId_key" ON "MediaAsset"("publicId");

CREATE INDEX "MediaAsset_purpose_idx" ON "MediaAsset"("purpose");
CREATE INDEX "MediaAsset_ownerType_ownerId_idx" ON "MediaAsset"("ownerType", "ownerId");
CREATE INDEX "MediaAsset_archived_idx" ON "MediaAsset"("archived");

-- No foreign key on ownerId on purpose: an asset is uploaded BEFORE the row it belongs to exists
-- (the cover image is chosen while the country is still being created), and it can point at any of
-- a dozen tables. Neither is expressible as a single FK.
