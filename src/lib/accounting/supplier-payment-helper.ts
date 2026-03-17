/**
 * Odoo-Style Supplier Payment Helper
 * 
 * Creates SupplierPayment + Automatic Journal Entry
 * Follows Odoo best practices: every financial move creates accounting entries
 */
import { AutoJournalService } from './auto-journal-service';

export type SupplierPaymentType = 
  | 'PAYMENT'    // Supplier paid (reduces AP)
  | 'INVOICE'    // Invoice received (increases AP)
  | 'CREDIT'     // Credit from supplier
  | 'REFUND';    // Refund from supplier

export type SupplierPaymentParams = {
  supplierId: string;
  amount: number;
  method?: string;
  notes?: string;
  paymentDate?: Date;
  branchId?: string;
  referenceId?: string;
  createJournal?: boolean;
};

/**
 * Creates a SupplierPayment with automatic journal entry
 * 
 * Odoo-style: Every supplier financial transaction creates journal entries
 * - PAYMENT: Debit AP, Credit Cash
 * - INVOICE: Debit Inventory, Credit AP
 * - CREDIT: Debit AP, Credit Inventory
 * - REFUND: Debit Cash, Credit AP
 */
export async function createSupplierPaymentWithJournal(
  tx: any,
  params: {
    supplierId: string;
    amount: number;
    method?: string;
    notes?: string;
    paymentDate?: Date;
    branchId?: string;
    referenceId?: string;
    createJournal?: boolean;
    type?: SupplierPaymentType;
  }
) {
  const {
    supplierId,
    amount,
    method = 'CASH',
    notes,
    paymentDate,
    branchId,
    referenceId,
    createJournal = true,
    type = 'PAYMENT'
  } = params;

  // 1. Create the supplier payment record
  const payment = await tx.supplierPayment.create({
    data: {
      supplierId,
      amount,
      method,
      notes,
      paymentDate: paymentDate || new Date(),
      branchId,
      // Note: referenceId can be linked to PurchaseInvoice if needed
    }
  });

  // 2. Create automatic journal entry (Odoo style)
  if (createJournal && amount > 0) {
    switch (type) {
      case 'PAYMENT':
        await AutoJournalService.recordSupplierPayment(tx, {
          supplierPaymentId: payment.id,
          supplierId,
          amount,
          method,
          reference: referenceId,
          description: notes,
          branchId
        });
        break;

      case 'INVOICE':
        await AutoJournalService.recordSupplierReceipt(tx, {
          supplierPaymentId: payment.id,
          supplierId,
          amount,
          reference: referenceId,
          description: notes,
          branchId
        });
        break;

      case 'CREDIT':
        // Credit memo: Debit AP, Credit (reduce expense/inventory)
        await AutoJournalService.recordSupplierPayment(tx, {
          supplierPaymentId: payment.id,
          supplierId,
          amount,
          method: 'CREDIT',
          reference: referenceId,
          description: `Credit Memo: ${notes}`,
          branchId
        });
        break;

      case 'REFUND':
        // Refund: Debit Cash, Credit AP
        await AutoJournalService.recordSupplierPayment(tx, {
          supplierPaymentId: payment.id,
          supplierId,
          amount,
          method: 'CASH',
          reference: referenceId,
          description: `Refund: ${notes}`,
          branchId
        });
        break;
    }
  }

  return payment;
}

/**
 * Convenience function for supplier payment (money out)
 */
export async function createSupplierPayment(
  tx: any,
  params: {
    supplierId: string;
    amount: number;
    method?: string;
    notes?: string;
    paymentDate?: Date;
    branchId?: string;
    referenceId?: string;
  }
) {
  return createSupplierPaymentWithJournal(tx, {
    ...params,
    type: 'PAYMENT'
  });
}

/**
 * Convenience function for supplier invoice (AP increase)
 */
export async function createSupplierInvoice(
  tx: any,
  params: {
    supplierId: string;
    amount: number;
    notes?: string;
    branchId?: string;
    referenceId?: string;
  }
) {
  return createSupplierPaymentWithJournal(tx, {
    ...params,
    method: 'INVOICE',
    type: 'INVOICE',
    createJournal: true
  });
}

/**
 * Convenience function for supplier credit memo
 */
export async function createSupplierCredit(
  tx: any,
  params: {
    supplierId: string;
    amount: number;
    notes?: string;
    branchId?: string;
    referenceId?: string;
  }
) {
  return createSupplierPaymentWithJournal(tx, {
    ...params,
    type: 'CREDIT'
  });
}
