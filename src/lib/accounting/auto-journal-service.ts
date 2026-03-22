/**
 * Odoo-Style Automatic Journal Entry Service
 * 
 * All financial transactions automatically generate journal entries
 * through this centralized service.
 * 
 * Based on Odoo best practices:
 * - Every financial move creates a journal entry
 * - Double-entry bookkeeping is enforced
 * - All entries are branch-aware for multi-company support
 * - Source document tracking through references
 */
import { prisma } from '@/lib/prisma';
import { Decimal } from '@prisma/client/runtime/library';

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
  DEDUCTION: '5100',
  PENALTY: '5200',
};

export class AutoJournalService {

  /**
   * Helper: Get Account ID from GL code
   */
  private static async getAccountId(tx: any, glCode: string): Promise<string> {
    const account = await tx.account.findUnique({
      where: { code: glCode }
    });
    
    if (!account) {
      throw new Error(`GL Account ${glCode} not found. Run accounting seed.`);
    }
    
    return account.id;
  }

  /**
   * Create journal entry for Customer Payment (AR Reduction)
   * Odoo style: Debit Cash/Bank, Credit AR (1100)
   * 
   * @param tx - Prisma transaction client
   * @param params - Payment details
   * @returns Created journal entry
   */
  static async recordCustomerPayment(
    tx: any,
    params: {
      customerTransactionId: string;
      customerId: string;
      amount: number | Decimal;
      method: string;
      reference?: string;
      description?: string;
      branchId?: string;
    }
  ) {
    const glCode = PAYMENT_GL_MAP[params.method] ?? '1000';
    const amountNum = Number(params.amount);
    
    const journalEntry = await tx.journalEntry.create({
      data: {
        description: params.description || `Customer Payment: ${params.reference || params.customerTransactionId.slice(0, 8)}`,
        reference: params.reference,
        branchId: params.branchId,
        customerTransactionId: params.customerTransactionId,
        lines: {
          create: [
            { 
              accountId: await this.getAccountId(tx, glCode), 
              debit: amountNum, 
              credit: 0, 
              description: 'Cash/Bank Received' 
            },
            { 
              accountId: await this.getAccountId(tx, '1100'), 
              debit: 0, 
              credit: amountNum, 
              description: 'AR Reduced' 
            }
          ]
        }
      },
      include: { lines: true }
    });

    return journalEntry;
  }

  /**
   * Create journal entry for Ticket Profit & Commission Distribution
   * 
   * Balanced Entry:
   * 1. Debit Cash/Bank (1000/1010/1020) - Total Amount
   * 2. Credit Tech AR (1100) - Tech Billing Price (Settle part debt)
   * 3. Credit Employee Payables (2100) - Tech Commission (Accrue liability)
   * 4. Credit Maintenance Revenue (4000) - Center Labor Profit
   */
  static async recordTicketDistribution(
    tx: any,
    params: {
      ticketId: string;
      barcode: string;
      amount: number | Decimal;
      method: string;
      techBillingPrice: number | Decimal;
      techCommissionAmount: number | Decimal;
      centerLaborProfit: number | Decimal;
      branchId?: string;
    }
  ) {
    const glCode = PAYMENT_GL_MAP[params.method] ?? '1000';
    const amountNum = Number(params.amount);
    const techBillingNum = Number(params.techBillingPrice);
    const techCommNum = Number(params.techCommissionAmount);
    const centerProfitNum = Number(params.centerLaborProfit);

    const journalEntry = await tx.journalEntry.create({
      data: {
        description: `Maintenance Distribution: Ticket #${params.barcode}`,
        reference: params.ticketId,
        branchId: params.branchId,
        lines: {
          create: [
            { 
              accountId: await this.getAccountId(tx, glCode), 
              debit: amountNum, 
              credit: 0, 
              description: 'Customer Payment Received' 
            },
            { 
              accountId: await this.getAccountId(tx, '1100'), // AR
              debit: 0, 
              credit: techBillingNum, 
              description: 'Tech Custody Settlement' 
            },
            { 
              accountId: await this.getAccountId(tx, '2100'), // Payables
              debit: 0, 
              credit: techCommNum, 
              description: 'Tech Commission Accrued' 
            },
            { 
              accountId: await this.getAccountId(tx, '4000'), // Revenue
              debit: 0, 
              credit: centerProfitNum, 
              description: 'Center Labor Profit' 
            }
          ]
        }
      },
      include: { lines: true }
    });

    return journalEntry;
  }

  /**
   * Create journal entry for Customer Receipt (Cash received)
   * Odoo style: Debit Cash, Credit Customer AR
   */
  static async recordCustomerReceipt(
    tx: any,
    params: {
      customerTransactionId: string;
      customerId: string;
      amount: number | Decimal;
      reference?: string;
      description?: string;
      branchId?: string;
    }
  ) {
    const amountNum = Number(params.amount);
    
    const journalEntry = await tx.journalEntry.create({
      data: {
        description: params.description || `Customer Receipt: ${params.reference || params.customerTransactionId.slice(0, 8)}`,
        reference: params.reference,
        branchId: params.branchId,
        customerTransactionId: params.customerTransactionId,
        lines: {
          create: [
            { 
              accountId: await this.getAccountId(tx, '1000'), 
              debit: amountNum, 
              credit: 0, 
              description: 'Cash Received' 
            },
            { 
              accountId: await this.getAccountId(tx, '1100'), 
              debit: 0, 
              credit: amountNum, 
              description: 'Customer AR' 
            }
          ]
        }
      },
      include: { lines: true }
    });

    return journalEntry;
  }

  /**
   * Create journal entry for Customer Credit (AR Increase or Store Credit)
   * Odoo style: 
   * - If Store Credit Liability: Debit Customer AR (1100), Credit Store Credit Liability (2150)
   * - If regular AR: Debit Customer AR (1100), Credit Sales/Service Revenue (4000)
   */
  static async recordCustomerCredit(
    tx: any,
    params: {
      customerTransactionId: string;
      customerId: string;
      amount: number | Decimal;
      reference?: string;
      description?: string;
      branchId?: string;
    }
  ) {
    const amountNum = Number(params.amount);
    
    // Determine credit account based on description (if it's store credit or refund)
    // RF-02: Ensure Store Credit goes to Liability (2150) not Revenue (4000)
    const isStoreCredit = params.description?.toLowerCase().includes('store credit');
    const creditAccountCode = isStoreCredit ? '2150' : '4000';
    const creditAccountName = isStoreCredit ? 'Store Credit Liability' : 'Sales Revenue';
    
    const journalEntry = await tx.journalEntry.create({
      data: {
        description: params.description || `Customer Credit: ${params.reference || params.customerTransactionId.slice(0, 8)}`,
        reference: params.reference,
        branchId: params.branchId,
        customerTransactionId: params.customerTransactionId,
        lines: {
          create: [
            { 
              accountId: await this.getAccountId(tx, '1100'), 
              debit: amountNum, 
              credit: 0, 
              description: 'Customer AR' 
            },
            { 
              accountId: await this.getAccountId(tx, creditAccountCode), 
              debit: 0, 
              credit: amountNum, 
              description: creditAccountName 
            }
          ]
        }
      },
      include: { lines: true }
    });

    return journalEntry;
  }

  /**
   * Create journal entry for Supplier Payment (AP Reduction)
   * Odoo style: Debit AP (2000), Credit Cash/Bank
   * 
   * @param tx - Prisma transaction client
   * @param params - Payment details
   * @returns Created journal entry
   */
  static async recordSupplierPayment(
    tx: any,
    params: {
      supplierPaymentId: string;
      supplierId: string;
      amount: number | Decimal;
      method: string;
      reference?: string;
      description?: string;
      branchId?: string;
    }
  ) {
    const glCode = PAYMENT_GL_MAP[params.method] ?? '1000';
    const amountNum = Number(params.amount);
    
    const journalEntry = await tx.journalEntry.create({
      data: {
        description: params.description || `Supplier Payment: ${params.reference || params.supplierPaymentId.slice(0, 8)}`,
        reference: params.reference,
        branchId: params.branchId,
        supplierPaymentId: params.supplierPaymentId,
        lines: {
          create: [
            { 
              accountId: await this.getAccountId(tx, '2000'), 
              debit: amountNum, 
              credit: 0, 
              description: 'AP Reduced' 
            },
            { 
              accountId: await this.getAccountId(tx, glCode), 
              debit: 0, 
              credit: amountNum, 
              description: 'Cash/Bank Paid' 
            }
          ]
        }
      },
      include: { lines: true }
    });

    return journalEntry;
  }

  /**
   * Create journal entry for Supplier Receipt (AP Increase)
   * Odoo style: Debit Inventory/Purchases, Credit AP
   */
  static async recordSupplierReceipt(
    tx: any,
    params: {
      supplierPaymentId: string;
      supplierId: string;
      amount: number | Decimal;
      reference?: string;
      description?: string;
      branchId?: string;
    }
  ) {
    const amountNum = Number(params.amount);
    
    const journalEntry = await tx.journalEntry.create({
      data: {
        description: params.description || `Supplier Invoice: ${params.reference || params.supplierPaymentId.slice(0, 8)}`,
        reference: params.reference,
        branchId: params.branchId,
        supplierPaymentId: params.supplierPaymentId,
        lines: {
          create: [
            { 
              accountId: await this.getAccountId(tx, '1200'), 
              debit: amountNum, 
              credit: 0, 
              description: 'Inventory Asset' 
            },
            { 
              accountId: await this.getAccountId(tx, '2000'), 
              debit: 0, 
              credit: amountNum, 
              description: 'Accounts Payable' 
            }
          ]
        }
      },
      include: { lines: true }
    });

    return journalEntry;
  }

  /**
   * Create journal entry for Employee Payment
   * Odoo style: Debit Salary/Expense (5100/5200), Credit Cash (1000)
   * 
   * @param tx - Prisma transaction client
   * @param params - Payment details
   * @returns Created journal entry
   */
  static async recordEmployeePayment(
    tx: any,
    params: {
      employeeTransactionId: string;
      employeeId: string;
      amount: number | Decimal;
      type: string;
      reference?: string;
      description?: string;
      branchId?: string;
    }
  ) {
    const expenseCode = EXPENSE_GL_MAP[params.type] ?? '5100';
    const amountNum = Number(params.amount);
    
    const journalEntry = await tx.journalEntry.create({
      data: {
        description: params.description || `Employee ${params.type}: ${params.reference || params.employeeTransactionId.slice(0, 8)}`,
        reference: params.reference,
        branchId: params.branchId,
        employeeTransactionId: params.employeeTransactionId,
        lines: {
          create: [
            { 
              accountId: await this.getAccountId(tx, expenseCode), 
              debit: amountNum, 
              credit: 0, 
              description: `${params.type} Expense` 
            },
            { 
              accountId: await this.getAccountId(tx, '1000'), 
              debit: 0, 
              credit: amountNum, 
              description: 'Cash Paid' 
            }
          ]
        }
      },
      include: { lines: true }
    });

    return journalEntry;
  }

  /**
   * Reverse a journal entry (for refunds, voids, etc.)
   * Odoo style: Creates inverted journal entry
   */
  static async reverseJournalEntry(
    tx: any,
    params: {
      originalEntryId: string;
      reason: string;
      reference?: string;
      branchId?: string;
    }
  ) {
    const original = await tx.journalEntry.findUnique({
      where: { id: params.originalEntryId },
      include: { lines: true }
    });

    if (!original) {
      throw new Error(`Original journal entry ${params.originalEntryId} not found`);
    }

    const reversedLines = original.lines.map((line: any) => ({
      accountId: line.accountId,
      debit: line.credit,
      credit: line.debit,
      description: `REVERSAL: ${line.description || params.reason}`
    }));

    const journalEntry = await tx.journalEntry.create({
      data: {
        description: `Reversal of #${original.id.slice(0, 8)}: ${params.reason}`,
        reference: params.reference || `REV-${original.id.slice(0, 8)}`,
        branchId: params.branchId || original.branchId,
        lines: {
          create: reversedLines
        }
      },
      include: { lines: true }
    });

    return journalEntry;
  }

  /**
   * Create journal entry for Stock Wastage / Loss
   * Balanced Entry:
   * 1. Debit Spoilage/Wastage Expense (5200)
   * 2. Credit Inventory Assets (1200)
   */
  static async recordWastageLoss(
    tx: any,
    params: {
      amount: number | Decimal;
      description: string;
      branchId?: string;
      reference?: string;
    }
  ) {
    const amountNum = Number(params.amount);
    
    const journalEntry = await tx.journalEntry.create({
      data: {
        description: params.description,
        reference: params.reference,
        branchId: params.branchId,
        lines: {
          create: [
            { 
              accountId: await this.getAccountId(tx, '5200'), // Spoilage/Wastage Expense
              debit: amountNum, 
              credit: 0, 
              description: 'Stock Wastage Expense' 
            },
            { 
              accountId: await this.getAccountId(tx, '1200'), // Inventory Asset
              debit: 0, 
              credit: amountNum, 
              description: 'Inventory Value Reduced' 
            }
          ]
        }
      },
      include: { lines: true }
    });

    return journalEntry;
  }
}
