---
title: "fix: Radix Dialog accessibility — silence warnings & add sr-only descriptions"
type: fix
status: active
created: 2026-05-04
---

# fix: Radix Dialog Accessibility — Full Remediation

## Problem Frame

Radix UI's `@radix-ui/react-dialog` logs:

```
Warning: Missing `Description` or `aria-describedby={undefined}` for {DialogContent}.
```

…for every `<DialogContent>` that lacks a linked `<DialogDescription>`. With 13+ dialog instances across the codebase, this fires repeatedly and floods the console.

## Scope

- **In scope:** All Radix `<DialogContent>` usages in `src/`.
- **Out of scope:** `GlassModal` (custom portal, not Radix), `AlertDialog` / `Sheet` (not used).

## Current State Inventory

| File | DialogTitle | DialogDescription | Status |
|---|---|---|---|
| `src/components/ui/dialog.tsx` | — | — | ✅ Unit 1 applied |
| `src/components/ui/ReasonDialog.tsx` | ✅ | ❌ | Unit 2 |
| `src/components/ui/ConfirmationModal.tsx` | ✅ | ❌ | Unit 2 |
| `src/components/tickets/TicketDeleteDialog.tsx` | ✅ | ✅ | Compliant |
| `src/components/tickets/TicketQuickEditModal.tsx` | ✅ | ✅ | Compliant |
| `src/components/tickets/wizard/ReturnInitiationModal.tsx` | custom h2 | custom p | Suppressed by Unit 1 |
| `src/components/staff/StaffProfileBadge.tsx` | ✅ | ❌ | Unit 2 |
| `src/components/logs/SalesLog.tsx` | ✅ | ❌ | Unit 2 |
| `src/components/logs/PurchaseLog.tsx` | ✅ | ❌ | Unit 2 |
| `src/components/logs/PartialRefundDialog.tsx` | ✅ | ❌ | Unit 2 |
| `src/components/logs/RefundSelectionDialog.tsx` | ✅ | ❌ | Unit 2 |
| `src/components/logs/PartialReturnPurchaseDialog.tsx` | ✅ | ❌ | Unit 2 |
| `src/components/inventory/WastageDialog.tsx` | ✅ | ❌ | Unit 2 |
| `src/components/inventory/PurchasesTab.tsx` | ✅ | ❌ | Unit 2 |
| `src/components/hr/EmployeeProfileClient.tsx` | ✅ | ❌ | Unit 2 |
| `src/components/hr/EmployeeTransactionModal.tsx` | ✅ | ❌ | Unit 2 |
| `src/components/hr/SalaryPaymentModal.tsx` | ✅ | ❌ | Unit 2 |
| `src/components/hq-dashboard/DrillDownModal.tsx` | ✅ | ❌ | Unit 2 |
| `src/components/customers/CustomerAccountsTab.tsx` | ✅ | ✅ x2 | Compliant |

## Implementation Units

### ✅ Unit 1 — `dialog.tsx` global safety net (DONE)

Added `aria-describedby={undefined}` on `<DialogPrimitive.Content>`. Suppresses the Radix warning for all current and future call sites.

### Unit 2 — `sr-only` descriptions on 13 call sites

Pattern: import `DialogDescription`, add inside `<DialogHeader>` after `<DialogTitle>`:

```tsx
<DialogDescription className="sr-only">{description}</DialogDescription>
```

| File | Description text |
|---|---|
| `src/components/ui/ReasonDialog.tsx` | `أدخل سبباً لإتمام هذا الإجراء.` |
| `src/components/ui/ConfirmationModal.tsx` | reuse `{message}` prop |
| `src/components/staff/StaffProfileBadge.tsx` | `عرض تفاصيل ملف الموظف.` |
| `src/components/logs/SalesLog.tsx` | `تفاصيل الفاتورة المحددة والإجراءات المتاحة.` |
| `src/components/logs/PurchaseLog.tsx` | `تفاصيل فاتورة المشتريات المحددة.` |
| `src/components/logs/PartialRefundDialog.tsx` | `اختر الأصناف وكمياتها لإتمام المرتجع الجزئي.` |
| `src/components/logs/RefundSelectionDialog.tsx` | `حدد طريقة المرتجع وخزينة الاسترداد.` |
| `src/components/logs/PartialReturnPurchaseDialog.tsx` | `اختر الأصناف وكمياتها لإتمام مرتجع المشتريات الجزئي.` |
| `src/components/inventory/WastageDialog.tsx` | `سجّل كميات الهالك أو التلف من المخزون.` |
| `src/components/inventory/PurchasesTab.tsx` | `تفاصيل فاتورة الشراء المحددة.` |
| `src/components/hr/EmployeeProfileClient.tsx` | `تفاصيل الفاتورة ومعلومات الدفع.` |
| `src/components/hr/EmployeeTransactionModal.tsx` | `تسجيل معاملة مالية على حساب الموظف.` |
| `src/components/hr/SalaryPaymentModal.tsx` | `تسجيل صرف راتب أو دفعة للموظف.` |
| `src/components/hq-dashboard/DrillDownModal.tsx` | `تفاصيل تحليلية للفرع أو المجموعة المحددة.` |

### Unit 3 — Verification

- Zero `Warning: Missing Description` in console after opening each dialog.
- No visual change to any dialog.
- Chrome DevTools a11y panel: `role="dialog"` has both `aria-labelledby` and `aria-describedby` wired.
