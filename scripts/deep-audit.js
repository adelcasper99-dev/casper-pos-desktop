const { PrismaClient } = require('@prisma/client');
const path = require('path');
const os = require('os');
const fs = require('fs');

const dbPath = path.join(os.homedir(), 'AppData', 'Roaming', 'casper-pos-desktop', 'local.db');
process.env.DATABASE_URL = `file:${dbPath.replace(/\\/g, '/')}`;

const prisma = new PrismaClient();

async function deepAudit() {
    console.log('--- DEEP DATABASE AUDIT ---');
    
    // 1. Get all tables in the DB
    const tables = await prisma.$queryRawUnsafe(`SELECT name FROM sqlite_master WHERE type='table'`);
    const dbTables = tables.map(t => t.name);
    console.log(`Found ${dbTables.length} tables in local.db`);

    // 2. Audit specific critical tables for drift
    const auditMap = {
        'Product': ['isDevice', 'deviceType', 'condition', 'color'],
        'PurchaseInvoice': ['isWalkin', 'walkinName', 'walkinPhone', 'walkinNationalId', 'attachmentUrl', 'voidReason', 'branchId', 'voidedAt', 'voidedBy', 'isReturn', 'parentId'],
        'PurchaseItem': ['imei', 'condition', 'color', 'deviceType', 'returnedQty'],
        'Sale': ['warrantyDays', 'warrantyExpiryDate', 'customerId', 'tableId', 'tableName', 'userId', 'syncStatus', 'offlineFlag', 'discountPercentage', 'previousStatus', 'isReturn', 'parentId', 'branchId', 'relatedSupplierId'],
        'SaleItem': ['imei', 'condition', 'color', 'deviceType'],
        'Transaction': ['categoryId', 'idempotencyKey'],
        'Ticket': ['finalCustomerPrice', 'techBillingPrice', 'partCostPrice', 'laborPoolAmount', 'techCommissionAmount', 'centerLaborProfit', 'centerPartProfit', 'commissionClawback', 'lastReturnedAt', 'originalTechId', 'returnCount', 'returnReason', 'rejectionReason', 'rejectedAt', 'clientSupplierId', 'clientUserId', 'parentTicketId', 'barcode', 'customerId', 'lossResponsibility', 'excessLossAmount'],
        'User': ['salary', 'monthlyOffDays', 'hireDate', 'maxDiscount', 'maxDiscountAmount', 'isFrozen'],
        'Technician': ['defaultPriceTier', 'deletedAt', 'lossRate'],
        'Warehouse': ['type', 'isMaintenanceDefault'],
        'Branch': ['isMaintenanceHQ'],
        'CashCategory': ['id', 'name', 'type', 'isSystem', 'glCode', 'isActive'],
        'SalePayment': ['id', 'saleId', 'method', 'amount', 'reference']
    };

    let allOk = true;
    for (const [table, columns] of Object.entries(auditMap)) {
        if (!dbTables.includes(table)) {
            console.error(`[CRITICAL] Missing Table: ${table}`);
            allOk = false;
            continue;
        }

        const info = await prisma.$queryRawUnsafe(`PRAGMA table_info("${table}")`);
        const dbCols = info.map(i => i.name);
        
        const missing = columns.filter(c => !dbCols.includes(c));
        if (missing.length > 0) {
            console.error(`[MISSING] Table ${table} lacks: ${missing.join(', ')}`);
            allOk = false;
        } else {
            console.log(`[OK] Table ${table} has all audited columns.`);
        }
    }

    if (allOk) {
        console.log('\n--- AUDIT STATUS: 100% ALIGNED ---');
    } else {
        console.log('\n--- AUDIT STATUS: GAPS DETECTED ---');
    }

    await prisma.$disconnect();
}

deepAudit();
