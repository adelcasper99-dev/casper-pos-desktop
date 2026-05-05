---
title: Financial Precision and Strict TypeScript Hardening
category: best-practices
problem_type: knowledge
tags: [decimal.js, typescript, type-safety, financial-precision, prisma]
---

# Financial Precision and Strict TypeScript Hardening

## Context
During the Phase 2 hardening of Casper POS Desktop, it was identified that critical financial aggregations and user inputs were using plain JavaScript floating-point arithmetic (e.g., `parseFloat` and standard addition). Furthermore, frontend components interacting with the backend Prisma models were utilizing implicit `any` types for state management and payload typing, leading to potential null-pointer crashes and masking strict contract violations.

## Guidance
1. **Never use floats for monetary values.** All financial logic (sums, parsing, calculations) must flow through `Decimal.js`.
2. **Handle Invalid Decimal Inputs Defensively.** When instantiating `Decimal` from user-provided strings, wrap it in a `try/catch` block. Empty strings or non-numeric characters will throw a `[DecimalError] Invalid argument` which crashes the application silently if left unhandled.
3. **Null-Coalescing in Aggregation.** Always use `?? 0` when reducing or summing Prisma values since `null` entries stringified into `"null"` will cause `Decimal` exceptions.
4. **Enforce Strict Schema Contracts.** Avoid `as any` type casting. Create explicit Typescript interfaces that exactly match Prisma `include` payloads, and enforce exact string enums for properties like `paymentMethod`.

## Why This Matters
- **Data Corruption Risk**: Using standard Javascript floats causes precision loss (e.g. `0.1 + 0.2 = 0.30000000000000004`). In an Odoo-style double-entry accounting core, drifting decimals completely desynchronize Trial Balances and GL entries, leading to severe financial consequences.
- **Runtime Stability**: Supplying `any` to complex nested objects from a Prisma API call means the component blindly trusts the shape. A strict interface guarantees that the component breaks at compile-time (`npx tsc --noEmit`) rather than runtime.
- **Crash Prevention**: Providing strong safety nets (`try/catch`) over parsing and explicit `> 0` validation checks protects database stability from malicious or malformed entries.

## When to Apply
- When developing any module handling invoices, payments, refunds, taxes, or HR payroll.
- When passing arrays from Prisma queries into React state hooks.
- When users can manually input numbers intended for a ledger record.

## Examples

### 1. Defensive Decimal Parsing
```typescript
let paymentAmount: number;
try {
    paymentAmount = new Decimal(paymentData.amount).toDecimalPlaces(2).toNumber();
} catch (e) {
    toast.error('Invalid amount format');
    return;
}

if (paymentAmount <= 0) {
    toast.error('Amount must be greater than zero');
    return;
}
```

### 2. Null-Safe Financial Reduction
```typescript
const totalOwed = customers
    .reduce((sum, c) => (c.balance ?? 0) > 0 ? sum.add(new Decimal(c.balance || 0)) : sum, new Decimal(0))
    .toDecimalPlaces(2).toNumber();
```

### 3. Strict State Typing over `any`
```typescript
// ❌ WRONG
const [paymentData, setPaymentData] = useState({ amount: '', method: 'CASH' as any });
const [sourceItems, setSourceItems] = useState<any[]>([]);

// ✅ CORRECT
const [paymentData, setPaymentData] = useState<{ amount: string, method: 'CASH' | 'VISA' | 'WALLET' | 'INSTAPAY' }>({ amount: '', method: 'CASH' });

export interface StockWithProduct {
    id: string;
    productId: string;
    quantity: number;
    product: {
        name: string;
        sku: string;
        sellPrice: number;
    };
}
const [sourceItems, setSourceItems] = useState<StockWithProduct[]>([]);
```
