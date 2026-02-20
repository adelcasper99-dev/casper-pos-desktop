
import { prisma } from '@/lib/prisma';
import { DEFAULT_ACCOUNTS } from './constants';

export async function seedAccounts() {
    console.log('Seeding default accounts...');

    for (const acc of DEFAULT_ACCOUNTS) {
        try {
            const exists = await prisma.account.findUnique({
                where: { code: acc.code }
            });

            if (!exists) {
                await prisma.account.create({
                    data: {
                        code: acc.code,
                        name: acc.name,
                        type: acc.type,
                        isSystem: acc.isSystem,
                        description: `System generated ${acc.type} account`,
                    }
                });
                console.log(`[SEED] Created account: ${acc.code} - ${acc.name}`);
            } else {
                // If it exists but name is radically different or it's not marked as system, we might want to know
                if (exists.name !== acc.name) {
                    console.log(`[SEED] Account ${acc.code} exists as "${exists.name}" (Expected: "${acc.name}")`);
                }
            }
        } catch (error) {
            console.error(`[SEED ERROR] Failed for account ${acc.code}:`, error);
        }
    }
    console.log('[SEED] Finished account check.');
}
