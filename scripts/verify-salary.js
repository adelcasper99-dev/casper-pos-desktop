const { calculateNetDue } = require('./src/lib/salary-utils');
const { Decimal } = require('decimal.js');

async function testSalaryLogic() {
    console.log("Starting Salary Logic Verification...");

    const startDate = new Date(2024, 4, 1); // May 1st 2024
    const endDate = new Date(2024, 4, 31);   // May 31st 2024

    // Case 1: Employee hired BEFORE the month
    const emp1 = {
        salary: 3000,
        hireDate: new Date(2024, 3, 1), // April 1st
        dailyLogs: [{ date: new Date(2024, 4, 15), bonus: 100, deduction: 0, status: 'PRESENT' }],
        employeeTransactions: [{ createdAt: new Date(2024, 4, 20), amount: 50, type: 'BONUS' }]
    };
    const res1 = await calculateNetDue(emp1, startDate, endDate);
    console.log("Case 1 (Pre-hired):", res1.netDue.toNumber() === 3150 ? "✅ PASS" : `❌ FAIL (${res1.netDue.toNumber()})`);

    // Case 2: Employee hired MID-month (May 16th) -> 15 days worked
    const emp2 = {
        salary: 3000,
        hireDate: new Date(2024, 4, 16), // May 16th
        dailyLogs: [
            { date: new Date(2024, 4, 10), bonus: 500, deduction: 0, status: 'PRESENT' }, // Should be ignored
            { date: new Date(2024, 4, 20), bonus: 100, deduction: 0, status: 'PRESENT' }  // Should be counted
        ],
        employeeTransactions: []
    };
    const res2 = await calculateNetDue(emp2, startDate, endDate);
    // Base salary should be 3000 * (31-16) / 30 = 3000 * 15 / 30 = 1500
    // Total bonus should be 100 (others ignored)
    // Net should be 1600
    console.log("Case 2 (Mid-month hire):", res2.netDue.toNumber() === 1600 ? "✅ PASS" : `❌ FAIL (${res2.netDue.toNumber()})`);

    // Case 3: Employee hired AFTER the month
    const emp3 = {
        salary: 3000,
        hireDate: new Date(2024, 5, 1), // June 1st
        dailyLogs: [{ date: new Date(2024, 4, 10), bonus: 1000, deduction: 0, status: 'PRESENT' }],
        employeeTransactions: []
    };
    const res3 = await calculateNetDue(emp3, startDate, endDate);
    console.log("Case 3 (Post-hired):", res3.netDue.toNumber() === 0 ? "✅ PASS" : `❌ FAIL (${res3.netDue.toNumber()})`);

    console.log("Verification Complete.");
}

testSalaryLogic().catch(console.error);
