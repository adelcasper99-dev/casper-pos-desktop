/**
 * Odoo-Style Supplier Payment Helper
 * 
 * Creates SupplierPayment + Automatic Journal Entry
 * Follows Odoo best practices: every financial move creates accounting entries
 */
import { AccountingEngine } from './transaction-factory';
import { GL, PAYMENT_METHOD_GL_MAP } from '@/shared/constants/accounting-mappings';

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
    const glCode = PAYMENT_METHOD_GL_MAP[method] ?? GL.ASSETS.CASH;
    switch (type) {
      case 'PAYMENT':
        await AccountingEngine.recordTransaction({
          description: notes || `Supplier Payment: ${referenceId || payment.id.slice(0, 8)}`,
          reference: referenceId,
          branchId,
          idempotencyKey: `SUPP_PAY_${payment.id}`,
          lines: [
            { accountCode: GL.LIABILITIES.PAYABLES, debit: amount, credit: 0, description: "AP Reduced" },
            { accountCode: glCode, debit: 0, credit: amount, description: "Cash/Bank Paid" }
          ]
        }, tx);
        break;

      case 'INVOICE':
        await AccountingEngine.recordTransaction({
          description: notes || `Supplier Invoice: ${referenceId || payment.id.slice(0, 8)}`,
          reference: referenceId,
          branchId,
          idempotencyKey: `SUPP_INV_${payment.id}`,
          lines: [
            { accountCode: GL.ASSETS.INVENTORY, debit: amount, credit: 0, description: "Inventory Asset" },
            { accountCode: GL.LIABILITIES.PAYABLES, debit: 0, credit: amount, description: "Accounts Payable" }
          ]
        }, tx);
        break;

      case 'CREDIT':
        // Credit memo: Debit AP, Credit (reduce expense/inventory)
        await AccountingEngine.recordTransaction({
          description: `Credit Memo: ${notes}`,
          reference: referenceId,
          branchId,
          idempotencyKey: `SUPP_PAY_${payment.id}`,
          lines: [
            { accountCode: GL.LIABILITIES.PAYABLES, debit: amount, credit: 0, description: "AP Reduced" },
            { accountCode: PAYMENT_METHOD_GL_MAP['CREDIT'] ?? GL.ASSETS.CASH, debit: 0, credit: amount, description: "Cash/Bank Paid" }
          ]
        }, tx);
        break;

      case 'REFUND':
        // Refund: Debit Cash, Credit AP
        await AccountingEngine.recordTransaction({
          description: `Refund: ${notes}`,
          reference: referenceId,
          branchId,
          idempotencyKey: `SUPP_PAY_${payment.id}`,
          lines: [
            { accountCode: GL.LIABILITIES.PAYABLES, debit: amount, credit: 0, description: "AP Reduced" },
            { accountCode: PAYMENT_METHOD_GL_MAP['CASH'] ?? GL.ASSETS.CASH, debit: 0, credit: amount, description: "Cash/Bank Paid" }
          ]
        }, tx);
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
