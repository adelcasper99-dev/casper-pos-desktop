
import { prisma } from '@/lib/prisma';
import { DEFAULT_ACCOUNTS } from './constants';

export async function seedAccounts(tx?: any) {
    const client = tx || prisma;
    console.log('Seeding default accounts...');

    try {
        const existing = await client.account.findMany({
            select: { code: true }
        });
        const existingCodes = new Set(existing.map((a: any) => a.code));
        const missing = DEFAULT_ACCOUNTS.filter(acc => !existingCodes.has(acc.code));

        if (missing.length === 0) {
            console.log('[SEED] All accounts already exist.');
            return;
        }

        console.log(`[SEED] Found ${missing.length} missing accounts. Seeding...`);
        for (const acc of missing) {
            await client.account.create({
                data: {
                    code: acc.code,
                    name: acc.name,
                    type: acc.type,
                    isSystem: acc.isSystem,
                    description: `System generated ${acc.type} account`,
                }
            });
            console.log(`[SEED] Created account: ${acc.code} - ${acc.name}`);
        }
        console.log('[SEED] Finished account check.');
    } catch (error) {
        console.error('[SEED ERROR] Failed to seed accounts:', error);
    }
}
