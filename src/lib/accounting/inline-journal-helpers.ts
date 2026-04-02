/**
 * Simple inline helper for creating journal entries for Customer/Supplier/Employee transactions
 * 
 * This is a lightweight helper that can be called inline within transaction blocks
 * to create journal entries without the complexity of the full middleware.
 */
import { Decimal } from '@prisma/client/runtime/library';
import { GL, PAYMENT_METHOD_GL_MAP } from '@/shared/constants/accounting-mappings';

// Unified GL maps moved to @/shared/constants/accounting-mappings

async function getAccountId(tx: any, glCode: string): Promise<string> {
  const account = await tx.account.findUnique({ where: { code: glCode } });
  if (!account) throw new Error(`GL Account ${glCode} not found`);
  return account.id;
}

/**
 * Create journal entry for CustomerTransaction (call AFTER creating the transaction)
 * Must be called within the same transaction block
 */
export async function createCustomerTransactionJournal(
  tx: any,
  params: {
    customerTransactionId: string;
    customerId: string;
    type: string;
    amount: number | Decimal;
    description?: string;
    reference?: string;
    branchId?: string | null;
  }
) {
  const amount = new Decimal(params.amount.toString());
  if (amount.lte(0)) return null;

  const glCode = GL.ASSETS.CASH; // Default to cash
  const lines: any[] = [];

  switch (params.type) {
    case 'PAYMENT':
    case 'RECEIPT':
      lines.push({
        accountId: await getAccountId(tx, glCode),
        debit: amount,
        credit: 0,
        description: 'Cash/Bank Received'
      });
      lines.push({
        accountId: await getAccountId(tx, GL.ASSETS.RECEIVABLES),
        debit: 0,
        credit: amount,
        description: 'AR Reduced'
      });
      break;
    case 'CREDIT':
      lines.push({
        accountId: await getAccountId(tx, GL.ASSETS.RECEIVABLES),
        debit: amount,
        credit: 0,
        description: 'Customer AR'
      });
      lines.push({
        accountId: await getAccountId(tx, GL.REVENUE.SALES),
        debit: 0,
        credit: amount,
        description: 'Sales Revenue'
      });
      break;
    case 'REFUND':
      lines.push({
        accountId: await getAccountId(tx, GL.ASSETS.RECEIVABLES),
        debit: amount,
        credit: 0,
        description: 'AR Refund'
      });
      lines.push({
        accountId: await getAccountId(tx, glCode),
        debit: 0,
        credit: amount,
        description: 'Cash Refunded'
      });
      break;
    default:
      return null;
  }

  return tx.journalEntry.create({
    data: {
      description: `Customer ${params.type}: ${params.description || params.reference || params.customerTransactionId.slice(0, 8)}`,
      reference: params.reference,
      branchId: params.branchId,
      customerTransactionId: params.customerTransactionId,
      lines: { create: lines }
    }
  });
}

/**
 * Create journal entry for SupplierPayment (call AFTER creating the payment)
 */
export async function createSupplierPaymentJournal(
  tx: any,
  params: {
    supplierPaymentId: string;
    supplierId: string;
    amount: number | Decimal;
    method?: string;
    notes?: string;
    branchId?: string | null;
  }
) {
  const amount = new Decimal(params.amount.toString());
  if (amount.lte(0)) return null;

  const glCode = PAYMENT_METHOD_GL_MAP[params.method || 'CASH'] || GL.ASSETS.CASH;

  return tx.journalEntry.create({
    data: {
      description: `Supplier Payment: ${params.notes || params.supplierPaymentId.slice(0, 8)}`,
      branchId: params.branchId,
      supplierPaymentId: params.supplierPaymentId,
      lines: {
        create: [
          {
            accountId: await getAccountId(tx, GL.LIABILITIES.PAYABLES),
            debit: amount,
            credit: 0,
            description: 'AP Reduced'
          },
          {
            accountId: await getAccountId(tx, glCode),
            debit: 0,
            credit: amount,
            description: params.notes || 'Cash Paid'
          }
        ]
      }
    }
  });
}

/**
 * Create journal entry for EmployeeTransaction (call AFTER creating the transaction)
 */
export async function createEmployeeTransactionJournal(
  tx: any,
  params: {
    employeeTransactionId: string;
    employeeId: string;
    type: string;
    amount: number | Decimal;
    description?: string;
    branchId?: string | null;
  }
) {
  const amount = new Decimal(params.amount.toString());
  if (amount.lte(0)) return null;

  const expenseCode = (params.type === 'PENALTY' ? GL.EXPENSES.OPERATION_EXPENSES : GL.EXPENSES.SALARIES);

  return tx.journalEntry.create({
    data: {
      description: `Employee ${params.type}: ${params.description || params.employeeTransactionId.slice(0, 8)}`,
      branchId: params.branchId,
      employeeTransactionId: params.employeeTransactionId,
      lines: {
        create: [
          {
            accountId: await getAccountId(tx, expenseCode),
            debit: amount,
            credit: 0,
            description: `${params.type} Expense`
          },
          {
            accountId: await getAccountId(tx, GL.ASSETS.CASH),
            debit: 0,
            credit: amount,
            description: 'Cash Paid'
          }
        ]
      }
    }
  });
}
