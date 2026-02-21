-- Migration: schema_drift (SQLite-compatible)
-- Adds all columns and tables introduced after the initial migration (Feb 19 2026)
-- SQLite does not support IF NOT EXISTS on ALTER TABLE, so each column add is a separate statement.
-- Prisma will only run this once (it tracks migration history in _prisma_migrations).

-- ============================================================
-- Role table (new)
-- ============================================================
CREATE TABLE "Role" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "permissions" TEXT NOT NULL DEFAULT '[]'
);
CREATE UNIQUE INDEX "Role_name_key" ON "Role"("name");

-- ============================================================
-- AuditLog table (new)
-- ============================================================
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "newData" TEXT,
    "previousData" TEXT,
    "reason" TEXT,
    "user" TEXT,
    "branchId" TEXT,
    "hqId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX "AuditLog_entityType_entityId_idx" ON "AuditLog"("entityType", "entityId");
CREATE INDEX "AuditLog_createdAt_idx" ON "AuditLog"("createdAt");

-- ============================================================
-- BackupLog table (new)
-- ============================================================
CREATE TABLE "BackupLog" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "filename" TEXT NOT NULL,
    "filePath" TEXT NOT NULL,
    "fileSize" REAL NOT NULL,
    "checksum" TEXT,
    "compressed" BOOLEAN NOT NULL DEFAULT false,
    "encrypted" BOOLEAN NOT NULL DEFAULT false,
    "uploadStatus" TEXT NOT NULL DEFAULT 'PENDING',
    "createdBy" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "driveFileId" TEXT
);

-- ============================================================
-- Branch — new columns
-- ============================================================
ALTER TABLE "Branch" ADD COLUMN "parentBranchId" TEXT REFERENCES "Branch"("id");
ALTER TABLE "Branch" ADD COLUMN "region" TEXT;
ALTER TABLE "Branch" ADD COLUMN "sortOrder" INTEGER DEFAULT 0;
ALTER TABLE "Branch" ADD COLUMN "territoryCode" TEXT;

-- ============================================================
-- User — new columns
-- ============================================================
ALTER TABLE "User" ADD COLUMN "isGlobalAdmin" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "User" ADD COLUMN "managedHQIds" TEXT;
ALTER TABLE "User" ADD COLUMN "roleId" TEXT REFERENCES "Role"("id");

-- ============================================================
-- Treasury — new column
-- ============================================================
ALTER TABLE "Treasury" ADD COLUMN "paymentMethod" TEXT;

-- ============================================================
-- SaleItem — new column
-- ============================================================
ALTER TABLE "SaleItem" ADD COLUMN "refundedQty" INTEGER NOT NULL DEFAULT 0;

-- ============================================================
-- New indexes
-- ============================================================
CREATE INDEX "Sale_shiftId_idx" ON "Sale"("shiftId");
CREATE INDEX "Sale_customerId_idx" ON "Sale"("customerId");
CREATE INDEX "Sale_status_createdAt_idx" ON "Sale"("status", "createdAt");
CREATE INDEX "SaleItem_saleId_idx" ON "SaleItem"("saleId");
CREATE INDEX "Transaction_treasuryId_createdAt_idx" ON "Transaction"("treasuryId", "createdAt");
CREATE INDEX "SupplierPayment_supplierId_idx" ON "SupplierPayment"("supplierId");
CREATE INDEX "ShiftAdjustment_shiftId_idx" ON "ShiftAdjustment"("shiftId");
