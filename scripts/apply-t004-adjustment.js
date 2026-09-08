const { PrismaClient } = require('@prisma/client');
const { execSync } = require('child_process');

async function applyAdjustment() {
  const prisma = new PrismaClient();
  try {
    console.log('=== Step 1: Creating Pre-Adjustment DB Backup ===');
    const timestamp = new Date().toISOString().replace(/[-:T.]/g, '').slice(0, 14);
    const backupPath = `/var/backups/casper_pre_adj_${timestamp}.sql`;
    try {
      execSync(`sudo -u postgres pg_dump casper_db > ${backupPath}`);
      console.log(`✅ Backup created at: ${backupPath}`);
    } catch (e) {
      console.warn('⚠️ Could not run local pg_dump directly via execSync, skipping local dump command if permissions differ.');
    }

    console.log('=== Step 2: Posting Correcting Journal Entry in demo scope ===');
    const result = await prisma.$transaction(async (tx) => {
      const entry = await tx.journalEntry.create({
        data: {
          tenantId: 'demo',
          date: new Date(),
          description: 'Adjustment: Reconcile Ticket #T-004 double-refund test fixture to zero',
          reference: 'ADJ-T004-RECONCILE',
          ticketId: '2d48d132-caeb-4f46-ac49-c52a6d6d0ebe',
          branchId: 'branch-52f4a6c1',
          idempotencyKey: 'ADJ_T004_RECONCILE_2d48d132',
          lines: {
            create: [
              {
                tenantId: 'demo',
                accountId: '24dd863f-d85f-4205-8369-5816669f1df6',
                debit: 5.40,
                credit: 0.00,
                description: 'Reverse orphaned technician commission on cancelled Ticket #T-004'
              },
              {
                tenantId: 'demo',
                accountId: 'a4017d4c-f44d-4a0c-b30c-c6bdc1e6d019',
                debit: 12.60,
                credit: 0.00,
                description: 'Reverse labor profit allocation on cancelled Ticket #T-004'
              },
              {
                tenantId: 'demo',
                accountId: 'acc-4100-047eff',
                debit: 0.00,
                credit: 18.00,
                description: 'Offset excess test refund debit on Service Revenue for Ticket #T-004'
              }
            ]
          }
        },
        include: {
          lines: true
        }
      });
      return entry;
    });

    console.log(`✅ Adjustment Entry successfully created with ID: ${result.id}`);
    console.log(`Total Lines: ${result.lines.length}`);
  } catch (err) {
    console.error('❌ Failed to apply adjustment:', err);
  } finally {
    await prisma.$disconnect();
  }
}

applyAdjustment();
