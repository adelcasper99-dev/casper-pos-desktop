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
import { GL, PAYMENT_METHOD_GL_MAP } from '@/shared/constants/accounting-mappings';

// Unified GL maps moved to @/shared/constants/accounting-mappings

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
    const glCode = PAYMENT_METHOD_GL_MAP[params.method] ?? GL.ASSETS.CASH;
    const amount = new Decimal(params.amount.toString());
    
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
              debit: amount, 
              credit: 0, 
              description: 'Cash/Bank Received' 
            },
            { 
              accountId: await this.getAccountId(tx, GL.ASSETS.RECEIVABLES), 
              debit: 0, 
              credit: amount, 
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
      techBillingPrice: number | Decimal;
      techCommissionAmount: number | Decimal;
      centerLaborProfit: number | Decimal;
      branchId?: string;
    }
  ) {
    const amount = new Decimal(params.amount.toString());
    const techBilling = new Decimal(params.techBillingPrice.toString());
    const techComm = new Decimal(params.techCommissionAmount.toString());
    const centerProfit = new Decimal(params.centerLaborProfit.toString());

    const journalEntry = await tx.journalEntry.create({
      data: {
        description: `Maintenance Distribution: Ticket #${params.barcode}`,
        reference: params.ticketId,
        branchId: params.branchId,
        lines: {
          create: [
            { 
              accountId: await this.getAccountId(tx, GL.REVENUE.SERVICE), // Service Revenue (WIP)
              debit: amount, 
              credit: 0, 
              description: 'Service Revenue Reclassification' 
            },
            { 
              accountId: await this.getAccountId(tx, GL.REVENUE.SALES), // Sales Revenue
              debit: 0, 
              credit: techBilling, 
              description: 'Parts Revenue Dist' 
            },
            { 
              accountId: await this.getAccountId(tx, GL.LIABILITIES.ACCRUED_SALARIES), // Accrued Salaries (Liability)
              debit: 0, 
              credit: techComm, 
              description: 'Technician Commission Accrued' 
            },
            { 
              accountId: await this.getAccountId(tx, GL.REVENUE.SALES), // Sales Revenue
              debit: 0, 
              credit: centerProfit, 
              description: 'Center Labor Profit realized' 
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
    const amount = new Decimal(params.amount.toString());
    
    const journalEntry = await tx.journalEntry.create({
      data: {
        description: params.description || `Customer Receipt: ${params.reference || params.customerTransactionId.slice(0, 8)}`,
        reference: params.reference,
        branchId: params.branchId,
        customerTransactionId: params.customerTransactionId,
        lines: {
          create: [
            { 
              accountId: await this.getAccountId(tx, GL.ASSETS.CASH), 
              debit: amount, 
              credit: 0, 
              description: 'Cash Received' 
            },
            { 
              accountId: await this.getAccountId(tx, GL.ASSETS.RECEIVABLES), 
              debit: 0, 
              credit: amount, 
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
    const amount = new Decimal(params.amount.toString());
    
    // Determine credit account based on description (if it's store credit or refund)
    // RF-02: Ensure Store Credit goes to Liability (2150) not Revenue (4000)
    const isStoreCredit = params.description?.toLowerCase().includes('store credit');
    const creditAccountCode = isStoreCredit ? GL.LIABILITIES.STORE_CREDIT : GL.REVENUE.SALES;
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
              accountId: await this.getAccountId(tx, GL.ASSETS.RECEIVABLES), 
              debit: amount, 
              credit: 0, 
              description: 'Customer AR' 
            },
            { 
              accountId: await this.getAccountId(tx, creditAccountCode), 
              debit: 0, 
              credit: amount, 
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
    const glCode = PAYMENT_METHOD_GL_MAP[params.method] ?? GL.ASSETS.CASH;
    const amount = new Decimal(params.amount.toString());
    
    const journalEntry = await tx.journalEntry.create({
      data: {
        description: params.description || `Supplier Payment: ${params.reference || params.supplierPaymentId.slice(0, 8)}`,
        reference: params.reference,
        branchId: params.branchId,
        supplierPaymentId: params.supplierPaymentId,
        lines: {
          create: [
            { 
              accountId: await this.getAccountId(tx, GL.LIABILITIES.PAYABLES), 
              debit: amount, 
              credit: 0, 
              description: 'AP Reduced' 
            },
            { 
              accountId: await this.getAccountId(tx, glCode), 
              debit: 0, 
              credit: amount, 
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
    const amount = new Decimal(params.amount.toString());
    
    const journalEntry = await tx.journalEntry.create({
      data: {
        description: params.description || `Supplier Invoice: ${params.reference || params.supplierPaymentId.slice(0, 8)}`,
        reference: params.reference,
        branchId: params.branchId,
        supplierPaymentId: params.supplierPaymentId,
        lines: {
          create: [
            { 
              accountId: await this.getAccountId(tx, GL.ASSETS.INVENTORY), 
              debit: amount, 
              credit: 0, 
              description: 'Inventory Asset' 
            },
            { 
              accountId: await this.getAccountId(tx, GL.LIABILITIES.PAYABLES), 
              debit: 0, 
              credit: amount, 
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
    const expenseCode = (params.type === 'PENALTY' ? GL.EXPENSES.OPERATION_EXPENSES : GL.EXPENSES.SALARIES);
    const amount = new Decimal(params.amount.toString());
    
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
              debit: amount, 
              credit: 0, 
              description: `${params.type} Expense` 
            },
            { 
              accountId: await this.getAccountId(tx, GL.ASSETS.CASH), 
              debit: 0, 
              credit: amount, 
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
   * 1. Debit Spoilage/Wastage Expense (5600)
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
    const amount = new Decimal(params.amount.toString());
    
    const journalEntry = await tx.journalEntry.create({
      data: {
        description: params.description,
        reference: params.reference,
        branchId: params.branchId,
        lines: {
          create: [
            { 
              accountId: await this.getAccountId(tx, GL.EXPENSES.SPOILAGE), // Spoilage/Wastage Expense
              debit: amount, 
              credit: 0, 
              description: 'Stock Wastage Expense' 
            },
            { 
              accountId: await this.getAccountId(tx, GL.ASSETS.INVENTORY), // Inventory Asset
              debit: 0, 
              credit: amount, 
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
