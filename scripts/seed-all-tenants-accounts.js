const { PrismaClient } = require('@prisma/client');

const ACCOUNT_TYPES = {
    ASSET: 'ASSET',
    LIABILITY: 'LIABILITY',
    EQUITY: 'EQUITY',
    REVENUE: 'REVENUE',
    EXPENSE: 'EXPENSE',
};

const DEFAULT_ACCOUNTS = [
    // Assets (1000-1999)
    { code: '1000', name: 'نقدية بالصندوق', type: ACCOUNT_TYPES.ASSET, isSystem: true },
    { code: '1010', name: 'تسويات البنوك / البطاقات', type: ACCOUNT_TYPES.ASSET, isSystem: true },
    { code: '1015', name: 'صندوق المصروفات النثرية', type: ACCOUNT_TYPES.ASSET, isSystem: false },
    { code: '1020', name: 'نقدية بالخزينة / المحفظة', type: ACCOUNT_TYPES.ASSET, isSystem: true },
    { code: '1100', name: 'العملاء / الذمم المدينة', type: ACCOUNT_TYPES.ASSET, isSystem: true },
    { code: '1200', name: 'المخزون', type: ACCOUNT_TYPES.ASSET, isSystem: true },
    { code: '1300', name: 'الأصول الثابتة (معدات وأثاث)',  type: ACCOUNT_TYPES.ASSET, isSystem: true },
    { code: '1310', name: 'مجمع الإهلاك',           type: ACCOUNT_TYPES.ASSET, isSystem: true },
    { code: '1350', name: 'عهدة الفنيين / ذمم مدينة',         type: ACCOUNT_TYPES.ASSET, isSystem: true },

    // Liabilities (2000-2999)
    { code: '2000', name: 'الموردين / الذمم الدائنة', type: ACCOUNT_TYPES.LIABILITY, isSystem: true },
    { code: '2100', name: 'ضريبة المبيعات المستحقة',       type: ACCOUNT_TYPES.LIABILITY, isSystem: true },
    { code: '2150', name: 'أرصدة دائنة للعملاء',  type: ACCOUNT_TYPES.LIABILITY, isSystem: true },
    { code: '2200', name: 'الرواتب والأجور المستحقة', type: ACCOUNT_TYPES.LIABILITY, isSystem: true },

    // Equity (3000-3999)
    { code: '3000', name: 'حقوق الملكية / رأس المال',                  type: ACCOUNT_TYPES.EQUITY, isSystem: true },
    { code: '3100', name: 'الأرباح المحتجزة (قديم)',            type: ACCOUNT_TYPES.EQUITY, isSystem: false },
    { code: '3200', name: 'مسحوبات الشركاء',                          type: ACCOUNT_TYPES.EQUITY, isSystem: true },
    { code: '3300', name: 'الأرباح المحتجزة / الأرباح المتراكمة',      type: ACCOUNT_TYPES.EQUITY, isSystem: true },
    { code: '3999', name: 'الأرصدة الافتتاحية لحقوق الملكية',                      type: ACCOUNT_TYPES.EQUITY, isSystem: true },

    // Revenue (4000-4999)
    { code: '4000', name: 'إيرادات المبيعات',    type: ACCOUNT_TYPES.REVENUE, isSystem: true },
    { code: '4100', name: 'إيرادات الخدمات',  type: ACCOUNT_TYPES.REVENUE, isSystem: true },
    { code: '4200', name: 'مردودات المبيعات',    type: ACCOUNT_TYPES.REVENUE, isSystem: true },
    { code: '4300', name: 'خصومات المبيعات',  type: ACCOUNT_TYPES.REVENUE, isSystem: true },
    { code: '4400', name: 'إيرادات أخرى',     type: ACCOUNT_TYPES.REVENUE, isSystem: true },
    { code: '4500', name: 'إيرادات عمولات المحافظ الإلكترونية', type: ACCOUNT_TYPES.REVENUE, isSystem: true },

    // Expenses (5000-5999)
    { code: '5000', name: 'تكلفة البضاعة المباعة',            type: ACCOUNT_TYPES.EXPENSE, isSystem: true },
    { code: '5100', name: 'مصروفات الرواتب والأجور',      type: ACCOUNT_TYPES.EXPENSE, isSystem: true },
    { code: '5110', name: 'مكافآت وحوافز',          type: ACCOUNT_TYPES.EXPENSE, isSystem: false },
    { code: '5120', name: 'يوميات وعمالة',                   type: ACCOUNT_TYPES.EXPENSE, isSystem: false },

    // ── 52xx: General & Administrative (Detailed)
    { code: '5200', name: 'مصروفات عمومية وإدارية',      type: ACCOUNT_TYPES.EXPENSE, isSystem: true },
    { code: '5210', name: 'مصروف الإيجار',                  type: ACCOUNT_TYPES.EXPENSE, isSystem: true },
    { code: '5220', name: 'مرافق (كهرباء ومياه)', type: ACCOUNT_TYPES.EXPENSE, isSystem: true },
    { code: '5230', name: 'إنترنت واتصالات',     type: ACCOUNT_TYPES.EXPENSE, isSystem: true },
    { code: '5240', name: 'صيانة وإصلاح',         type: ACCOUNT_TYPES.EXPENSE, isSystem: true },
    { code: '5250', name: 'نظافة وضيافة',        type: ACCOUNT_TYPES.EXPENSE, isSystem: false },
    { code: '5260', name: 'أدوات مكتبية',               type: ACCOUNT_TYPES.EXPENSE, isSystem: false },
    { code: '5270', name: 'مصروفات نثرية متنوعة', type: ACCOUNT_TYPES.EXPENSE, isSystem: false },

    // ── 53xx: Marketing & Advertising (Detailed)
    { code: '5300', name: 'تسويق ودعاية',       type: ACCOUNT_TYPES.EXPENSE, isSystem: false },
    { code: '5310', name: 'إعلانات ممولة',                      type: ACCOUNT_TYPES.EXPENSE, isSystem: false },
    { code: '5320', name: 'عروض وهدايا',            type: ACCOUNT_TYPES.EXPENSE, isSystem: false },
    { code: '5330', name: 'تعبئة وتغليف',                     type: ACCOUNT_TYPES.EXPENSE, isSystem: false },
    { code: '5340', name: 'خسائر ومصروفات شحن غير مستردة', type: ACCOUNT_TYPES.EXPENSE, isSystem: true },

    { code: '5400', name: 'مصروف الإهلاك',          type: ACCOUNT_TYPES.EXPENSE, isSystem: false },
    { code: '5500', name: 'عجز/زيادة الصندوق',               type: ACCOUNT_TYPES.EXPENSE, isSystem: true },
    { code: '5600', name: 'تالف المخزون',            type: ACCOUNT_TYPES.EXPENSE, isSystem: true },
];

async function seedAllTenants() {
    const prisma = new PrismaClient();
    try {
        console.log('--- Casper Multi-Tenant & Local GL Account Seeder ---');
        
        let tenantIds = ['default'];
        try {
            const tenants = await prisma.tenant.findMany({ select: { id: true, slug: true } });
            if (tenants && tenants.length > 0) {
                tenantIds = Array.from(new Set(['default', 'demo', 'SYSTEM', ...tenants.map(t => t.slug || t.id)]));
            }
        } catch (e) {
            console.log('No tenant table found, running in single-tenant mode.');
        }

        // Detect if Account model supports tenantId
        let hasTenantIdOnAccount = false;
        try {
            await prisma.account.findFirst({ where: { tenantId: 'default' } });
            hasTenantIdOnAccount = true;
        } catch (e) {
            hasTenantIdOnAccount = false;
        }

        console.log(`Environment mode: ${hasTenantIdOnAccount ? 'Multi-Tenant Postgres' : 'Single-Tenant SQLite'}`);
        console.log(`Target tenants: ${hasTenantIdOnAccount ? tenantIds.join(', ') : 'local'}`);

        if (hasTenantIdOnAccount) {
            for (const tenantId of tenantIds) {
                console.log(`\n=== Seeding GL Accounts for tenant: [${tenantId}] ===`);
                const existing = await prisma.account.findMany({
                    where: { tenantId: tenantId },
                    select: { code: true }
                });
                const existingCodes = new Set(existing.map(a => a.code));
                const missing = DEFAULT_ACCOUNTS.filter(acc => !existingCodes.has(acc.code));

                if (missing.length === 0) {
                    console.log(`✅ All ${DEFAULT_ACCOUNTS.length} accounts already exist for [${tenantId}].`);
                    continue;
                }

                console.log(`Seeding ${missing.length} missing accounts for [${tenantId}]...`);
                for (const acc of missing) {
                    await prisma.account.create({
                        data: {
                            tenantId: tenantId,
                            code: acc.code,
                            name: acc.name,
                            type: acc.type,
                            isSystem: acc.isSystem,
                            description: `System generated ${acc.type} account for ${tenantId}`,
                        }
                    });
                    console.log(`  + Created: [${acc.code}] ${acc.name}`);
                }
                console.log(`✅ Finished seeding for [${tenantId}].`);
            }
        } else {
            console.log(`\n=== Seeding GL Accounts for local DB ===`);
            const existing = await prisma.account.findMany({
                select: { code: true }
            });
            const existingCodes = new Set(existing.map(a => a.code));
            const missing = DEFAULT_ACCOUNTS.filter(acc => !existingCodes.has(acc.code));

            if (missing.length === 0) {
                console.log(`✅ All ${DEFAULT_ACCOUNTS.length} accounts already exist locally.`);
            } else {
                console.log(`Seeding ${missing.length} missing accounts locally...`);
                for (const acc of missing) {
                    await prisma.account.create({
                        data: {
                            code: acc.code,
                            name: acc.name,
                            type: acc.type,
                            isSystem: acc.isSystem,
                            description: `System generated ${acc.type} account`,
                        }
                    });
                    console.log(`  + Created: [${acc.code}] ${acc.name}`);
                }
                console.log(`✅ Finished local seeding.`);
            }
        }

        console.log('\n🚀 ALL GL ACCOUNTS SEEDING COMPLETE!');
    } catch (err) {
        console.error('❌ Seeding failed:', err);
    } finally {
        await prisma.$disconnect();
    }
}

seedAllTenants();
