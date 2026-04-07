-- Migration: add_device_fields
-- Adds device tracking columns to Product, PurchaseItem, SaleItem
-- Creates CashCategory table if not present
--
-- IMPORTANT: This migration uses a _prisma_migrations guard approach.
-- The ALTER TABLE statements below will silently fail on DBs that
-- already have the columns (error is swallowed by the Electron runner).
-- The CREATE TABLE IF NOT EXISTS is always safe.

-- Product: device fields
ALTER TABLE "Product" ADD COLUMN "isDevice" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Product" ADD COLUMN "deviceType" TEXT;
ALTER TABLE "Product" ADD COLUMN "condition" TEXT;
ALTER TABLE "Product" ADD COLUMN "color" TEXT;

-- PurchaseItem: device/IMEI fields
ALTER TABLE "PurchaseItem" ADD COLUMN "imei" TEXT;
ALTER TABLE "PurchaseItem" ADD COLUMN "condition" TEXT;
ALTER TABLE "PurchaseItem" ADD COLUMN "color" TEXT;
ALTER TABLE "PurchaseItem" ADD COLUMN "deviceType" TEXT;
ALTER TABLE "PurchaseItem" ADD COLUMN "returnedQty" INTEGER NOT NULL DEFAULT 0;

-- SaleItem: device/IMEI fields
ALTER TABLE "SaleItem" ADD COLUMN "imei" TEXT;
ALTER TABLE "SaleItem" ADD COLUMN "condition" TEXT;
ALTER TABLE "SaleItem" ADD COLUMN "color" TEXT;
ALTER TABLE "SaleItem" ADD COLUMN "deviceType" TEXT;

-- CashCategory: create if absent (idempotent)
CREATE TABLE IF NOT EXISTS "CashCategory" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "isSystem" BOOLEAN NOT NULL DEFAULT false,
    "glCode" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX IF NOT EXISTS "CashCategory_name_key" ON "CashCategory"("name");
