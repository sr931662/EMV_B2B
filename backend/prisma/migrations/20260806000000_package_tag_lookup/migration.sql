-- Adds PACKAGE_TAG to LookupType so package tags are governed the same way as every other
-- vocabulary (Trip types, Inclusions, Exclusions, ...) instead of being a hardcoded suggestion
-- list with free-typed, ungoverned strings on the Package row.
--
-- ALTER TYPE ... ADD VALUE cannot run in the same transaction as a statement that USES the new
-- value, so this migration only adds the value. Seeding the existing hardcoded suggestions as
-- LookupItem rows is a follow-up data script, not a schema change.
ALTER TYPE "LookupType" ADD VALUE 'PACKAGE_TAG';
