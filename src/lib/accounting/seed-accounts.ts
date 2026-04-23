
import { prisma } from '@/lib/prisma';
import { DEFAULT_ACCOUNTS } from './constants';

export async function seedAccounts() {
    try {
        const existing = await prisma.account.findMany({
            select: { code: true }
        });
        const existingCodes = new Set(existing.map(a => a.code));

        const missing = DEFAULT_ACCOUNTS.filter(a => !existingCodes.has(a.code));

        if (missing.length > 0) {
            console.log(`[SEED] Creating ${missing.length} missing system accounts...`);
            await prisma.account.createMany({
                data: missing.map(acc => ({
                    code: acc.code,
                    name: acc.name,
                    type: acc.type,
                    isSystem: acc.isSystem,
                    description: `System generated ${acc.type} account`,
                }))
            });
            console.log(`[SEED] Successfully created ${missing.length} accounts.`);
        }
    } catch (error) {
        console.error('[SEED ERROR] Failed to seed accounts:', error);
    }
}
