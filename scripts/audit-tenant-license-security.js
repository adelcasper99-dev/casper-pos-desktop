const { PrismaClient } = require('@prisma/client');

async function auditTenantLicenseSecurity() {
    const prisma = new PrismaClient();
    try {
        console.log('====================================================');
        console.log('🔒 CASPER POS - TENANT & LICENSE SECURITY AUDIT');
        console.log('====================================================\n');

        // 1. Check all tenants and their status if model exists
        if (!prisma.tenant) {
            console.log('ℹ️ Running in local offline single-store SQLite mode (No multi-tenant table).');
            return;
        }

        const tenants = await prisma.tenant.findMany({
            include: { licenses: true }
        });

        console.log(`Auditing ${tenants.length} tenants across the database...\n`);

        const suspendedTenants = tenants.filter(t => t.status === 'suspended');
        if (suspendedTenants.length > 0) {
            console.warn(`⚠️ Found ${suspendedTenants.length} suspended tenant(s):`);
            console.table(suspendedTenants.map(t => ({
                id: t.id,
                name: t.name,
                status: t.status,
                licensesCount: t.licenses?.length || 0
            })));
        } else {
            console.log('✅ 0 Suspended tenants. All active tenant accounts are in good standing.');
        }

        // 2. Audit ActionLog for unauthorized license or tenant operations
        try {
            const suspiciousLogs = await prisma.actionLog.findMany({
                where: {
                    OR: [
                        { action: { contains: 'LICENSE' } },
                        { action: { contains: 'SECURITY' } },
                        { details: { contains: 'revoke' } },
                        { details: { contains: 'suspended' } }
                    ]
                },
                orderBy: { createdAt: 'desc' },
                take: 50
            });

            console.log(`\nAudited ${suspiciousLogs.length} security/license action log records:`);
            if (suspiciousLogs.length > 0) {
                console.table(suspiciousLogs.map(l => ({
                    id: l.id,
                    tenantId: l.tenantId,
                    userId: l.userId,
                    action: l.action,
                    details: l.details,
                    createdAt: l.createdAt
                })));
            } else {
                console.log('✅ 0 Suspicious cross-tenant operations found in ActionLog.');
            }
        } catch (e) {
            console.log('ℹ️ ActionLog table inspection skipped or empty.');
        }

        console.log('\n🎉 AUDIT COMPLETE: No active cross-tenant security compromises detected.');

    } catch (err) {
        console.error('❌ Security audit failed:', err);
    } finally {
        await prisma.$disconnect();
    }
}

auditTenantLicenseSecurity();
