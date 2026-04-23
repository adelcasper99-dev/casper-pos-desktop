import { prisma } from '@/lib/prisma';

const DEFAULT_CASH_CATEGORIES = [
    // IN categories (money coming in)
    { name: 'رأس مال (إيداع أصلي)', type: 'IN', isSystem: false, glCode: '3000' },
    { name: 'توريد من الخزنة الرئيسية', type: 'IN', isSystem: false, glCode: '1000' },
    { name: 'سداد دفعة عميل', type: 'IN', isSystem: false, glCode: '1100' },
    { name: 'زيادة درج (تسوية)', type: 'IN', isSystem: true, glCode: '4500' },
    { name: 'إيرادات أخرى', type: 'IN', isSystem: false, glCode: '4400' },
    
    // OUT categories (Occupancy & Utilities)
    { name: 'إيجار', type: 'OUT', isSystem: false, glCode: '5210' },
    { name: 'كهرباء ومياه', type: 'OUT', isSystem: false, glCode: '5220' },
    { name: 'إنترنت واتصالات', type: 'OUT', isSystem: false, glCode: '5230' },

    // OUT categories (Operational G&A)
    { name: 'صيانة وإصلاح', type: 'OUT', isSystem: false, glCode: '5240' },
    { name: 'نظافة وضيافة', type: 'OUT', isSystem: false, glCode: '5250' },
    { name: 'أدوات مكتبية', type: 'OUT', isSystem: false, glCode: '5260' },

    // OUT categories (Payroll)
    { name: 'رواتب وأجور', type: 'OUT', isSystem: false, glCode: '5100' },
    { name: 'مكافآت وحوافز', type: 'OUT', isSystem: false, glCode: '5110' },
    { name: 'يوميات (عمالة مؤقتة)', type: 'OUT', isSystem: false, glCode: '5120' },

    // OUT categories (Misc & System)
    { name: 'مسحوبات شخصية (شركاء)', type: 'OUT', isSystem: false, glCode: '3200' },
    { name: 'عجز درج (تسوية)', type: 'OUT', isSystem: true, glCode: '5500' },
    { name: 'سحب للخزنة', type: 'OUT', isSystem: false, glCode: '1000' },
    { name: 'مصروفات عامة أخرى', type: 'OUT', isSystem: false, glCode: '5270' },
];

export async function seedCashCategories() {
    try {
        const existing = await prisma.cashCategory.findMany({
            select: { name: true }
        });
        const existingNames = new Set(existing.map(c => c.name));

        const missing = DEFAULT_CASH_CATEGORIES.filter(c => !existingNames.has(c.name));

        if (missing.length > 0) {
            console.log(`[SEED] Creating ${missing.length} missing cash categories...`);
            await prisma.cashCategory.createMany({
                data: missing.map(cat => ({
                    name: cat.name,
                    type: cat.type,
                    isSystem: cat.isSystem,
                    glCode: cat.glCode,
                    isActive: true
                }))
            });
            console.log(`[SEED] Successfully created ${missing.length} cash categories.`);
        }
    } catch (error) {
        console.error('[SEED ERROR] Failed to seed cash categories:', error);
    }
}
