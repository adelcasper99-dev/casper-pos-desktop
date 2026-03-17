/**
 * Odoo-Style Prisma Middleware for Automatic Journal Entries
 * 
 * This middleware automatically creates journal entries whenever:
 * - CustomerTransaction is created
 * - SupplierPayment is created
 * - EmployeeTransaction is created
 * 
 * Based on Odoo best practices: every financial move creates accounting entries
 * automatically without requiring explicit calls in action files.
 */
import { CustomerTransaction, SupplierPayment, EmployeeTransaction } from '@prisma/client';
import { Decimal } from '@prisma/client/runtime/library';
import { prisma } from './prisma';

const PAYMENT_GL_MAP: Record<string, string> = {
  CASH: '1000',
  VISA: '1010',
  CARD: '1010',
  BANK: '1010',
  TRANSFER: '1010',
  VODAFONE_CASH: '1020',
  INSTAPAY: '1020',
  WALLET: '1020',
  DEFERRED: '1100',
  ACCOUNT: '1100',
};

const EXPENSE_GL_MAP: Record<string, string> = {
  SALARY: '5100',
  BONUS: '5100',
  ADDITION: '5100',
  DEDUCTION: '5100',
  PENALTY: '5200',
};

/**
 * Get account ID from GL code
 */
async function getAccountId(tx: any, glCode: string): Promise<string> {
  const account = await tx.account.findUnique({
    where: { code: glCode }
  });
  if (!account) {
    throw new Error(`GL Account ${glCode} not found. Run accounting seed.`);
  }
  return account.id;
}

/**
 * Create journal entry for CustomerTransaction
 */
async function createCustomerTransactionJournal(
  tx: any,
  data: {
    id: string;
    customerId: string;
    type: string;
    amount: Decimal | number;
    description?: string | null;
    reference?: string | null;
    branchId?: string | null;
  }
) {
  const amount = Number(data.amount);
  if (amount <= 0) return;

  const lines: any[] = [];
  const method = 'CASH'; // Default - can be enhanced to track payment method

  switch (data.type) {
    case 'PAYMENT':
    case 'RECEIPT':
      // Debit Cash, Credit AR
      lines.push({
        accountId: await getAccountId(tx, PAYMENT_GL_MAP[method] || '1000'),
        debit: amount,
        credit: 0,
        description: 'Cash/Bank Received'
      });
      lines.push({
        accountId: await getAccountId(tx, '1100'),
        debit: 0,
        credit: amount,
        description: 'AR Reduced'
      });
      break;

    case 'CREDIT':
      // Debit AR, Credit Revenue
      lines.push({
        accountId: await getAccountId(tx, '1100'),
        debit: amount,
        credit: 0,
        description: 'Customer AR'
      });
      lines.push({
        accountId: await getAccountId(tx, '4000'),
        debit: 0,
        credit: amount,
        description: 'Sales Revenue'
      });
      break;

    case 'REFUND':
      // Debit AR (reversal), Credit Cash
      lines.push({
        accountId: await getAccountId(tx, '1100'),
        debit: amount,
        credit: 0,
        description: 'AR Refund'
      });
      lines.push({
        accountId: await getAccountId(tx, PAYMENT_GL_MAP[method] || '1000'),
        debit: 0,
        credit: amount,
        description: 'Cash Refunded'
      });
      break;

    default:
      // For other types like DEBIT, just track AR
      lines.push({
        accountId: await getAccountId(tx, '1100'),
        debit: amount,
        credit: 0,
        description: data.description || 'Customer Transaction'
      });
      lines.push({
        accountId: await getAccountId(tx, '4000'),
        debit: 0,
        credit: amount,
        description: data.description || 'Revenue'
      });
  }

  if (lines.length > 0) {
    await tx.journalEntry.create({
      data: {
        description: `Customer ${data.type}: ${data.description || data.reference || data.id.slice(0, 8)}`,
        reference: data.reference,
        branchId: data.branchId,
        customerTransactionId: data.id,
        lines: { create: lines }
      }
    });
  }
}

/**
 * Create journal entry for SupplierPayment
 */
async function createSupplierPaymentJournal(
  tx: any,
  data: {
    id: string;
    supplierId: string;
    amount: Decimal | number;
    method: string;
    notes?: string | null;
    branchId?: string | null;
  }
) {
  const amount = Number(data.amount);
  if (amount <= 0) return;

  const glCode = PAYMENT_GL_MAP[data.method] || '1000';
  const lines: any[] = [];

  // Debit AP, Credit Cash/Bank
  lines.push({
    accountId: await getAccountId(tx, '2000'),
    debit: amount,
    credit: 0,
    description: 'AP Reduced'
  });
  lines.push({
    accountId: await getAccountId(tx, glCode),
    debit: 0,
    credit: amount,
    description: data.notes || 'Supplier Payment'
  });

  await tx.journalEntry.create({
    data: {
      description: `Supplier Payment: ${data.notes || data.id.slice(0, 8)}`,
      branchId: data.branchId,
      supplierPaymentId: data.id,
      lines: { create: lines }
    }
  });
}

/**
 * Create journal entry for EmployeeTransaction
 */
async function createEmployeeTransactionJournal(
  tx: any,
  data: {
    id: string;
    userId: string;
    type: string;
    amount: Decimal | number;
    description?: string | null;
    branchId?: string | null;
  }
) {
  const amount = Number(data.amount);
  if (amount <= 0) return;

  const expenseCode = EXPENSE_GL_MAP[data.type] || '5100';
  const lines: any[] = [];

  // Debit Expense, Credit Cash
  lines.push({
    accountId: await getAccountId(tx, expenseCode),
    debit: amount,
    credit: 0,
    description: `${data.type}: ${data.description || data.id.slice(0, 8)}`
  });
  lines.push({
    accountId: await getAccountId(tx, '1000'),
    debit: 0,
    credit: amount,
    description: 'Cash Paid'
  });

  await tx.journalEntry.create({
    data: {
      description: `Employee ${data.type}: ${data.description || data.id.slice(0, 8)}`,
      branchId: data.branchId,
      employeeTransactionId: data.id,
      lines: { create: lines }
    }
  });
}

/**
 * Prisma Middleware for Automatic Journal Entries
 * 
 * This middleware intercepts model creates and automatically creates
 * journal entries for financial transactions.
 */
export function createAccountingMiddleware() {
  return async (params: any, next: any) => {
    // Call the actual operation first
    const result = await next(params);

    // Only process create operations
    if (params.action !== 'create') {
      return result;
    }

    // Get the transaction client - try to get from params, otherwise use prisma directly
    // The tx is available in params.tx when inside a transaction
    let tx = (params as any).tx;
    if (!tx) {
      // Not in a transaction - we'll need to use prisma directly
      tx = prisma;
    }

    try {
      // Handle CustomerTransaction
      if (params.model === 'CustomerTransaction') {
        const data = params.args.data as any;
        if (data && !data.journalEntries?.create) { // Avoid double-entry if already creating journal
          await createCustomerTransactionJournal(tx, {
            id: result.id,
            customerId: result.customerId,
            type: result.type,
            amount: result.amount,
            description: result.description,
            reference: result.reference,
            branchId: result.branchId
          });
        }
      }

      // Handle SupplierPayment
      if (params.model === 'SupplierPayment') {
        const data = params.args.data as any;
        if (data && !data.journalEntries?.create) {
          await createSupplierPaymentJournal(tx, {
            id: result.id,
            supplierId: result.supplierId,
            amount: result.amount,
            method: result.method || 'CASH',
            notes: result.notes,
            branchId: result.branchId
          });
        }
      }

      // Handle EmployeeTransaction
      if (params.model === 'EmployeeTransaction') {
        const data = params.args.data as any;
        if (data && !data.journalEntries?.create) {
          await createEmployeeTransactionJournal(tx, {
            id: result.id,
            userId: result.userId,
            type: result.type,
            amount: result.amount,
            description: result.description,
            branchId: result.branchId
          });
        }
      }
    } catch (error) {
      // Log but don't fail the main transaction
      console.error('[Accounting Middleware] Error creating journal entry:', error);
    }

    return result;
  };
}
