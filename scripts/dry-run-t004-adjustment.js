const { PrismaClient } = require('@prisma/client');
const Decimal = require('decimal.js');

async function dryRunAdjustment() {
  const prisma = new PrismaClient();
  try {
    const tenantId = 'demo';
    const accounts = await prisma.account.findMany({
      where: { tenantId }
    });

    const acc1000 = accounts.find(a => a.code === '1000' || a.name.includes('نقدية'));
    const acc2200 = accounts.find(a => a.code === '2200' || a.name.includes('الرواتب والأجور'));
    const acc4000 = accounts.find(a => a.code === '4000');
    const acc4100 = accounts.find(a => a.code === '4100');

    console.log('=== TARGET ACCOUNTS FOR ADJUSTMENT ===');
    console.log(`Account 2200 (Commission Payable): ${acc2200?.id} (${acc2200?.name})`);
    console.log(`Account 4000 (Parts/Sales Revenue): ${acc4000?.id} (${acc4000?.name})`);
    console.log(`Account 4100 (Service Revenue):     ${acc4100?.id} (${acc4100?.name})`);

    const proposedEntry = {
      tenantId: 'demo',
      date: new Date(),
      description: 'Adjustment: Reconcile Ticket #T-004 double-refund test fixture to zero',
      reference: 'ADJ-T004-RECONCILE',
      ticketId: '2d48d132-caeb-4f46-ac49-c52a6d6d0ebe',
      lines: [
        {
          accountName: acc2200?.name,
          accountId: acc2200?.id,
          debit: 5.40,
          credit: 0.00,
          description: 'Reverse orphaned technician commission on cancelled Ticket #T-004'
        },
        {
          accountName: acc4000?.name,
          accountId: acc4000?.id,
          debit: 12.60,
          credit: 0.00,
          description: 'Reverse labor profit allocation on cancelled Ticket #T-004'
        },
        {
          accountName: acc4100?.name,
          accountId: acc4100?.id,
          debit: 0.00,
          credit: 18.00,
          description: 'Offset excess test refund debit on Service Revenue for Ticket #T-004'
        }
      ]
    };

    console.log('\n=== PROPOSED ADJUSTMENT JOURNAL ENTRY (DRY-RUN) ===');
    console.log(JSON.stringify(proposedEntry, null, 2));

    const totalDebit = proposedEntry.lines.reduce((sum, l) => sum.plus(new Decimal(l.debit)), new Decimal(0));
    const totalCredit = proposedEntry.lines.reduce((sum, l) => sum.plus(new Decimal(l.credit)), new Decimal(0));

    console.log(`\nTotal Debit:  ${totalDebit.toFixed(2)} EGP`);
    console.log(`Total Credit: ${totalCredit.toFixed(2)} EGP`);
    console.log(`Balanced:     ${totalDebit.equals(totalCredit)}`);

  } catch (err) {
    console.error('Dry-run error:', err);
  } finally {
    await prisma.$disconnect();
  }
}

dryRunAdjustment();
