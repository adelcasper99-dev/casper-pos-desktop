-- Migration: add_tenant_branch_sync_fields
-- Adds branchId and syncSecret to the DRM Tenant model.
-- syncSecret is a crypto-random hex string generated at row creation.
-- Both fields are nullable to allow safe backfill of existing rows.

ALTER TABLE "Tenant"
  ADD COLUMN IF NOT EXISTS "branchId"   TEXT,
  ADD COLUMN IF NOT EXISTS "syncSecret" TEXT;

-- Backfill existing rows: use id as branchId, generate random secret
UPDATE "Tenant"
  SET "branchId"   = "id"
WHERE "branchId" IS NULL;

UPDATE "Tenant"
  SET "syncSecret" = encode(gen_random_bytes(32), 'hex')
WHERE "syncSecret" IS NULL;
