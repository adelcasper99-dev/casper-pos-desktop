-- Migration: add_device_fields_and_missing_drift (SQLite-compatible)
-- This migration covers all fields that were missing from production databases
-- due to schema drift from previous development.

-- 1. Product Table
ALTER TABLE "Product" ADD COLUMN "isDevice" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Product" ADD COLUMN "deviceType" TEXT;
ALTER TABLE "Product" ADD COLUMN "condition" TEXT;
ALTER TABLE "Product" ADD COLUMN "color" TEXT;

-- 2. PurchaseItem Table
ALTER TABLE "PurchaseItem" ADD COLUMN "imei" TEXT;
ALTER TABLE "PurchaseItem" ADD COLUMN "condition" TEXT;
ALTER TABLE "PurchaseItem" ADD COLUMN "color" TEXT;
ALTER TABLE "PurchaseItem" ADD COLUMN "deviceType" TEXT;
-- redundant: ALTER TABLE "PurchaseItem" ADD COLUMN "returnedQty" INTEGER NOT NULL DEFAULT 0;

-- 3. SaleItem Table
ALTER TABLE "SaleItem" ADD COLUMN "imei" TEXT;
ALTER TABLE "SaleItem" ADD COLUMN "condition" TEXT;
ALTER TABLE "SaleItem" ADD COLUMN "color" TEXT;
ALTER TABLE "SaleItem" ADD COLUMN "deviceType" TEXT;

-- 4. PurchaseInvoice Table
ALTER TABLE "PurchaseInvoice" ADD COLUMN "isWalkin" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "PurchaseInvoice" ADD COLUMN "walkinName" TEXT;
ALTER TABLE "PurchaseInvoice" ADD COLUMN "walkinPhone" TEXT;
ALTER TABLE "PurchaseInvoice" ADD COLUMN "walkinNationalId" TEXT;
ALTER TABLE "PurchaseInvoice" ADD COLUMN "attachmentUrl" TEXT;
-- redundant: ALTER TABLE "PurchaseInvoice" ADD COLUMN "voidReason" TEXT;
-- redundant: ALTER TABLE "PurchaseInvoice" ADD COLUMN "voidedAt" DATETIME;
-- redundant: ALTER TABLE "PurchaseInvoice" ADD COLUMN "voidedBy" TEXT;
-- redundant: ALTER TABLE "PurchaseInvoice" ADD COLUMN "isReturn" BOOLEAN NOT NULL DEFAULT false;
-- redundant: ALTER TABLE "PurchaseInvoice" ADD COLUMN "parentId" TEXT;
-- redundant: ALTER TABLE "PurchaseInvoice" ADD COLUMN "branchId" TEXT;

-- 5. Transaction Table
ALTER TABLE "Transaction" ADD COLUMN "categoryId" TEXT;
ALTER TABLE "Transaction" ADD COLUMN "idempotencyKey" TEXT;

-- 6. Sale Table
-- redundant: ALTER TABLE "Sale" ADD COLUMN "warrantyDays" INTEGER;
-- redundant: ALTER TABLE "Sale" ADD COLUMN "warrantyExpiryDate" DATETIME;
-- redundant: ALTER TABLE "Sale" ADD COLUMN "customerId" TEXT;
-- redundant: ALTER TABLE "Sale" ADD COLUMN "tableId" TEXT;
-- redundant: ALTER TABLE "Sale" ADD COLUMN "tableName" TEXT;
-- redundant: ALTER TABLE "Sale" ADD COLUMN "userId" TEXT;
-- redundant: ALTER TABLE "Sale" ADD COLUMN "syncStatus" TEXT NOT NULL DEFAULT "PENDING";
-- redundant: ALTER TABLE "Sale" ADD COLUMN "offlineFlag" BOOLEAN NOT NULL DEFAULT false;
-- redundant: ALTER TABLE "Sale" ADD COLUMN "discountPercentage" DECIMAL DEFAULT 0.00;
-- redundant: ALTER TABLE "Sale" ADD COLUMN "previousStatus" TEXT;
-- redundant: ALTER TABLE "Sale" ADD COLUMN "isReturn" BOOLEAN NOT NULL DEFAULT false;
-- redundant: ALTER TABLE "Sale" ADD COLUMN "parentId" TEXT;
-- redundant: ALTER TABLE "Sale" ADD COLUMN "branchId" TEXT;
-- redundant: ALTER TABLE "Sale" ADD COLUMN "relatedSupplierId" TEXT;

-- 7. Ticket Table (Schema Drift Supplement)
-- redundant: ALTER TABLE "Ticket" ADD COLUMN "finalCustomerPrice" DECIMAL NOT NULL DEFAULT 0.00;
-- redundant: ALTER TABLE "Ticket" ADD COLUMN "techBillingPrice" DECIMAL NOT NULL DEFAULT 0.00;
-- redundant: ALTER TABLE "Ticket" ADD COLUMN "partCostPrice" DECIMAL NOT NULL DEFAULT 0.00;
-- redundant: ALTER TABLE "Ticket" ADD COLUMN "laborPoolAmount" DECIMAL NOT NULL DEFAULT 0.00;
-- redundant: ALTER TABLE "Ticket" ADD COLUMN "techCommissionAmount" DECIMAL NOT NULL DEFAULT 0.00;
-- redundant: ALTER TABLE "Ticket" ADD COLUMN "centerLaborProfit" DECIMAL NOT NULL DEFAULT 0.00;
-- redundant: ALTER TABLE "Ticket" ADD COLUMN "centerPartProfit" DECIMAL NOT NULL DEFAULT 0.00;
-- redundant: ALTER TABLE "Ticket" ADD COLUMN "commissionClawback" DECIMAL NOT NULL DEFAULT 0.00;
-- redundant: ALTER TABLE "Ticket" ADD COLUMN "lastReturnedAt" DATETIME;
-- redundant: ALTER TABLE "Ticket" ADD COLUMN "originalTechId" TEXT;
-- redundant: ALTER TABLE "Ticket" ADD COLUMN "returnCount" INTEGER NOT NULL DEFAULT 0;
-- redundant: ALTER TABLE "Ticket" ADD COLUMN "returnReason" TEXT;
-- redundant: ALTER TABLE "Ticket" ADD COLUMN "rejectionReason" TEXT;
-- redundant: ALTER TABLE "Ticket" ADD COLUMN "rejectedAt" DATETIME;
-- redundant: ALTER TABLE "Ticket" ADD COLUMN "clientSupplierId" TEXT;
-- redundant: ALTER TABLE "Ticket" ADD COLUMN "clientUserId" TEXT;
-- redundant: ALTER TABLE "Ticket" ADD COLUMN "parentTicketId" TEXT;
-- redundant: ALTER TABLE "Ticket" ADD COLUMN "barcode" TEXT;
-- redundant: ALTER TABLE "Ticket" ADD COLUMN "customerId" TEXT;

-- 8. User Table
-- redundant: ALTER TABLE "User" ADD COLUMN "salary" DECIMAL DEFAULT 0.00;
-- redundant: ALTER TABLE "User" ADD COLUMN "monthlyOffDays" INTEGER DEFAULT 4;
-- redundant: ALTER TABLE "User" ADD COLUMN "hireDate" DATETIME;
-- redundant: ALTER TABLE "User" ADD COLUMN "maxDiscount" DECIMAL DEFAULT 0.00;
-- redundant: ALTER TABLE "User" ADD COLUMN "maxDiscountAmount" DECIMAL DEFAULT 0.00;
-- redundant: ALTER TABLE "User" ADD COLUMN "isFrozen" BOOLEAN NOT NULL DEFAULT false;

-- 9. Technician Table
-- redundant: ALTER TABLE "Technician" ADD COLUMN "defaultPriceTier" TEXT NOT NULL DEFAULT "COST";
-- redundant: ALTER TABLE "Technician" ADD COLUMN "deletedAt" DATETIME;

-- 10. Warehouse & Branch
-- redundant: ALTER TABLE "Warehouse" ADD COLUMN "type" TEXT NOT NULL DEFAULT "SELLABLE";
-- redundant: ALTER TABLE "Warehouse" ADD COLUMN "isMaintenanceDefault" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Branch" ADD COLUMN "isMaintenanceHQ" BOOLEAN NOT NULL DEFAULT false;

-- 11. New Tables
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

CREATE TABLE IF NOT EXISTS "SalePayment" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "saleId" TEXT NOT NULL,
    "method" TEXT NOT NULL,
    "amount" DECIMAL NOT NULL,
    "reference" TEXT,
    CONSTRAINT "SalePayment_saleId_fkey" FOREIGN KEY ("saleId") REFERENCES "Sale" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE INDEX IF NOT EXISTS "SalePayment_saleId_idx" ON "SalePayment"("saleId");
