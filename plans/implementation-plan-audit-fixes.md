# Implementation Plan: Financial Audit Fixes

**Date:** 2026-03-30  
**Status:** Proposed  
**Priority:** High  
**Estimated Effort:** 4-6 hours

---

## Executive Summary

This plan addresses gaps discovered during the financial audit that could cause inaccurate P&L reporting, improper expense categorization, and missing shift financial tracking components.

---

## 1. Gap Analysis

### 1.1 Critical Gaps

| # | Gap | File | Line | Risk Level | Impact |
|---|-----|------|------|------------|--------|
| G-01 | Hardcoded `5200` in expense creation | `accounting.ts` | 109 | **CRITICAL** | All expenses bypass detailed GL accounts (5210-5270) |
| G-02 | `createExpense` lacks `category` parameter | `accounting.ts` | 28-35 | **CRITICAL** | Cannot route expenses to correct GL without category |
| G-03 | Missing shift financial summary component | `plans/shift-total-return-analysis.md` | - | **HIGH** | No Z-report financial breakdown UI |

### 1.2 Medium Priority Gaps

| # | Gap | File | Line | Risk Level | Impact |
|---|-----|------|------|------------|--------|
| M-01 | `employee-ledger.ts` lacks UUID validation | `employee-ledger.ts` | 12-16 | MEDIUM | Invalid IDs could cause DB errors |
| M-02 | Missing TODO tracking system | Various | - | LOW | 8 TODOs scattered across codebase |

---

## 2. Risk Assessment

### 2.1 Risk Matrix

| Risk | Probability | Impact | Score | Mitigation |
|------|--------------|--------|-------|------------|
| Breaking expense categorization | HIGH | HIGH | **9** | Map legacy categories first, maintain backward compatibility |
| Data inconsistency in P&L | MEDIUM | HIGH | **6** | Add validation, test all GL routes |
| Missing component causes UI error | LOW | MEDIUM | **3** | Create stub component, implement progressively |
| Regression in existing features | MEDIUM | MEDIUM | **6** | Full test suite after changes |

### 2.2 Pre-Implementation Checks

- [ ] Backup database before changes
- [ ] Document current expense categorization behavior
- [ ] Identify all expense categories used in production
- [ ] Map legacy categories to new GL accounts

---

## 3. Success Ratio & Validation

### 3.1 Success Metrics

| Metric | Target | Validation Method |
|--------|--------|-------------------|
| All expenses routed to correct GL | 100% | Query journal entries, verify glCode |
| Zero hardcoded expense accounts | 100% | Code search for `'5200'` in actions |
| Shift totalExpenses accurate | ±1 EGP | Compare sum to manual calculation |
| P&L expense total matches Dashboard | 100% | Cross-reference reports |
| TypeScript compilation | Pass | `npx tsc --noEmit` |

### 3.2 Validation Checklist

```
Before:
- [ ] Document current expense category usage
- [ ] Run: SELECT category, COUNT(*) FROM Expense GROUP BY category

After:
- [ ] npx tsc --noEmit
- [ ] Check journal entries for correct glCode routing
- [ ] Verify ALL_EXPENSE_CODES includes 5210-5270
- [ ] Test each expense category maps correctly
```

---

## 4. Implementation Workflow

### Phase 1: Foundation (30 minutes)

**Objective:** Ensure all infrastructure is in place

#### Step 1.1: Verify Constants
```typescript
// Verify src/lib/accounting/constants.ts
export const ALL_EXPENSE_CODES = [
    '5100', '5110', '5120',  // Payroll
    '5200', '5210', '5220', '5230', '5240', '5250', '5260', '5270',  // G&A
    '5300', '5310', '5320', '5330',  // Marketing
    '5400', '5500', '5600'  // Other
];
```
**Expected:** Already exists ✅

#### Step 1.2: Verify Category Mappings
```typescript
// Verify src/shared/constants/accounting-mappings.ts
export const EXPENSE_CATEGORY_MAP: Record<string, { glCode: string; ... }> = {
    'RENT': { glCode: '5210', ... },
    'UTILITIES': { glCode: '5220', ... },
    // etc.
};
```
**Expected:** Already exists ✅

---

### Phase 2: Fix createExpense Action (60 minutes)

**Objective:** Enable expense category routing in `accounting.ts`

#### Step 2.1: Update Function Signature
**File:** `src/actions/accounting.ts`

**Before:**
```typescript
export const createExpense = secureAction(async (data: {
    description: string;
    amount: number;
    category: string;
    paymentMethod?: string;
    treasuryId?: string;
    csrfToken?: string;
}) => {
```

**After:**
```typescript
import { EXPENSE_CATEGORY_MAP } from "@/shared/constants/accounting-mappings";

export const createExpense = secureAction(async (data: {
    description: string;
    amount: number;
    category: string;  // Maps to EXPENSE_CATEGORY_MAP key
    paymentMethod?: string;
    treasuryId?: string;
    csrfToken?: string;
}) => {
```

#### Step 2.2: Add GL Code Resolution
**File:** `src/actions/accounting.ts:103`

**Before (line 109):**
```typescript
{ accountCode: '5200', debit: data.amount, credit: 0, description: data.category },
```

**After:**
```typescript
// Resolve GL code from category mapping, fallback to 5200 for legacy
const glCode = EXPENSE_CATEGORY_MAP[data.category]?.glCode ?? '5200';

// Validate category exists, warn if falling back
if (!EXPENSE_CATEGORY_MAP[data.category]) {
    console.warn(`[createExpense] Unknown category "${data.category}", routing to 5200 (General)`);
}

lines: [
    { accountCode: glCode, debit: data.amount, credit: 0, description: data.category },
    { accountCode: glCodeForPayment, debit: 0, credit: data.amount, description: `${data.paymentMethod || 'CASH'} Paid` }
]
```

#### Step 2.3: Update Validation Schema
**File:** `src/actions/accounting.ts`

Add to top of file:
```typescript
import { z } from 'zod';

const CreateExpenseSchema = z.object({
    description: z.string().min(1),
    amount: z.number().positive(),
    category: z.string().min(1),
    paymentMethod: z.string().optional(),
    treasuryId: z.string().optional(),
});

export const createExpense = secureAction(async (data: z.infer<typeof CreateExpenseSchema>) => {
    const validated = CreateExpenseSchema.parse(data);
    // Rest of implementation uses validated.*
```

---

### Phase 3: Create FinancialSummaryTable (45 minutes)

**Objective:** Add missing shift financial breakdown component

#### Step 3.1: Create Component
**File:** `src/components/shift/FinancialSummaryTable.tsx`

```typescript
"use client";

import { useMemo } from "react";

interface FinancialSummaryTableProps {
    totalSales: number;
    totalReturns: number;
    totalExpenses: number;
    netCash: number;
    expectedCash: number;
    variance: number;
}

export default function FinancialSummaryTable({
    totalSales,
    totalReturns,
    totalExpenses,
    netCash,
    expectedCash,
    variance
}: FinancialSummaryTableProps) {
    const items = useMemo(() => [
        { label: "إجمالي المبيعات", value: totalSales, color: "text-emerald-600" },
        { label: "المرتجعات", value: -totalReturns, color: "text-red-600" },
        { label: "المصروفات", value: -totalExpenses, color: "text-orange-600" },
        { label: "الصافي", value: netCash, color: "text-blue-600" },
    ], [totalSales, totalReturns, totalExpenses, netCash]);

    return (
        <div className="bg-card rounded-lg p-4 space-y-3">
            {items.map(item => (
                <div key={item.label} className="flex justify-between items-center">
                    <span className="text-sm text-muted-foreground">{item.label}</span>
                    <span className={`font-bold ${item.color}`}>
                        {item.value.toLocaleString('ar-EG')} ج.م
                    </span>
                </div>
            ))}
            {variance !== 0 && (
                <div className={`pt-3 border-t ${variance > 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                    <span className="text-sm">الفرق: </span>
                    <span className="font-black">{Math.abs(variance).toLocaleString('ar-EG')} ج.م</span>
                </div>
            )}
        </div>
    );
}
```

#### Step 3.2: Update ShiftManager (Optional)
Integrate into shift close flow if needed.

---

### Phase 4: Improve Validation (30 minutes)

**Objective:** Add UUID validation to employee-ledger

#### Step 4.1: Update Zod Schema
**File:** `src/actions/employee-ledger.ts`

**Before:**
```typescript
const TransactionSchema = z.object({
    userId: z.string(),
    type: z.enum(["BONUS", "ADDITION", "DEDUCTION", "PENALTY"]),
    amount: z.number().positive(),
    description: z.string().min(1, "Description is required"),
    createdAt: z.date().optional(),
});
```

**After:**
```typescript
const TransactionSchema = z.object({
    userId: z.string().uuid("Invalid user ID format"),
    type: z.enum(["BONUS", "ADDITION", "DEDUCTION", "PENALTY"]),
    amount: z.number().positive(),
    description: z.string().min(1, "Description is required"),
    createdAt: z.date().optional(),
});
```

---

### Phase 5: Documentation (15 minutes)

**Objective:** Create missing plan document

#### Step 5.1: Create shift-total-return-analysis.md
**File:** `plans/shift-total-return-analysis.md`

```markdown
# Shift Total Return Analysis

## Overview
This document describes the shift financial reporting system.

## Components
- `FinancialSummaryTable.tsx` - Displays shift financial summary
- Shift totalExpenses tracking in `accounting.ts`

## Calculations
Net Cash = Sales - Returns - Expenses
Variance = Actual Cash - Expected Cash
```

---

## 5. Step-by-Step Implementation Checklist

### Before Starting
- [ ] Run `git status` to check for uncommitted changes
- [ ] Backup database: `cp prisma/prisma/dev.db prisma/prisma/dev.db.backup`
- [ ] Document current expense behavior

### Phase 1: Verify Infrastructure
- [ ] Verify `ALL_EXPENSE_CODES` includes all 521x-527x accounts
- [ ] Verify `EXPENSE_CATEGORY_MAP` has all categories
- [ ] Check `treasury.ts` uses category mapping correctly

### Phase 2: Fix createExpense
- [ ] Import `EXPENSE_CATEGORY_MAP` in `accounting.ts`
- [ ] Add GL code resolution before journal entry
- [ ] Add fallback to 5200 for unknown categories
- [ ] Test with each expense category

### Phase 3: Create FinancialSummaryTable
- [ ] Create `src/components/shift/FinancialSummaryTable.tsx`
- [ ] Add basic styling matching design system
- [ ] Test rendering with mock data

### Phase 4: Improve Validation
- [ ] Add UUID validation to `employee-ledger.ts`
- [ ] Test with invalid UUID format

### Phase 5: Documentation
- [ ] Create `plans/shift-total-return-analysis.md`
- [ ] Update this plan with completion status

### After Implementation
- [ ] Run `npx tsc --noEmit` - must pass
- [ ] Verify no hardcoded `'5200'` remains in actions
- [ ] Test expense creation for each category
- [ ] Check journal entries have correct glCode

---

## 6. Rollback Plan

If issues occur:

1. **Revert accounting.ts changes:**
   ```bash
   git checkout HEAD -- src/actions/accounting.ts
   ```

2. **Restore database:**
   ```bash
   cp prisma/prisma/dev.db.backup prisma/prisma/dev.db
   ```

3. **Verify system works:**
   - Create test expense
   - Check journal entry

---

## 7. Testing Strategy

### Unit Tests
```bash
# Test GL code resolution
const glCode = EXPENSE_CATEGORY_MAP['RENT']?.glCode;
assert(glCode === '5210');

# Test fallback
const unknown = EXPENSE_CATEGORY_MAP['UNKNOWN']?.glCode;
assert(unknown === undefined);
```

### Integration Tests
1. Create expense with category "RENT"
2. Query journal entry
3. Verify glCode is "5210"

### Manual Testing
1. Open POS
2. Create expense (e.g., Electricity bill)
3. Select category: "كهرباء ومياه" (UTILITIES)
4. Complete transaction
5. Check Accounting > Journal Entries
6. Verify expense posted to 5220

---

## 8. Estimated Timeline

| Phase | Task | Duration | Total |
|-------|------|----------|-------|
| 1 | Foundation verification | 30 min | 30 min |
| 2 | Fix createExpense | 60 min | 90 min |
| 3 | Create FinancialSummaryTable | 45 min | 135 min |
| 4 | Improve validation | 30 min | 165 min |
| 5 | Documentation | 15 min | 180 min |
| - | Buffer for testing/fixes | 30 min | 210 min |

**Total Estimated:** 3.5 hours

---

## 9. Success Criteria

- [ ] `createExpense` routes to correct GL based on category
- [ ] `EXPENSE_CATEGORY_MAP` is used instead of hardcoded `5200`
- [ ] Unknown categories fallback to `5200` with warning
- [ ] `FinancialSummaryTable` component exists and renders
- [ ] `employee-ledger.ts` validates UUID format
- [ ] All TypeScript compiles without errors
- [ ] No regression in existing functionality

---

**Prepared by:** Kilo AI  
**Review Status:** Pending Approval