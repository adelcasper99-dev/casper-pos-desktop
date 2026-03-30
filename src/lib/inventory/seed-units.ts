import { prisma } from '@/lib/prisma';
import { DEFAULT_UNITS, UNIT_CATEGORIES } from './constants';

export async function seedUnits() {
    console.log('Seeding default units of measure...');

    for (const unit of DEFAULT_UNITS) {
        try {
            const exists = await prisma.unitOfMeasure.findUnique({
                where: { code: unit.code }
            });

            if (!exists) {
                await prisma.unitOfMeasure.create({
                    data: {
                        code: unit.code,
                        name: unit.name,
                        category: unit.category,
                        abbreviation: unit.abbreviation,
                        conversionFactor: unit.conversionFactor,
                        isActive: true,
                    }
                });
                console.log(`[SEED] Created unit: ${unit.code} - ${unit.name}`);
            } else {
                if (exists.name !== unit.name) {
                    console.log(`[SEED] Unit ${unit.code} exists as "${exists.name}" (Expected: "${unit.name}")`);
                }
            }
        } catch (error) {
            console.error(`[SEED ERROR] Failed for unit ${unit.code}:`, error);
        }
    }
    console.log('[SEED] Finished units check.');
}

export async function getUnitsByCategory(category: string) {
    return prisma.unitOfMeasure.findMany({
        where: { category, isActive: true },
        orderBy: { name: 'asc' }
    });
}

export async function getAllActiveUnits() {
    return prisma.unitOfMeasure.findMany({
        where: { isActive: true },
        orderBy: [{ category: 'asc' }, { name: 'asc' }]
    });
}

export const UNIT_CATEGORY_LABELS: Record<string, string> = {
    [UNIT_CATEGORIES.WEIGHT]: 'الوزن / Weight',
    [UNIT_CATEGORIES.VOLUME]: 'الحجم / Volume',
    [UNIT_CATEGORIES.COUNT]: 'العدد / Count',
    [UNIT_CATEGORIES.LENGTH]: 'الطول / Length',
    [UNIT_CATEGORIES.AREA]: 'المساحة / Area',
};