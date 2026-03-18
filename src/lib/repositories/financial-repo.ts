/**
 * Financial Transaction Repository
 * 
 * Odoo-style: All financial transactions go through here.
 * Automatically creates journal entries - impossible to forget.
 * 
 * Usage:
 *   import { financialRepo } from '@/lib/repositories/financial-repo';
 *   await financialRepo.createCustomerTransaction(tx, { ... });
 */
import { Decimal } from '@prisma/client/runtime/library';
import { createCustomerTransactionJournal, createSupplierPaymentJournal, createEmployeeTransactionJournal } from '../accounting/inline-journal-helpers';

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
  SALE_OFFSET: '1100',
  ADJUSTMENT: '1100',
};

const EXPENSE_GL_MAP: Record<string, string> = {
  SALARY: '5100',
  BONUS: '5100',
  ADDITION: '5100',
  DEDUCTION: '5100',
  PENALTY: '5200',
  SALES_DEDUCTION: '5100',
};

export const financialRepo = {

  // ==================== CUSTOMER TRANSACTIONS ====================

  /**
   * Create CustomerTransaction with automatic journal entry
   * 
   * @param tx - Prisma transaction client
   * @param params - Transaction parameters
   * @returns Created CustomerTransaction
   */
  async createCustomerTransaction(tx: any, params: {
    customerId: string;
    type: string;
    amount: number | Decimal;
    description?: string;
    reference?: string;
    createdBy?: string;
    branchId?: string | null;
    method?: string;
    skipJournal?: boolean;
  }) {
    const result = await tx.customerTransaction.create({
      data: {
        customerId: params.customerId,
        type: params.type,
        amount: typeof params.amount === 'number' ? new Decimal(params.amount) : params.amount,
        description: params.description,
        reference: params.reference,
        createdBy: params.createdBy,
        branchId: params.branchId
      }
    });

    // Auto-create journal entry (unless skipped)
    if (!params.skipJournal && Number(params.amount) > 0) {
      try {
        await createCustomerTransactionJournal(tx, {
          customerTransactionId: result.id,
          customerId: params.customerId,
          type: params.type,
          amount: params.amount,
          description: params.description,
          reference: params.reference,
          branchId: params.branchId
        });
      } catch (e) {
        console.error('[FinancialRepo] Failed to create customer journal:', e);
      }
    }
    return result;
  },

  // ==================== SUPPLIER PAYMENTS ====================

  /**
   * Create SupplierPayment with automatic journal entry
   */
  async createSupplierPayment(tx: any, params: {
    supplierId: string;
    amount: number | Decimal;
    method?: string;
    notes?: string;
    paymentDate?: Date;
    branchId?: string | null;
    referenceId?: string;
    skipJournal?: boolean;
  }) {
    const result = await tx.supplierPayment.create({
      data: {
        supplierId: params.supplierId,
        amount: typeof params.amount === 'number' ? new Decimal(params.amount) : params.amount,
        method: params.method || 'CASH',
        notes: params.notes,
        paymentDate: params.paymentDate || new Date(),
        branchId: params.branchId
      }
    });

    if (!params.skipJournal && Number(params.amount) > 0) {
      try {
        await createSupplierPaymentJournal(tx, {
          supplierPaymentId: result.id,
          supplierId: params.supplierId,
          amount: params.amount,
          method: params.method,
          notes: params.notes,
          branchId: params.branchId
        });
      } catch (e) {
        console.error('[FinancialRepo] Failed to create supplier journal:', e);
      }
    }
    return result;
  },

  // ==================== EMPLOYEE TRANSACTIONS ====================

  /**
   * Create EmployeeTransaction with automatic journal entry
   */
  async createEmployeeTransaction(tx: any, params: {
    userId: string;
    type: string;
    amount: number | Decimal;
    description?: string;
    referenceId?: string;
    referenceType?: string;
    branchId?: string | null;
    skipJournal?: boolean;
  }) {
    const result = await tx.employeeTransaction.create({
      data: {
        userId: params.userId,
        type: params.type,
        amount: typeof params.amount === 'number' ? new Decimal(params.amount) : params.amount,
        description: params.description,
        referenceId: params.referenceId,
        referenceType: params.referenceType,
        branchId: params.branchId
      }
    });

    if (!params.skipJournal && Number(params.amount) > 0) {
      try {
        await createEmployeeTransactionJournal(tx, {
          employeeTransactionId: result.id,
          employeeId: params.userId,
          type: params.type,
          amount: params.amount,
          description: params.description,
          branchId: params.branchId
        });
      } catch (e) {
        console.error('[FinancialRepo] Failed to create employee journal:', e);
      }
    }
    return result;
  }
};
