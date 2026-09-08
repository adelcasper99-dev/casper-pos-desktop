const { PrismaClient } = require('@prisma/client');

async function syncSchema() {
    const prisma = new PrismaClient();
    try {
        console.log('--- Checking & patching StoreSettings columns ---');
        await prisma.$executeRawUnsafe(`
            ALTER TABLE "StoreSettings" 
            ADD COLUMN IF NOT EXISTS "allowNegativeCash" BOOLEAN NOT NULL DEFAULT false,
            ADD COLUMN IF NOT EXISTS "allowNegativeStock" BOOLEAN NOT NULL DEFAULT false,
            ADD COLUMN IF NOT EXISTS "googleDriveBackupPath" TEXT,
            ADD COLUMN IF NOT EXISTS "blindCloseEnabled" BOOLEAN NOT NULL DEFAULT true,
            ADD COLUMN IF NOT EXISTS "locationLat" DOUBLE PRECISION NOT NULL DEFAULT 24.7136,
            ADD COLUMN IF NOT EXISTS "locationLng" DOUBLE PRECISION NOT NULL DEFAULT 46.6753,
            ADD COLUMN IF NOT EXISTS "locationRadius" INTEGER NOT NULL DEFAULT 500,
            ADD COLUMN IF NOT EXISTS "labelTemplate" TEXT,
            ADD COLUMN IF NOT EXISTS "licenseJwt" TEXT,
            ADD COLUMN IF NOT EXISTS "licenseKey" TEXT,
            ADD COLUMN IF NOT EXISTS "lastServerNow" DOUBLE PRECISION,
            ADD COLUMN IF NOT EXISTS "localUptimeTicks" DOUBLE PRECISION,
            ADD COLUMN IF NOT EXISTS "trialStartDate" TIMESTAMP(3);
        `);
        console.log('✅ StoreSettings table columns synchronized.');

        console.log('--- Checking & patching Product device columns ---');
        await prisma.$executeRawUnsafe(`
            ALTER TABLE "Product"
            ADD COLUMN IF NOT EXISTS "isDevice" BOOLEAN NOT NULL DEFAULT false,
            ADD COLUMN IF NOT EXISTS "deviceType" TEXT,
            ADD COLUMN IF NOT EXISTS "condition" TEXT,
            ADD COLUMN IF NOT EXISTS "color" TEXT;
        `);
        console.log('✅ Product device columns synchronized.');

        console.log('--- Checking & patching PurchaseItem columns ---');
        await prisma.$executeRawUnsafe(`
            ALTER TABLE "PurchaseItem"
            ADD COLUMN IF NOT EXISTS "imei" TEXT,
            ADD COLUMN IF NOT EXISTS "condition" TEXT,
            ADD COLUMN IF NOT EXISTS "color" TEXT,
            ADD COLUMN IF NOT EXISTS "deviceType" TEXT,
            ADD COLUMN IF NOT EXISTS "returnedQty" INTEGER NOT NULL DEFAULT 0;
        `);
        console.log('✅ PurchaseItem columns synchronized.');

        console.log('--- Checking & patching SaleItem columns ---');
        await prisma.$executeRawUnsafe(`
            ALTER TABLE "SaleItem"
            ADD COLUMN IF NOT EXISTS "imei" TEXT,
            ADD COLUMN IF NOT EXISTS "condition" TEXT,
            ADD COLUMN IF NOT EXISTS "color" TEXT,
            ADD COLUMN IF NOT EXISTS "deviceType" TEXT;
        `);
        console.log('✅ SaleItem columns synchronized.');

        console.log('--- Checking & patching Shift columns ---');
        await prisma.$executeRawUnsafe(`
            ALTER TABLE "Shift"
            ADD COLUMN IF NOT EXISTS "lastHeartbeat" TIMESTAMP(3),
            ADD COLUMN IF NOT EXISTS "cashBreakdown" TEXT,
            ADD COLUMN IF NOT EXISTS "cardTerminalSettlement" DECIMAL(65,30),
            ADD COLUMN IF NOT EXISTS "cardVariance" DECIMAL(65,30);
        `);
        console.log('✅ Shift columns synchronized.');

        console.log('--- Checking & patching User columns ---');
        await prisma.$executeRawUnsafe(`
            ALTER TABLE "User"
            ADD COLUMN IF NOT EXISTS "isFrozen" BOOLEAN NOT NULL DEFAULT false,
            ADD COLUMN IF NOT EXISTS "isGlobalAdmin" BOOLEAN NOT NULL DEFAULT false,
            ADD COLUMN IF NOT EXISTS "managedHQIds" TEXT,
            ADD COLUMN IF NOT EXISTS "maxDiscount" DECIMAL(65,30) DEFAULT 0.00,
            ADD COLUMN IF NOT EXISTS "maxDiscountAmount" DECIMAL(65,30) DEFAULT 0.00,
            ADD COLUMN IF NOT EXISTS "salary" DECIMAL(65,30) DEFAULT 0.00,
            ADD COLUMN IF NOT EXISTS "monthlyOffDays" INTEGER DEFAULT 4,
            ADD COLUMN IF NOT EXISTS "hireDate" TIMESTAMP(3);
        `);
        console.log('✅ User columns synchronized.');

        console.log('🚀 All PostgreSQL schema adjustments completed successfully!');
    } catch (error) {
        console.error('❌ Migration error:', error);
    } finally {
        await prisma.$disconnect();
    }
}

syncSchema();
