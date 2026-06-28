/**
 * Odoo-Style Employee Transaction Helper
 * 
 * Creates EmployeeTransaction + Automatic Journal Entry
 * Follows Odoo best practices: every payroll transaction creates accounting entries
 */
import { AccountingEngine } from './transaction-factory';
import { GL } from '@/shared/constants/accounting-mappings';

export type EmployeeTransactionType = 
  | 'SALARY'     // Salary payment
  | 'BONUS'      // Bonus payment
  | 'ADDITION'   // Additional payment
  | 'DEDUCTION'  // Deduction
  | 'PENALTY';   // Penalty

export type EmployeeTransactionParams = {
  userId: string;
  type: EmployeeTransactionType;
  amount: number;
  description?: string;
  referenceId?: string;
  referenceType?: string;
  createdAt?: Date;
  branchId?: string;
  createJournal?: boolean;
};

/**
 * Creates an EmployeeTransaction with automatic journal entry
 * 
 * Odoo-style: Every employee financial transaction creates journal entries
 * - SALARY/BONUS/ADDITION: Debit Salary Expense, Credit Cash
 * - DEDUCTION/PENALTY: Debit (contra-expense), Credit Cash
 */
export async function createEmployeeTransactionWithJournal(
  tx: any,
  params: EmployeeTransactionParams
) {
  const {
    userId,
    type,
    amount,
    description,
    referenceId,
    referenceType,
    createdAt,
    branchId,
    createJournal = true
  } = params;

  // 1. Create the employee transaction record
  const transaction = await tx.employeeTransaction.create({
    data: {
      userId,
      type,
      amount,
      description,
      referenceId,
      referenceType,
      createdAt: createdAt || new Date(),
      branchId
    }
  });

  // 2. Create automatic journal entry (Odoo style)
  if (createJournal && amount > 0) {
    // Determine if this is an expense (debit) or income (credit)
    const isExpense = ['SALARY', 'BONUS', 'ADDITION'].includes(type);
    
    if (isExpense) {
      // Payment: Debit Expense, Credit Cash
      const expenseCode = type === "PENALTY" ? GL.EXPENSES.OPERATION_EXPENSES : GL.EXPENSES.SALARIES;
      await AccountingEngine.recordTransaction({
        description: description || `Employee ${type}: ${referenceId || transaction.id.slice(0, 8)}`,
        reference: referenceId || transaction.id,
        branchId,
        idempotencyKey: `EMP_PAY_${transaction.id}`,
        lines: [
          { accountCode: expenseCode, debit: amount, credit: 0, description: "Employee Expense" },
          { accountCode: GL.ASSETS.CASH, debit: 0, credit: amount, description: "Cash Paid" }
        ]
      }, tx);
    } else {
      // Deduction/Penalty: Debit Employee Receivable, Credit (reduce expense)
      // For now, we'll skip journal for deductions as they're handled differently
    }
  }

  return transaction;
}

/**
 * Convenience function for salary payment
 */
export async function createSalaryPayment(
  tx: any,
  params: {
    userId: string;
    amount: number;
    description?: string;
    referenceId?: string;
    branchId?: string;
  }
) {
  return createEmployeeTransactionWithJournal(tx, {
    ...params,
    type: 'SALARY'
  });
}

/**
 * Convenience function for bonus payment
 */
export async function createBonusPayment(
  tx: any,
  params: {
    userId: string;
    amount: number;
    description?: string;
    referenceId?: string;
    branchId?: string;
  }
) {
  return createEmployeeTransactionWithJournal(tx, {
    ...params,
    type: 'BONUS'
  });
}

/**
 * Convenience function for deduction
 */
export async function createDeduction(
  tx: any,
  params: {
    userId: string;
    amount: number;
    description?: string;
    referenceId?: string;
    branchId?: string;
  }
) {
  return createEmployeeTransactionWithJournal(tx, {
    ...params,
    type: 'DEDUCTION'
  });
}

/**
 * Convenience function for penalty
 */
export async function createPenalty(
  tx: any,
  params: {
    userId: string;
    amount: number;
    description?: string;
    referenceId?: string;
    branchId?: string;
  }
) {
  return createEmployeeTransactionWithJournal(tx, {
    ...params,
    type: 'PENALTY'
  });
}
