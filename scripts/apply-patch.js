const { PrismaClient } = require('@prisma/client');
const path = require('path');
const os = require('os');

const dbPath = path.join(os.homedir(), 'AppData', 'Roaming', 'casper-pos-desktop', 'local.db');
process.env.DATABASE_URL = `file:${dbPath.replace(/\\/g, '/')}`;

const prisma = new PrismaClient();

const statements = [
    // Product
    'ALTER TABLE "Product" ADD COLUMN "isDevice" BOOLEAN NOT NULL DEFAULT false',
    'ALTER TABLE "Product" ADD COLUMN "deviceType" TEXT',
    'ALTER TABLE "Product" ADD COLUMN "condition" TEXT',
    'ALTER TABLE "Product" ADD COLUMN "color" TEXT',

    // PurchaseItem
    'ALTER TABLE "PurchaseItem" ADD COLUMN "imei" TEXT',
    'ALTER TABLE "PurchaseItem" ADD COLUMN "condition" TEXT',
    'ALTER TABLE "PurchaseItem" ADD COLUMN "color" TEXT',
    'ALTER TABLE "PurchaseItem" ADD COLUMN "deviceType" TEXT',
    'ALTER TABLE "PurchaseItem" ADD COLUMN "returnedQty" INTEGER NOT NULL DEFAULT 0',

    // SaleItem
    'ALTER TABLE "SaleItem" ADD COLUMN "imei" TEXT',
    'ALTER TABLE "SaleItem" ADD COLUMN "condition" TEXT',
    'ALTER TABLE "SaleItem" ADD COLUMN "color" TEXT',
    'ALTER TABLE "SaleItem" ADD COLUMN "deviceType" TEXT',

    // PurchaseInvoice
    'ALTER TABLE "PurchaseInvoice" ADD COLUMN "isWalkin" BOOLEAN NOT NULL DEFAULT false',
    'ALTER TABLE "PurchaseInvoice" ADD COLUMN "walkinName" TEXT',
    'ALTER TABLE "PurchaseInvoice" ADD COLUMN "walkinPhone" TEXT',
    'ALTER TABLE "PurchaseInvoice" ADD COLUMN "walkinNationalId" TEXT',
    'ALTER TABLE "PurchaseInvoice" ADD COLUMN "attachmentUrl" TEXT',
    'ALTER TABLE "PurchaseInvoice" ADD COLUMN "voidReason" TEXT',
    'ALTER TABLE "PurchaseInvoice" ADD COLUMN "voidedAt" DATETIME',
    'ALTER TABLE "PurchaseInvoice" ADD COLUMN "voidedBy" TEXT',
    'ALTER TABLE "PurchaseInvoice" ADD COLUMN "isReturn" BOOLEAN NOT NULL DEFAULT false',
    'ALTER TABLE "PurchaseInvoice" ADD COLUMN "parentId" TEXT',
    'ALTER TABLE "PurchaseInvoice" ADD COLUMN "branchId" TEXT',

    // Transaction
    'ALTER TABLE "Transaction" ADD COLUMN "categoryId" TEXT',
    'ALTER TABLE "Transaction" ADD COLUMN "idempotencyKey" TEXT',

    // Sale
    'ALTER TABLE "Sale" ADD COLUMN "warrantyDays" INTEGER',
    'ALTER TABLE "Sale" ADD COLUMN "warrantyExpiryDate" DATETIME',
    'ALTER TABLE "Sale" ADD COLUMN "customerId" TEXT',
    'ALTER TABLE "Sale" ADD COLUMN "tableId" TEXT',
    'ALTER TABLE "Sale" ADD COLUMN "tableName" TEXT',
    'ALTER TABLE "Sale" ADD COLUMN "userId" TEXT',
    'ALTER TABLE "Sale" ADD COLUMN "syncStatus" TEXT NOT NULL DEFAULT "PENDING"',
    'ALTER TABLE "Sale" ADD COLUMN "offlineFlag" BOOLEAN NOT NULL DEFAULT false',
    'ALTER TABLE "Sale" ADD COLUMN "discountPercentage" DECIMAL DEFAULT 0.00',
    'ALTER TABLE "Sale" ADD COLUMN "previousStatus" TEXT',
    'ALTER TABLE "Sale" ADD COLUMN "isReturn" BOOLEAN NOT NULL DEFAULT false',
    'ALTER TABLE "Sale" ADD COLUMN "parentId" TEXT',
    'ALTER TABLE "Sale" ADD COLUMN "branchId" TEXT',
    'ALTER TABLE "Sale" ADD COLUMN "relatedSupplierId" TEXT',

    // Ticket
    'ALTER TABLE "Ticket" ADD COLUMN "finalCustomerPrice" DECIMAL NOT NULL DEFAULT 0.00',
    'ALTER TABLE "Ticket" ADD COLUMN "techBillingPrice" DECIMAL NOT NULL DEFAULT 0.00',
    'ALTER TABLE "Ticket" ADD COLUMN "partCostPrice" DECIMAL NOT NULL DEFAULT 0.00',
    'ALTER TABLE "Ticket" ADD COLUMN "laborPoolAmount" DECIMAL NOT NULL DEFAULT 0.00',
    'ALTER TABLE "Ticket" ADD COLUMN "techCommissionAmount" DECIMAL NOT NULL DEFAULT 0.00',
    'ALTER TABLE "Ticket" ADD COLUMN "centerLaborProfit" DECIMAL NOT NULL DEFAULT 0.00',
    'ALTER TABLE "Ticket" ADD COLUMN "centerPartProfit" DECIMAL NOT NULL DEFAULT 0.00',
    'ALTER TABLE "Ticket" ADD COLUMN "commissionClawback" DECIMAL NOT NULL DEFAULT 0.00',
    'ALTER TABLE "Ticket" ADD COLUMN "lastReturnedAt" DATETIME',
    'ALTER TABLE "Ticket" ADD COLUMN "originalTechId" TEXT',
    'ALTER TABLE "Ticket" ADD COLUMN "returnCount" INTEGER NOT NULL DEFAULT 0',
    'ALTER TABLE "Ticket" ADD COLUMN "returnReason" TEXT',
    'ALTER TABLE "Ticket" ADD COLUMN "rejectionReason" TEXT',
    'ALTER TABLE "Ticket" ADD COLUMN "rejectedAt" DATETIME',
    'ALTER TABLE "Ticket" ADD COLUMN "clientSupplierId" TEXT',
    'ALTER TABLE "Ticket" ADD COLUMN "clientUserId" TEXT',
    'ALTER TABLE "Ticket" ADD COLUMN "parentTicketId" TEXT',
    'ALTER TABLE "Ticket" ADD COLUMN "barcode" TEXT',
    'ALTER TABLE "Ticket" ADD COLUMN "customerId" TEXT',
    'ALTER TABLE "Ticket" ADD COLUMN "lossResponsibility" TEXT',
    'ALTER TABLE "Ticket" ADD COLUMN "excessLossAmount" DECIMAL NOT NULL DEFAULT 0.00',

    // User
    'ALTER TABLE "User" ADD COLUMN "salary" DECIMAL DEFAULT 0.00',
    'ALTER TABLE "User" ADD COLUMN "monthlyOffDays" INTEGER DEFAULT 4',
    'ALTER TABLE "User" ADD COLUMN "hireDate" DATETIME',
    'ALTER TABLE "User" ADD COLUMN "maxDiscount" DECIMAL DEFAULT 0.00',
    'ALTER TABLE "User" ADD COLUMN "maxDiscountAmount" DECIMAL DEFAULT 0.00',
    'ALTER TABLE "User" ADD COLUMN "isFrozen" BOOLEAN NOT NULL DEFAULT false',

    // Technician
    'ALTER TABLE "Technician" ADD COLUMN "defaultPriceTier" TEXT NOT NULL DEFAULT "COST"',
    'ALTER TABLE "Technician" ADD COLUMN "deletedAt" DATETIME',
    'ALTER TABLE "Technician" ADD COLUMN "lossRate" DECIMAL NOT NULL DEFAULT 70.00',

    // Warehouse & Branch
    'ALTER TABLE "Warehouse" ADD COLUMN "type" TEXT NOT NULL DEFAULT "SELLABLE"',
    'ALTER TABLE "Warehouse" ADD COLUMN "isMaintenanceDefault" BOOLEAN NOT NULL DEFAULT false',
    'ALTER TABLE "Branch" ADD COLUMN "isMaintenanceHQ" BOOLEAN NOT NULL DEFAULT false',

    // New Tables (safe because of IF NOT EXISTS)
    'CREATE TABLE IF NOT EXISTS "CashCategory" ("id" TEXT NOT NULL PRIMARY KEY, "name" TEXT NOT NULL, "type" TEXT NOT NULL, "isSystem" BOOLEAN NOT NULL DEFAULT false, "glCode" TEXT, "isActive" BOOLEAN NOT NULL DEFAULT true, "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP)',
    'CREATE UNIQUE INDEX IF NOT EXISTS "CashCategory_name_key" ON "CashCategory"("name")',
    'CREATE TABLE IF NOT EXISTS "SalePayment" ("id" TEXT NOT NULL PRIMARY KEY, "saleId" TEXT NOT NULL, "method" TEXT NOT NULL, "amount" DECIMAL NOT NULL, "reference" TEXT, CONSTRAINT "SalePayment_saleId_fkey" FOREIGN KEY ("saleId") REFERENCES "Sale" ("id") ON DELETE RESTRICT ON UPDATE CASCADE)',
    'CREATE INDEX IF NOT EXISTS "SalePayment_saleId_idx" ON "SalePayment"("saleId")'
];

async function run() {
    console.log(`Starting patch on ${dbPath}...`);
    for (const sql of statements) {
        try {
            await prisma.$executeRawUnsafe(sql);
            console.log(`OK:   ${sql.substring(0, 50)}...`);
        } catch (e) {
            if (e.message.includes('duplicate column') || e.message.includes('already exists')) {
                console.log(`SKIP: ${sql.substring(0, 50)}...`);
            } else {
                console.log(`FAIL: ${sql.substring(0, 50)}... Error: ${e.message}`);
            }
        }
    }
    
    // Register the migration so Prisma doesn't try to run it again
    try {
        const migrationName = '20260407000000_add_device_fields';
        const checksum = 'manual-patch-' + Date.now();
        await prisma.$executeRawUnsafe(`
            INSERT OR IGNORE INTO "_prisma_migrations" 
            (id, checksum, finished_at, migration_name, logs, rolled_back_at, started_at, applied_steps_count) 
            VALUES (lower(hex(randomblob(16))), '${checksum}', CURRENT_TIMESTAMP, '${migrationName}', NULL, NULL, CURRENT_TIMESTAMP, 1)
        `);
        console.log(`Registered migration ${migrationName} in _prisma_migrations`);
    } catch (e) {
        console.log(`Migration registry skip/fail: ${e.message}`);
    }

    await prisma.$disconnect();
    console.log('Patch complete.');
}

run();
