# Shift Total Return Analysis

**Document:** Technical Specification  
**Date:** 2026-03-30  
**Status:** Implemented

---

## 1. Overview

The shift financial reporting system tracks and displays cash flow metrics during a POS operational shift. It enables branch managers to reconcile expected vs. actual cash at shift closing.

## 2. Components

### 2.1 FinancialSummaryTable Component

**Location:** `src/components/shift/FinancialSummaryTable.tsx`

**Purpose:** Display shift financial summary with:
- Total Sales (POS revenue)
- Returns (refunds)
- Expenses
- Net Cash
- Expected vs. Actual Variance

**Props:**
```typescript
interface FinancialSummaryTableProps {
    totalSales: number;
    totalReturns: number;
    totalExpenses: number;
    netCash: number;
    expectedCash: number;
    variance: number;
    currencySymbol?: string;
    className?: string;
}
```

**Usage:**
```tsx
<FinancialSummaryTable
    totalSales={15000}
    totalReturns={500}
    totalExpenses={2000}
    netCash={12500}
    expectedCash={12600}
    variance={-100}
/>
```

### 2.2 Shift Financial Tracking

**Location:** `src/actions/accounting.ts` (createExpense)

The `totalExpenses` field in the Shift model is updated when expenses are recorded:

```typescript
if (currentShift?.id) {
    await tx.shift.update({
        where: { id: currentShift.id },
        data: {
            totalExpenses: { increment: validated.amount }
        }
    });
}
```

## 3. Data Flow

```
┌─────────────┐     ┌──────────────┐     ┌─────────────────┐
│ POS Sale    │────▶│ Shift Update │────▶│ Journal Entry   │
│ (Cash In)   │     │ +Sales       │     │ DR: Asset (1000)│
└─────────────┘     └──────────────┘     │ CR: Revenue(4000)│
                                         └─────────────────┘

┌─────────────┐     ┌──────────────┐     ┌─────────────────┐
│ Expense     │────▶│ Shift Update │────▶│ Journal Entry   │
│ (Cash Out)  │     │ +Expenses    │     │ DR: GL (52xx)   │
└─────────────┘     └──────────────┘     │ CR: Asset       │
                                         └─────────────────┘
```

## 4. Calculations

### Net Cash Formula
```
Net Cash = Total Sales - Total Returns - Total Expenses
```

### Variance Formula
```
Variance = Actual Cash - Expected Cash
```

### Expected Cash Calculation
```
Expected Cash = Opening Cash + Net Cash
```

## 5. GL Account Mapping

Expenses are routed to specific GL accounts based on category:

| Category | GL Code | Account Name |
|----------|---------|--------------|
| RENT | 5210 | Rent Expense |
| UTILITIES | 5220 | Electricity & Water |
| INTERNET | 5230 | Internet & Communications |
| MAINTENANCE | 5240 | Maintenance & Repairs |
| CLEANING | 5250 | Cleaning & Hospitality |
| OFFICE_SUPPLIES | 5260 | Office Supplies |
| MISC_GENERAL | 5270 | Misc. General Expenses |
| * (unknown) | 5200 | General & Admin Expenses |

## 6. Shift Lifecycle

### Open Shift
1. User initiates shift with starting cash
2. `shift.startCash` is recorded
3. Shift status = `OPEN`

### During Shift
1. Sales add to `shift.totalSales`
2. Returns deduct from `shift.totalSales`
3. Expenses add to `shift.totalExpenses`
4. All transactions linked via `shiftId`

### Close Shift
1. User enters actual cash count
2. System calculates variance
3. Shift status = `CLOSED`
4. Financial summary generated

## 7. Related Files

| File | Purpose |
|------|---------|
| `src/actions/shift-management-actions.ts` | Open/close shift logic |
| `src/actions/accounting.ts` | Expense creation with GL routing |
| `src/components/shift/ShiftManager.tsx` | UI for shift operations |
| `src/components/shift/FinancialSummaryTable.tsx` | Financial display |
| `src/components/shift/CashInOutModal.tsx` | Cash in/out operations |
| `src/lib/accounting/constants.ts` | GL account definitions |
| `src/shared/constants/accounting-mappings.ts` | Category to GL mapping |

## 8. Security Considerations

- [x] Expense creation requires `ACCOUNTING_MANAGE` permission
- [x] Shift operations require authenticated session
- [x] Treasury balance validation before deduction
- [x] Audit logging for all financial transactions
- [x] UUID validation on all entity references

## 9. Testing Checklist

- [ ] Create expense with RENT category → verifies 5210 GL
- [ ] Create expense with unknown category → verifies 5200 fallback
- [ ] Open shift, record expenses, close shift → verifies totalExpenses
- [ ] Check journal entry has correct glCode for each category
- [ ] Verify financial summary calculates variance correctly

---

**Author:** Kilo AI  
**Last Updated:** 2026-03-30