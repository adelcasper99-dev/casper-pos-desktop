/**
 * Odoo-Style Customer Transaction Helper
 * 
 * Creates CustomerTransaction + Automatic Journal Entry
 * Follows Odoo best practices: every financial move creates accounting entries
 */
import { AutoJournalService } from './auto-journal-service';

export type CustomerTransactionType = 
  | 'PAYMENT'    // Customer paid (reduces AR)
  | 'RECEIPT'    // Cash received (increases cash)
  | 'CREDIT'     // Credit given (increases AR)
  | 'DEBIT'      // Debit given (decreases AR)
  | 'REFUND';    // Refund issued

export type CustomerTransactionParams = {
  customerId: string;
  type: CustomerTransactionType;
  amount: number;
  description?: string;
  reference?: string;
  createdBy?: string;
  branchId?: string;
  createJournal?: boolean; // Whether to create journal entry (default: true for payments)
};

/**
 * Creates a CustomerTransaction with automatic journal entry
 * 
 * Odoo-style: Every customer financial transaction creates journal entries
 * - PAYMENT: Debit Cash, Credit AR
 * - RECEIPT: Debit Cash, Credit AR  
 * - CREDIT: Debit AR, Credit Revenue
 * - DEBIT: Debit AR, Credit Revenue (contra)
 * - REFUND: Debit AR, Credit Cash
 */
export async function createCustomerTransactionWithJournal(
  tx: any,
  params: CustomerTransactionParams
) {
  const {
    customerId,
    type,
    amount,
    description,
    reference,
    createdBy,
    branchId,
    createJournal = true
  } = params;

  // 1. Create the customer transaction record
  const transaction = await tx.customerTransaction.create({
    data: {
      customerId,
      type,
      amount,
      description,
      reference,
      createdBy,
      branchId
    }
  });

  // 2. Create automatic journal entry (Odoo style)
  if (createJournal && amount > 0) {
    switch (type) {
      case 'PAYMENT':
      case 'RECEIPT':
        await AutoJournalService.recordCustomerPayment(tx, {
          customerTransactionId: transaction.id,
          customerId,
          amount,
          method: 'CASH', // Default method; can be passed as parameter
          reference,
          description,
          branchId
        });
        break;

      case 'CREDIT':
        await AutoJournalService.recordCustomerCredit(tx, {
          customerTransactionId: transaction.id,
          customerId,
          amount,
          reference,
          description,
          branchId
        });
        break;

      case 'DEBIT':
        // Similar to CREDIT but for contra entries
        await AutoJournalService.recordCustomerCredit(tx, {
          customerTransactionId: transaction.id,
          customerId,
          amount,
          reference,
          description,
          branchId
        });
        break;

      case 'REFUND':
        // Refund: Debit AR, Credit Cash
        await AutoJournalService.recordCustomerPayment(tx, {
          customerTransactionId: transaction.id,
          customerId,
          amount,
          method: 'CASH',
          reference,
          description: `Refund: ${description}`,
          branchId
        });
        break;
    }
  }

  return transaction;
}

/**
 * Convenience function for common customer payment scenario
 */
export async function createCustomerPayment(
  tx: any,
  params: {
    customerId: string;
    amount: number;
    method?: string;
    description?: string;
    reference?: string;
    createdBy?: string;
    branchId?: string;
  }
) {
  const { method = 'CASH', ...rest } = params;
  
  // For payment types that reduce AR
  if (['CASH', 'VISA', 'CARD', 'BANK', 'VODAFONE_CASH', 'INSTAPAY', 'WALLET'].includes(method)) {
    return createCustomerTransactionWithJournal(tx, {
      ...rest,
      type: 'PAYMENT',
      amount: rest.amount,
      createJournal: true
    });
  }
  
  // For deferred/account (AR only)
  return createCustomerTransactionWithJournal(tx, {
    ...rest,
    type: 'CREDIT',
    createJournal: false // AR tracking without cash movement
  });
}

/**
 * Convenience function for customer receipt (cash received)
 */
export async function createCustomerReceipt(
  tx: any,
  params: {
    customerId: string;
    amount: number;
    description?: string;
    reference?: string;
    createdBy?: string;
    branchId?: string;
  }
) {
  return createCustomerTransactionWithJournal(tx, {
    ...params,
    type: 'RECEIPT'
  });
}

/**
 * Convenience function for customer refund
 */
export async function createCustomerRefund(
  tx: any,
  params: {
    customerId: string;
    amount: number;
    method?: string;
    description?: string;
    reference?: string;
    createdBy?: string;
    branchId?: string;
  }
) {
  return createCustomerTransactionWithJournal(tx, {
    ...params,
    type: 'REFUND'
  });
}
