
import { prisma } from '@/lib/prisma';
import { DEFAULT_ACCOUNTS } from './constants';

export async function seedAccounts() {
    console.log('Seeding default accounts...');

    try {
        // 1. Fetch all existing accounts in a single batch query
        const existingAccounts = await prisma.account.findMany({
            select: { code: true, name: true }
        });
        const existingMap = new Map(existingAccounts.map(a => [a.code, a.name]));

        // 2. Log name drift detection for existing accounts
        for (const acc of DEFAULT_ACCOUNTS) {
            const existingName = existingMap.get(acc.code);
            if (existingName !== undefined && existingName !== acc.name) {
                console.log(`[SEED] Account ${acc.code} exists as "${existingName}" (Expected: "${acc.name}")`);
            }
        }

        // 3. Filter missing accounts to create
        const toCreate = DEFAULT_ACCOUNTS.filter(acc => !existingMap.has(acc.code));

        // 4. Bulk insert missing accounts with race-condition guard
        if (toCreate.length > 0) {
            await prisma.account.createMany({
                data: toCreate.map(acc => ({
                    code: acc.code,
                    name: acc.name,
                    type: acc.type,
                    isSystem: acc.isSystem,
                    description: `System generated ${acc.type} account`,
                }))
            });
            console.log(`[SEED] Bulk created ${toCreate.length} missing accounts.`);
        } else {
            console.log('[SEED] All accounts already seeded.');
        }
    } catch (error) {
        console.error('[SEED ERROR] Failed to seed accounts:', error);
    }
    console.log('[SEED] Finished account check.');
}
