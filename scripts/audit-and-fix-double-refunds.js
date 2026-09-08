const { PrismaClient } = require('@prisma/client');
const Decimal = require('decimal.js');
const fs = require('fs');
const path = require('path');

async function auditAndFixDoubleRefunds() {
    const prisma = new PrismaClient();
    const isFixMode = process.argv.includes('--fix');

    try {
        console.log('====================================================');
        console.log(`🔍 CASPER POS - MAINTENANCE TICKET REFUND AUDIT`);
        console.log(`Mode: ${isFixMode ? '🔧 FIX & REMEDIATE (WRITES ENABLED)' : '👀 DRY-RUN AUDIT ONLY (READ-ONLY)'}`);
        console.log('====================================================\n');

        // 1. Discover all tickets with refund activity or negative amountPaid
        const tickets = await prisma.ticket.findMany({
            include: {
                payments: true,
                parts: true
            }
        });

        console.log(`Scanning ${tickets.length} total tickets across database...\n`);

        const anomalies = [];

        for (const t of tickets) {
            const payments = t.payments.filter(p => p.type === 'PAYMENT' || !p.type);
            const refunds = t.payments.filter(p => p.type === 'REFUND');

            const totalPaidPayments = payments.reduce((sum, p) => sum.plus(new Decimal(p.amount?.toString() || '0')), new Decimal(0));
            const totalRefunds = refunds.reduce((sum, p) => sum.plus(new Decimal(p.amount?.toString() || '0')), new Decimal(0));
            const amountPaidCurrent = new Decimal(t.amountPaid?.toString() || '0');

            const hasOverRefund = totalRefunds.gt(totalPaidPayments) && totalPaidPayments.gt(0);
            const hasNegativeBalance = amountPaidCurrent.lt(0);
            const hasZeroPaidWithRefund = totalPaidPayments.isZero() && totalRefunds.gt(0);

            if (hasOverRefund || hasNegativeBalance || hasZeroPaidWithRefund) {
                const discrepancy = totalRefunds.minus(totalPaidPayments);
                anomalies.push({
                    id: t.id,
                    tenantId: t.tenantId || 'default',
                    barcode: t.barcode,
                    customerName: t.customerName,
                    repairPrice: t.repairPrice?.toString() || '0',
                    totalPaid: totalPaidPayments.toFixed(2),
                    totalRefunds: totalRefunds.toFixed(2),
                    amountPaidCurrent: amountPaidCurrent.toFixed(2),
                    discrepancy: discrepancy.toFixed(2),
                    status: t.status
                });
            }
        }

        if (anomalies.length === 0) {
            console.log('✅ 0 Anomalies found. All ticket returns are mathematically balanced!');
            return;
        }

        console.log(`🚨 FOUND ${anomalies.length} TICKET(S) WITH REFUND DISCREPANCIES:\n`);
        console.table(anomalies);

        if (isFixMode) {
            console.log('\n🔧 Applying atomic remediation fixes inside transaction...');
            const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
            const logFilePath = path.join(__dirname, `audit-fix-log-${timestamp}.json`);
            const auditHistory = [];

            // Execute all fixes atomically in a transaction
            await prisma.$transaction(async (tx) => {
                for (const item of anomalies) {
                    await tx.ticket.update({
                        where: { id: item.id },
                        data: {
                            amountPaid: 0,
                            paymentStatus: 'unpaid',
                            status: 'CANCELLED',
                            conditionNotes: `[AUDIT FIX ${new Date().toISOString()}] Adjusted negative/over-refunded amountPaid from ${item.amountPaidCurrent} to 0.00`
                        }
                    });

                    // Record ActionLog
                    try {
                        await tx.actionLog.create({
                            data: {
                                tenantId: item.tenantId,
                                action: 'AUDIT_REFUND_REMEDIATION',
                                details: `Corrected Ticket #${item.barcode}: Paid=${item.totalPaid}, Refunded=${item.totalRefunds}, Discrepancy=${item.discrepancy} EGP. Clamped amountPaid to 0.00`,
                                userId: 'SYSTEM_AUDIT'
                            }
                        });
                    } catch (e) {
                        console.warn(`  ⚠️ ActionLog warning for ticket #${item.barcode}:`, e.message);
                    }

                    auditHistory.push({
                        ...item,
                        remediatedAt: new Date().toISOString(),
                        action: 'CLAMP_TO_ZERO_AND_CANCEL',
                        previousAmountPaid: item.amountPaidCurrent,
                        newAmountPaid: '0.00',
                        newStatus: 'CANCELLED'
                    });

                    console.log(`  ✅ Remediated Ticket #${item.barcode} (amountPaid: ${item.amountPaidCurrent} -> 0.00, status: ${item.status} -> CANCELLED)`);
                }
            });

            fs.writeFileSync(logFilePath, JSON.stringify(auditHistory, null, 2), 'utf-8');
            console.log(`\n📁 Audit trail written to disk: ${logFilePath}`);
            console.log('🎉 ALL ANOMALIES REMEDIATED ATOMICALLY & SUCCESSFULLY!');
        } else {
            console.log('\n💡 DRY-RUN COMPLETE (No changes were made to the database).');
            console.log('   To apply atomic fixes and clamp negative balances to 0.00, re-run with:');
            console.log('   node scripts/audit-and-fix-double-refunds.js --fix\n');
        }

    } catch (err) {
        console.error('❌ Audit execution failed:', err);
    } finally {
        await prisma.$disconnect();
    }
}

auditAndFixDoubleRefunds();

