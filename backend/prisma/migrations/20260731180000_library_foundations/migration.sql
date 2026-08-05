-- Phase 2 of the Library MDM migration: foundations.
--
-- Nothing here is a business concept. It is the plumbing every later phase stands on:
--   * LookupItem   one table for the vocabularies that are genuinely the same shape
--   * Currency     so no price anywhere has to assume INR
--   * AuditLog     ERP-wide, not Library-only
--   * EntityLink   one mechanism for attaching reusable content to any parent
--   * searchText   a maintained haystack column on the entities pickers search
--
-- Purely additive: new tables, new nullable/defaulted columns, new indexes. No existing column is
-- altered or dropped, so running code is unaffected until it opts in.


-- CreateEnum
CREATE TYPE "LookupType" AS ENUM ('TRIP_TYPE', 'PACKAGE_CATEGORY', 'INCLUSION', 'EXCLUSION', 'AMENITY', 'ROOM_TYPE', 'MEAL_PLAN', 'ACTIVITY_CATEGORY');
-- CreateEnum
CREATE TYPE "AuditAction" AS ENUM ('CREATE', 'UPDATE', 'ARCHIVE', 'RESTORE', 'DELETE');
-- AlterTable
ALTER TABLE "Destination" ADD COLUMN     "searchText" TEXT NOT NULL DEFAULT '';
-- AlterTable
ALTER TABLE "Hotel" ADD COLUMN     "searchText" TEXT NOT NULL DEFAULT '';
-- AlterTable
ALTER TABLE "VisaCountry" ADD COLUMN     "searchText" TEXT NOT NULL DEFAULT '';
-- CreateTable
CREATE TABLE "LookupItem" (
    "id" TEXT NOT NULL,
    "type" "LookupType" NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "description" TEXT,
    "icon" TEXT,
    "imageUrl" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "searchText" TEXT NOT NULL DEFAULT '',
    "archived" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "LookupItem_pkey" PRIMARY KEY ("id")
);
-- CreateTable
CREATE TABLE "Currency" (
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "symbol" TEXT NOT NULL,
    "decimalDigits" INTEGER NOT NULL DEFAULT 2,
    "isBaseCurrency" BOOLEAN NOT NULL DEFAULT false,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "archived" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Currency_pkey" PRIMARY KEY ("code")
);
-- CreateTable
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "action" "AuditAction" NOT NULL,
    "changedFields" TEXT[],
    "before" JSONB,
    "after" JSONB,
    "reason" TEXT,
    "actorId" TEXT,
    "actorEmail" TEXT,
    "actorRole" TEXT,
    "actorIp" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);
-- CreateTable
CREATE TABLE "EntityLink" (
    "id" TEXT NOT NULL,
    "itemType" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "ownerType" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'default',
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "archived" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "EntityLink_pkey" PRIMARY KEY ("id")
);
-- CreateIndex
CREATE INDEX "LookupItem_type_archived_idx" ON "LookupItem"("type", "archived");
-- CreateIndex
CREATE INDEX "LookupItem_sortOrder_idx" ON "LookupItem"("sortOrder");
-- CreateIndex
CREATE UNIQUE INDEX "LookupItem_type_slug_key" ON "LookupItem"("type", "slug");
-- CreateIndex
CREATE INDEX "Currency_archived_idx" ON "Currency"("archived");
-- CreateIndex
CREATE INDEX "AuditLog_entityType_entityId_idx" ON "AuditLog"("entityType", "entityId");
-- CreateIndex
CREATE INDEX "AuditLog_actorId_idx" ON "AuditLog"("actorId");
-- CreateIndex
CREATE INDEX "AuditLog_createdAt_idx" ON "AuditLog"("createdAt");
-- CreateIndex
CREATE INDEX "AuditLog_action_idx" ON "AuditLog"("action");
-- CreateIndex
CREATE INDEX "EntityLink_ownerType_ownerId_role_idx" ON "EntityLink"("ownerType", "ownerId", "role");
-- CreateIndex
CREATE INDEX "EntityLink_itemType_itemId_idx" ON "EntityLink"("itemType", "itemId");
-- CreateIndex
CREATE INDEX "EntityLink_archived_idx" ON "EntityLink"("archived");
-- CreateIndex
CREATE UNIQUE INDEX "EntityLink_itemType_itemId_ownerType_ownerId_role_key" ON "EntityLink"("itemType", "itemId", "ownerType", "ownerId", "role");


-- ---------------------------------------------------------------------------
-- Trigram search
-- ---------------------------------------------------------------------------
--
-- Every picker in the UI is a search box, so search is not a feature of the Library, it is how the
-- Library is used. ILIKE '%term%' cannot use a btree index and degrades on exactly the tables that
-- grow. pg_trgm indexes the substrings instead, which makes partial words and typos both fast:
-- "hilto", "tokyo hil" and "Hilton" all hit the same row.
--
-- Chosen over Postgres full-text search because tsvector tokenises on word boundaries and stems -
-- it is built for prose, and a hotel name is not prose. Chosen over Elasticsearch because at this
-- data volume Postgres beats the network hop, and it removes a service to run, secure and sync.
CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE INDEX IF NOT EXISTS "LookupItem_searchText_trgm"  ON "LookupItem"  USING GIN ("searchText" gin_trgm_ops);
CREATE INDEX IF NOT EXISTS "Hotel_searchText_trgm"       ON "Hotel"       USING GIN ("searchText" gin_trgm_ops);
CREATE INDEX IF NOT EXISTS "Destination_searchText_trgm" ON "Destination" USING GIN ("searchText" gin_trgm_ops);
CREATE INDEX IF NOT EXISTS "VisaCountry_searchText_trgm" ON "VisaCountry" USING GIN ("searchText" gin_trgm_ops);

-- Backfill the haystack for rows that existed before the column did. Kept deliberately in step
-- with buildSearchText() in src/utils/searchText.js - same fields, same lower/trim.
UPDATE "Hotel"
SET "searchText" = LOWER(TRIM(CONCAT_WS(' ', "name", "category", "address", "roomType")))
WHERE "searchText" = '';

UPDATE "Destination"
SET "searchText" = LOWER(TRIM(CONCAT_WS(' ', "name", "shortName")))
WHERE "searchText" = '';

UPDATE "VisaCountry"
SET "searchText" = LOWER(TRIM(CONCAT_WS(' ', "name", "shortName")))
WHERE "searchText" = '';

-- ---------------------------------------------------------------------------
-- Seed: currencies
-- ---------------------------------------------------------------------------
--
-- INR is the base because that is what the business sells in today, and reports have to total in
-- something. It is a row, not a constant, so changing it later is an UPDATE.
--
-- JPY carries decimalDigits = 0 on purpose: rounding yen to two places invents money that does not
-- exist, and it is the standard case that catches a hardcoded scale.
INSERT INTO "Currency" ("code", "name", "symbol", "decimalDigits", "isBaseCurrency", "sortOrder", "createdAt", "updatedAt")
VALUES
  ('INR', 'Indian Rupee',        '₹', 2, true,  0, NOW(), NOW()),
  ('USD', 'US Dollar',           '$',      2, false, 1, NOW(), NOW()),
  ('EUR', 'Euro',                '€', 2, false, 2, NOW(), NOW()),
  ('GBP', 'Pound Sterling',      '£', 2, false, 3, NOW(), NOW()),
  ('AED', 'UAE Dirham',          'AED',    2, false, 4, NOW(), NOW()),
  ('SGD', 'Singapore Dollar',    'S$',     2, false, 5, NOW(), NOW()),
  ('THB', 'Thai Baht',           '฿', 2, false, 6, NOW(), NOW()),
  ('IDR', 'Indonesian Rupiah',   'Rp',     2, false, 7, NOW(), NOW()),
  ('JPY', 'Japanese Yen',        '¥', 0, false, 8, NOW(), NOW()),
  ('AUD', 'Australian Dollar',   'A$',     2, false, 9, NOW(), NOW())
ON CONFLICT ("code") DO NOTHING;

-- ---------------------------------------------------------------------------
-- Seed: starter vocabularies
-- ---------------------------------------------------------------------------
--
-- Seeded rather than hardcoded, which is the whole point - an admin renames or removes any of these
-- without a deploy. These are only a starting set so the pickers are not empty on day one.
INSERT INTO "LookupItem" ("id", "type", "name", "slug", "sortOrder", "searchText", "archived", "createdAt", "updatedAt")
VALUES
  (gen_random_uuid(), 'TRIP_TYPE', 'Luxury',           'luxury',            0,  'luxury',            false, NOW(), NOW()),
  (gen_random_uuid(), 'TRIP_TYPE', 'Budget',           'budget',            1,  'budget',            false, NOW(), NOW()),
  (gen_random_uuid(), 'TRIP_TYPE', 'Honeymoon',        'honeymoon',         2,  'honeymoon',         false, NOW(), NOW()),
  (gen_random_uuid(), 'TRIP_TYPE', 'Adventure',        'adventure',         3,  'adventure',         false, NOW(), NOW()),
  (gen_random_uuid(), 'TRIP_TYPE', 'Family',           'family',            4,  'family',            false, NOW(), NOW()),
  (gen_random_uuid(), 'TRIP_TYPE', 'Corporate',        'corporate',         5,  'corporate',         false, NOW(), NOW()),
  (gen_random_uuid(), 'TRIP_TYPE', 'Pilgrimage',       'pilgrimage',        6,  'pilgrimage',        false, NOW(), NOW()),
  (gen_random_uuid(), 'TRIP_TYPE', 'Wildlife',         'wildlife',          7,  'wildlife',          false, NOW(), NOW()),
  (gen_random_uuid(), 'TRIP_TYPE', 'Cruise',           'cruise',            8,  'cruise',            false, NOW(), NOW()),
  (gen_random_uuid(), 'TRIP_TYPE', 'Weekend',          'weekend',           9,  'weekend',           false, NOW(), NOW()),
  (gen_random_uuid(), 'TRIP_TYPE', 'Solo',             'solo',              10, 'solo',              false, NOW(), NOW()),
  (gen_random_uuid(), 'TRIP_TYPE', 'Group Tour',       'group-tour',        11, 'group tour',        false, NOW(), NOW()),

  (gen_random_uuid(), 'PACKAGE_CATEGORY', 'Domestic',        'domestic',        0, 'domestic',        false, NOW(), NOW()),
  (gen_random_uuid(), 'PACKAGE_CATEGORY', 'International',   'international',   1, 'international',   false, NOW(), NOW()),
  (gen_random_uuid(), 'PACKAGE_CATEGORY', 'Land Package',    'land-package',    2, 'land package',    false, NOW(), NOW()),
  (gen_random_uuid(), 'PACKAGE_CATEGORY', 'Flight + Hotel',  'flight-hotel',    3, 'flight hotel',    false, NOW(), NOW()),
  (gen_random_uuid(), 'PACKAGE_CATEGORY', 'Visa Only',       'visa-only',       4, 'visa only',       false, NOW(), NOW()),
  (gen_random_uuid(), 'PACKAGE_CATEGORY', 'Customized',      'customized',      5, 'customized',      false, NOW(), NOW()),

  (gen_random_uuid(), 'INCLUSION', 'Breakfast',        'breakfast',        0, 'breakfast',        false, NOW(), NOW()),
  (gen_random_uuid(), 'INCLUSION', 'Airport Pickup',   'airport-pickup',   1, 'airport pickup',   false, NOW(), NOW()),
  (gen_random_uuid(), 'INCLUSION', 'Airport Drop',     'airport-drop',     2, 'airport drop',     false, NOW(), NOW()),
  (gen_random_uuid(), 'INCLUSION', 'Sightseeing',      'sightseeing',      3, 'sightseeing',      false, NOW(), NOW()),
  (gen_random_uuid(), 'INCLUSION', 'Guide',            'guide',            4, 'guide',            false, NOW(), NOW()),
  (gen_random_uuid(), 'INCLUSION', 'Transfers',        'transfers',        5, 'transfers',        false, NOW(), NOW()),
  (gen_random_uuid(), 'INCLUSION', 'Travel Insurance', 'travel-insurance', 6, 'travel insurance', false, NOW(), NOW()),

  (gen_random_uuid(), 'EXCLUSION', 'Personal Expenses', 'personal-expenses', 0, 'personal expenses', false, NOW(), NOW()),
  (gen_random_uuid(), 'EXCLUSION', 'Tips',              'tips',              1, 'tips',              false, NOW(), NOW()),
  (gen_random_uuid(), 'EXCLUSION', 'Visa Fees',         'visa-fees',         2, 'visa fees',         false, NOW(), NOW()),
  (gen_random_uuid(), 'EXCLUSION', 'Meals',             'meals',             3, 'meals',             false, NOW(), NOW()),

  (gen_random_uuid(), 'MEAL_PLAN', 'Room Only',            'room-only',  0, 'room only ep',              false, NOW(), NOW()),
  (gen_random_uuid(), 'MEAL_PLAN', 'Breakfast Only',       'cp',         1, 'breakfast only cp',         false, NOW(), NOW()),
  (gen_random_uuid(), 'MEAL_PLAN', 'Half Board',           'map',        2, 'half board map',            false, NOW(), NOW()),
  (gen_random_uuid(), 'MEAL_PLAN', 'Full Board',           'ap',         3, 'full board ap',             false, NOW(), NOW()),
  (gen_random_uuid(), 'MEAL_PLAN', 'All Inclusive',        'ai',         4, 'all inclusive ai',          false, NOW(), NOW()),

  (gen_random_uuid(), 'ROOM_TYPE', 'Standard',   'standard',   0, 'standard',   false, NOW(), NOW()),
  (gen_random_uuid(), 'ROOM_TYPE', 'Deluxe',     'deluxe',     1, 'deluxe',     false, NOW(), NOW()),
  (gen_random_uuid(), 'ROOM_TYPE', 'Suite',      'suite',      2, 'suite',      false, NOW(), NOW()),
  (gen_random_uuid(), 'ROOM_TYPE', 'Villa',      'villa',      3, 'villa',      false, NOW(), NOW()),

  (gen_random_uuid(), 'AMENITY', 'Wi-Fi',         'wifi',          0, 'wifi wi-fi',    false, NOW(), NOW()),
  (gen_random_uuid(), 'AMENITY', 'Swimming Pool', 'swimming-pool', 1, 'swimming pool', false, NOW(), NOW()),
  (gen_random_uuid(), 'AMENITY', 'Spa',           'spa',           2, 'spa',           false, NOW(), NOW()),
  (gen_random_uuid(), 'AMENITY', 'Gym',           'gym',           3, 'gym',           false, NOW(), NOW()),
  (gen_random_uuid(), 'AMENITY', 'Airport Shuttle', 'airport-shuttle', 4, 'airport shuttle', false, NOW(), NOW()),

  (gen_random_uuid(), 'ACTIVITY_CATEGORY', 'Sightseeing',   'sightseeing-act', 0, 'sightseeing',   false, NOW(), NOW()),
  (gen_random_uuid(), 'ACTIVITY_CATEGORY', 'Water Sports',  'water-sports',    1, 'water sports',  false, NOW(), NOW()),
  (gen_random_uuid(), 'ACTIVITY_CATEGORY', 'Adventure',     'adventure-act',   2, 'adventure',     false, NOW(), NOW()),
  (gen_random_uuid(), 'ACTIVITY_CATEGORY', 'Cultural',      'cultural',        3, 'cultural',      false, NOW(), NOW()),
  (gen_random_uuid(), 'ACTIVITY_CATEGORY', 'Theme Park',    'theme-park',      4, 'theme park',    false, NOW(), NOW())
ON CONFLICT ("type", "slug") DO NOTHING;
