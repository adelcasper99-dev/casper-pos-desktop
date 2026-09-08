
import { prisma, type PrismaTransactionClient } from '@/lib/prisma';
import { type Prisma } from '@prisma/client';
import { DEFAULT_ACCOUNTS } from './constants';

type DbClient = PrismaTransactionClient | Prisma.TransactionClient | typeof prisma;

export async function seedAccounts(tx?: DbClient) {
    const client = (tx || prisma) as typeof prisma;
    console.log('Seeding default accounts...');

    try {
        const existing = await client.account.findMany({
            select: { code: true }
        });
        const existingCodes = new Set(existing.map((a: { code: string }) => a.code));
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
