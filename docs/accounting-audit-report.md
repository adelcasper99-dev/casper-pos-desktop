# Accounting Module Audit Report

**Date:** 2026-03-16  
**Project:** Casper POS Desktop  
**Audit Scope:** Accounting Models, Relations, and Schema

---

## 1. Schema Overview

### 1.1 Core Accounting Models

| Model | Lines | Purpose |
|-------|-------|---------|
| **Account** | 203-213 | Chart of Accounts (GL codes) |
| **JournalEntry** | 215-231 | Accounting transactions header |
| **JournalLine** | 233-245 | Individual debit/credit lines |
| **Transaction** | 565-587 | Treasury/cash movements |
| **Treasury** | 549-563 | Branch-level cash management |
| **Expense** | 589-599 | Expense tracking |

### 1.2 Related Financial Models

| Model | Accounting Link |
|-------|-----------------|
| **Sale** | `journalEntries[]` |
| **PurchaseInvoice** | `journalEntries[]` |
| **CustomerTransaction** | Manual accounting entries |
| **SupplierPayment** | Manual accounting entries |

---

## 2. Chart of Accounts (GL)

**Location:** `src/lib/accounting/constants.ts`

### Default Accounts (44 accounts)

| Code | Name | Type |
|------|------|------|
| 1000 | Cash in Hand | ASSET |
| 1010 | Petty Cash | ASSET |
| 1020 | Cash in Treasury / Wallet | ASSET |
| 1100 | Accounts Receivable | ASSET |
| 1200 | Inventory Asset | ASSET |
| 1300 | Fixed Assets | ASSET |
| 1310 | Accumulated Depreciation | ASSET |
| 2000 | Accounts Payable | LIABILITY |
| 2100 | Sales Tax Payable | LIABILITY |
| 2150 | Store Credit Liability | LIABILITY |
| 2200 | Accrued Expenses | LIABILITY |
| 3000 | Owner's Equity / Capital | EQUITY |
| 3100 | Retained Earnings | EQUITY |
| 3200 | Owner's Drawings | EQUITY |
| 4000 | Sales Revenue | REVENUE |
| 4100 | Service Revenue | REVENUE |
| 4200 | Sales Returns | REVENUE |
| 4300 | Sales Discounts | REVENUE |
| 4400 | Other Income | REVENUE |
| 5000 | Cost of Goods Sold | EXPENSE |
| 5100 | Salaries & Wages Expense | EXPENSE |
| 5200 | General & Admin Expenses | EXPENSE |
| 5300 | Marketing & Advertising | EXPENSE |
| 5400 | Depreciation Expense | EXPENSE |
| 5500 | Cash Over/Short | EXPENSE |
| 5600 | Inventory Spoilage | EXPENSE |

---

## 3. Relationship Audit

### 3.1 ✅ WORKING Relations

| From | To | Type | Implementation |
|------|-----|------|----------------|
| JournalEntry | Sale | Optional 1:1 | `saleId` FK |
| JournalEntry | PurchaseInvoice | Optional 1:1 | `purchaseId` FK |
| JournalEntry | Expense | Optional 1:1 | `expenseId` FK |
| JournalLine | Account | Required N:1 | `accountId` FK |
| JournalLine | JournalEntry | Required N:1 | `journalEntryId` FK (Cascade) |
| Transaction | Treasury | Optional N:1 | `treasuryId` FK |
| Transaction | Shift | Optional N:1 | `shiftId` FK |
| Treasury | Branch | Required N:1 | `branchId` FK |
| Expense | Shift | Optional N:1 | `shiftId` FK |
| Sale | JournalEntry | 1:N | ✅ Correctly implemented |

### 3.2 ⚠️ Potential Issues Found

#### Issue #1: CustomerTransaction has NO JournalEntry Link
**Location:** `model CustomerTransaction` (lines 161-174)
```prisma
model CustomerTransaction {
  id          String   @id @default(uuid())
  customerId  String
  type        String
  amount      Decimal
  description String?
  reference   String?
  createdBy   String?
  createdAt   DateTime @default(now())
  customer    Customer @relation(fields: [customerId], references: [id])
  // ❌ MISSING: No journalEntries relation!
}
```
**Impact:** Customer payments/receipts are recorded in CustomerTransaction but don't create accounting journal entries automatically.

**Current Workaround:** Manual calls to `AccountingEngine.recordTransaction()` in:
- `customer-actions.ts:370` - Customer payments
- `ticket-actions.ts:820,1024,1265` - Ticket payments
- `sales-actions.ts:309,323` - Sale payments

#### Issue #2: SupplierPayment has NO JournalEntry Link
**Location:** `model SupplierPayment` (lines 191-201)
```prisma
model SupplierPayment {
  id          String   @id @default(uuid())
  supplierId  String
  amount      Decimal
  notes       String?
  paymentDate DateTime @default(now())
  method      String   @default("CASH")
  supplier    Supplier @relation(fields: [supplierId], references: [id])
  // ❌ MISSING: No journalEntries relation!
}
```

#### Issue #3: EmployeeTransaction has NO JournalEntry Link
**Location:** `model EmployeeTransaction` (lines 850-862)
```prisma
model EmployeeTransaction {
  id            String   @id @default(uuid())
  userId        String
  type          String
  amount        Decimal
  description   String?
  referenceId   String?
  referenceType String?
  createdAt     DateTime @default(now())
  user          User     @relation(fields: [userId], references: [id])
  // ❌ MISSING: No journalEntries relation!
}
```

**Impact:** Salary payments, bonuses, and deductions are recorded but may not automatically create journal entries.

---

## 4. Transaction Flow Analysis

### 4.1 Sale Transaction Flow ✅
```
Sale Created
  ├── SalePayment created
  ├── Transaction (Treasury) created ──→ Treasury.balance updated
  ├── CustomerTransaction created (if credit)
  └── AccountingEngine.recordSale()
      └── JournalEntry + JournalLines
          ├── Debit: Cash/Bank/AR (payment method)
          └── Credit: Sales Revenue (4000)
              ├── [+ COGS entries if tracked]
              └── [+ Tax entries if enabled]
```

### 4.2 Purchase Transaction Flow ✅
```
Purchase Invoice Created
  ├── PurchaseItem created
  ├── Transaction (Treasury) created (if paid)
  └── AccountingEngine.recordPurchase()
      └── JournalEntry + JournalLines
          ├── Debit: Inventory Asset (1200)
          ├── Credit: Cash (if paid)
          └── Credit: Accounts Payable (2000) (if deferred)
```

### 4.3 Expense Transaction Flow ✅
```
Expense Created
  ├── Transaction (Treasury) created ──→ Treasury.balance updated
  ├── Shift.totalExpenses updated (if shift open)
  └── AccountingEngine.recordTransaction()
      └── JournalEntry + JournalLines
          ├── Debit: Expense Account (5200/5100/etc)
          └── Credit: Cash (1000)
```

### 4.4 Refund Transaction Flow ✅
```
Refund Processed
  ├── Sale created (isReturn: true)
  ├── Transaction (Treasury) created ──→ Treasury.balance updated (+)
  ├── CustomerTransaction created (if account refund)
  ├── Shift totals updated
  └── AccountingEngine.recordSaleReturn() OR recordRefund()
      └── JournalEntry + JournalLines
          ├── Debit: Sales Revenue (4000) - reversal
          ├── Credit: Cash/AR/Wallet
          ├── [+ COGS reversal if physical items]
          └── [+ Spoilage if damaged items]
```

---

## 5. Accounting Engine Coverage

### 5.1 Implemented Methods ✅

| Method | Location | Purpose |
|--------|----------|---------|
| `recordTransaction` | transaction-factory.ts:55 | Generic double-entry |
| `recordSale` | transaction-factory.ts:111 | Sales revenue |
| `recordPurchase` | transaction-factory.ts:162 | Purchase invoices |
| `recordExpense` | transaction-factory.ts:194 | Manual expenses |
| `recordRefund` | transaction-factory.ts:210 | Refunds (sale/ticket) |
| `recordSaleReturn` | transaction-factory.ts:267 | Detailed sale returns |
| `recordWastage` | transaction-factory.ts:333 | Inventory spoilage |

### 5.2 Payment Method GL Mapping ✅

**Location:** `transaction-factory.ts:31-45`

| Payment Method | GL Code | Account |
|----------------|---------|---------|
| CASH | 1000 | Cash in Hand |
| VISA/CARD/BANK | 1010 | Petty Cash/Bank |
| VODAFONE_CASH/INSTAPAY/WALLET | 1020 | Treasury/Wallet |
| DEFERRED/ACCOUNT | 1100 | Accounts Receivable |
| STORE_CREDIT | 2150 | Store Credit Liability |

---

## 6. Identified Gaps & Risks

### 6.1 Critical Gaps

| # | Gap | Severity | Risk |
|---|-----|----------|------|
| 1 | **CustomerTransaction** - No automatic journal entries | HIGH | AR reconciliation issues |
| 2 | **SupplierPayment** - No automatic journal entries | HIGH | AP reconciliation issues |
| 3 | **EmployeeTransaction** - No automatic journal entries | MEDIUM | Salary expense tracking gaps |
| 4 | **Shift Adjustment** - No journal entries | MEDIUM | Cash variance not tracked in GL |
| 5 | **Ticket Revenue** - Service revenue (4100) vs Sales (4000) | LOW | Revenue categorization |

### 6.2 Potential Data Integrity Issues

| # | Issue | Current Behavior |
|---|-------|------------------|
| 1 | Expense deletion | Soft-deletes Transaction, reverses Treasury, hard deletes Expense (line 214) - Journal orphaned |
| 2 | Transaction update | Treasury balance reconciled on update (lines 326-354) ✅ |
| 3 | Soft delete reversal | Correctly reverses Treasury balance (lines 392-400) ✅ |

---

## 7. Recommendations

### 7.1 High Priority

1. **Add JournalEntry relations to transactional models:**
   ```prisma
   model CustomerTransaction {
     journalEntries JournalEntry[]
   }
   
   model SupplierPayment {
     journalEntries JournalEntry[]
   }
   
   model EmployeeTransaction {
     journalEntries JournalEntry[]
   }
   ```

2. **Create automatic journal entry triggers** for:
   - Customer payments (AR reduction)
   - Supplier payments (AP reduction)
   - Salary disbursements

### 7.2 Medium Priority

1. Add Shift Adjustment to accounting:
   ```prisma
   model ShiftAdjustment {
     journalEntries JournalEntry[]
   }
   ```

2. Implement contra-revenue accounts properly:
   - 4200 Sales Returns - currently credited to 4000
   - 4300 Sales Discounts - currently debited to 4000

### 7.3 Low Priority

1. Consider adding branch-level accounting:
   - Filter journal entries by treasury/branch
   - Multi-branch trial balance

2. Add audit trail for all journal entry modifications

---

## 8. Summary

| Category | Status |
|----------|--------|
| Schema Design | ✅ Solid - Proper FK relations |
| Journal Entry System | ✅ Working - Double-entry enforced |
| Treasury Integration | ✅ Working - Balance tracking |
| Sale/Purchase Accounting | ✅ Complete |
| Expense Accounting | ✅ Complete |
| Refund Accounting | ✅ Complete with COGS |
| Customer AR | ⚠️ Manual - Needs automation |
| Supplier AP | ⚠️ Manual - Needs automation |
| Employee Expenses | ⚠️ Manual - Needs automation |

**Overall Assessment:** The accounting system is well-implemented for core retail operations. The main gaps are in automated journal entries for customer/supplier/employee transactions, which currently rely on manual calls to `AccountingEngine`.
