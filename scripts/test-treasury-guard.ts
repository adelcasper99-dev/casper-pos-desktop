import { prisma } from '../src/lib/prisma';
import { deductTreasuryBalance } from '../src/lib/treasury-guard';
import Decimal from 'decimal.js';

async function runTests() {
    console.log('🧪 Starting Treasury Guard & Concurrency Verification Test...\n');
    let passed = 0;
    let failed = 0;

    function assert(condition: boolean, message: string) {
        if (condition) {
            console.log(`  ✅ PASS: ${message}`);
            passed++;
        } else {
            console.error(`  ❌ FAIL: ${message}`);
            failed++;
        }
    }

    // 1. Setup Test Treasury & Branch
    const testBranch = await prisma.branch.upsert({
        where: { id: 'test-guard-branch' },
        update: { name: 'Test Guard Branch', code: 'TGB' },
        create: { id: 'test-guard-branch', name: 'Test Guard Branch', code: 'TGB' }
    });

    const testTreasury = await prisma.treasury.upsert({
        where: { id: 'test-guard-treasury' },
        update: { balance: new Decimal(1000), name: 'خزينة الاختبار الرئيسة' },
        create: {
            id: 'test-guard-treasury',
            name: 'خزينة الاختبار الرئيسة',
            balance: new Decimal(1000),
            branchId: testBranch.id,
            isDefault: false
        }
    });

    // Ensure store settings has allowNegativeCash = false
    await prisma.storeSettings.upsert({
        where: { id: 'settings' },
        update: { allowNegativeCash: false },
        create: { id: 'settings', allowNegativeCash: false }
    });

    // Test 1: Standard Deduction under balance (1000 - 500 = 500)
    try {
        console.log('\n--- Test 1: Standard Deduction (1000 EGP - 500 EGP) ---');
        const res1 = await prisma.$transaction(async (tx) => {
            return await deductTreasuryBalance({
                tx,
                treasuryId: testTreasury.id,
                amount: new Decimal(500),
                actionDescription: 'صرف تجريبي 1'
            });
        });
        assert(new Decimal(res1.newBalance.toString()).equals(500), 'New balance equals 500 EGP');
        assert(res1.isOverdraft === false, 'isOverdraft is false');
    } catch (e: any) {
        assert(false, `Test 1 threw unexpected error: ${e.message}`);
    }

    // Test 2: Boundary Deduction (500 - 500 = 0)
    try {
        console.log('\n--- Test 2: Exact Boundary Deduction (500 EGP - 500 EGP = 0) ---');
        const res2 = await prisma.$transaction(async (tx) => {
            return await deductTreasuryBalance({
                tx,
                treasuryId: testTreasury.id,
                amount: new Decimal(500),
                actionDescription: 'صرف الحد الأقصى'
            });
        });
        assert(new Decimal(res2.newBalance.toString()).equals(0), 'New balance equals exactly 0.00 EGP');
        assert(res2.isOverdraft === false, 'isOverdraft is false on exact 0 balance');
    } catch (e: any) {
        assert(false, `Test 2 threw unexpected error: ${e.message}`);
    }

    // Test 3: Blocked Overdraft when allowNegativeCash = false (0 - 50 = Error)
    try {
        console.log('\n--- Test 3: Blocked Overdraft (0 EGP - 50 EGP with toggle OFF) ---');
        let errorThrown = false;
        let errorMessage = '';
        try {
            await prisma.$transaction(async (tx) => {
                await deductTreasuryBalance({
                    tx,
                    treasuryId: testTreasury.id,
                    amount: new Decimal(50),
                    actionDescription: 'صرف غير مسموح'
                });
            });
        } catch (err: any) {
            errorThrown = true;
            errorMessage = err.message;
        }
        assert(errorThrown, 'Error was thrown when treasury balance is insufficient');
        assert(errorMessage.includes('غير كافٍ') && errorMessage.includes('خزينة الاختبار الرئيسة'), `Informative Arabic error returned: "${errorMessage}"`);
    } catch (e: any) {
        assert(false, `Test 3 failure: ${e.message}`);
    }

    // Test 4: Concurrency Race Condition Guard
    try {
        console.log('\n--- Test 4: Concurrency Race Condition (100 EGP balance, 2 parallel 80 EGP requests) ---');
        // Reset balance to 100
        await prisma.treasury.update({
            where: { id: testTreasury.id },
            data: { balance: new Decimal(100) }
        });

        const req1 = prisma.$transaction(async (tx) => {
            return await deductTreasuryBalance({
                tx,
                treasuryId: testTreasury.id,
                amount: new Decimal(80),
                actionDescription: 'سحب متزامن 1'
            });
        });

        const req2 = prisma.$transaction(async (tx) => {
            return await deductTreasuryBalance({
                tx,
                treasuryId: testTreasury.id,
                amount: new Decimal(80),
                actionDescription: 'سحب متزامن 2'
            });
        });

        const [r1, r2] = await Promise.allSettled([req1, req2]);
        const fulfilled = [r1, r2].filter(r => r.status === 'fulfilled');
        const rejected = [r1, r2].filter(r => r.status === 'rejected');

        assert(fulfilled.length === 1, `Exactly 1 concurrent request succeeded (fulfilled: ${fulfilled.length})`);
        assert(rejected.length === 1, `Exactly 1 concurrent request was blocked (rejected: ${rejected.length})`);

        const finalT = await prisma.treasury.findUnique({ where: { id: testTreasury.id } });
        assert(new Decimal(finalT!.balance.toString()).equals(20), `Remaining balance is exactly 20 EGP (current: ${finalT!.balance})`);
    } catch (e: any) {
        assert(false, `Test 4 failure: ${e.message}`);
    }

    // Test 5: Overdraft Permitted when allowNegativeCash = true
    try {
        console.log('\n--- Test 5: Overdraft Permitted (20 EGP - 50 EGP with toggle ON) ---');
        await prisma.storeSettings.upsert({
            where: { id: 'settings' },
            update: { allowNegativeCash: true },
            create: { id: 'settings', allowNegativeCash: true }
        });

        const res5 = await prisma.$transaction(async (tx) => {
            return await deductTreasuryBalance({
                tx,
                treasuryId: testTreasury.id,
                amount: new Decimal(50),
                actionDescription: 'سحب مكشوف مسموح'
            });
        });

        assert(new Decimal(res5.newBalance.toString()).equals(-30), `Balance became negative -30 EGP (current: ${res5.newBalance})`);
        assert(res5.isOverdraft === true, 'isOverdraft flag is true for negative balance');
    } catch (e: any) {
        assert(false, `Test 5 failure: ${e.message}`);
    }

    // Test 6: Decimal Precision
    try {
        console.log('\n--- Test 6: Decimal Precision (0.1 + 0.2 cents) ---');
        await prisma.treasury.update({
            where: { id: testTreasury.id },
            data: { balance: new Decimal('10.00') }
        });

        await prisma.$transaction(async (tx) => {
            await deductTreasuryBalance({
                tx,
                treasuryId: testTreasury.id,
                amount: new Decimal('0.10'),
                actionDescription: 'خصم قروش 1'
            });
            await deductTreasuryBalance({
                tx,
                treasuryId: testTreasury.id,
                amount: new Decimal('0.20'),
                actionDescription: 'خصم قروش 2'
            });
        });

        const finalDecT = await prisma.treasury.findUnique({ where: { id: testTreasury.id } });
        const roundedBal = new Decimal(finalDecT!.balance.toString()).toFixed(2);
        assert(roundedBal === '9.70', `Balance rounded to 2 decimal places is exactly 9.70 EGP (got ${roundedBal})`);
    } catch (e: any) {
        assert(false, `Test 6 failure: ${e.message}`);
    }

    // Cleanup
    await prisma.storeSettings.upsert({
        where: { id: 'settings' },
        update: { allowNegativeCash: false },
        create: { id: 'settings', allowNegativeCash: false }
    });
    await prisma.treasury.delete({ where: { id: testTreasury.id } }).catch(() => {});
    await prisma.branch.delete({ where: { id: testBranch.id } }).catch(() => {});

    console.log(`\n========================================`);
    console.log(`📊 Test Results: ${passed} Passed, ${failed} Failed`);
    console.log(`========================================\n`);

    if (failed > 0) process.exit(1);
}

runTests()
    .catch(err => {
        console.error('Fatal error in test runner:', err);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
