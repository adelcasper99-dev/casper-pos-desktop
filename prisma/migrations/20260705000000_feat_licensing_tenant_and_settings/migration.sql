-- Migration: feat_licensing_tenant_and_settings
-- Adds licenseJwt, lastServerNow, localUptimeTicks to StoreSettings
-- Creates new Tenant model for hardware-locked DRM

-- Add licensing fields to StoreSettings
ALTER TABLE "StoreSettings"
  ADD COLUMN IF NOT EXISTS "licenseJwt"       TEXT,
  ADD COLUMN IF NOT EXISTS "lastServerNow"    DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS "localUptimeTicks" DOUBLE PRECISION;

-- Create Tenant model
CREATE TABLE IF NOT EXISTS "Tenant" (
  "id"             TEXT NOT NULL DEFAULT gen_random_uuid()::text,
  "clientName"     TEXT,
  "planType"       TEXT NOT NULL DEFAULT 'trial',
  "status"         TEXT NOT NULL DEFAULT 'active',
  "trialEndsAt"    TIMESTAMP(3) NOT NULL,
  "machineId"      TEXT,
  "activationCode" TEXT,
  "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"      TIMESTAMP(3) NOT NULL,

  CONSTRAINT "Tenant_pkey" PRIMARY KEY ("id")
);

-- Unique constraint on activationCode
CREATE UNIQUE INDEX IF NOT EXISTS "Tenant_activationCode_key" ON "Tenant"("activationCode");
