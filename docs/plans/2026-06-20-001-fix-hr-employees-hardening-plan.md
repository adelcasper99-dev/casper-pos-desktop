---
status: active
plan_type: fix
created: 2026-06-20
deepened: 2026-06-20
origin_review: "Code review artifact — HR Employees Module Full Review (2026-06-20)"
---

# fix: HR Employees Module — Hardening & Correctness

## Problem Frame

A full adversarial code review of the HR Employees module surfaced **24 issues** across 4 severity tiers. The most critical are financial correctness bugs: salary payment validation uses the wrong month, treasury balance is checked with floats, and digital payment methods (BANK, INSTAPAY, WALLET) never deduct from treasury balances despite GL entries being recorded. Secondary issues include two dead UI elements, an N+1 DB query pattern in the directory, and a race condition in the polling loop.

**Scope:** All 9 HR components + `src/actions/hr.ts`. No schema changes. No new features — pure correctness and UX hardening.

---

## User Review Required

> [!CAUTION]
> **P1-04 (Treasury for digital payments)** changes the behavior of salary payments made via BANK/INSTAPAY/WALLET. Currently these methods record no treasury deduction. After this fix, the UI will require selecting a treasury for **all** payment methods. Units 1 + 2 **must be deployed atomically** — deploying Unit 1 (server) before Unit 2 (UI) creates a window where all BANK/INSTAPAY/WALLET salary payments return a server error.

> [!IMPORTANT]
> **P2-01 (Date state lift)** removes `EmployeeDirectory`'s internal month navigator and instead receives `filterDate` as a prop from `HRClient`. The directory will no longer have independent month selection — it will always follow the HR dashboard month.

> [!WARNING]
> **P2-02 (N+1 to bulk query)** is a significant rewrite of `getStaffDirectory`. Deferred to a dedicated plan — too high risk to bundle here.

---

## Open Questions

> [!IMPORTANT]
> **P1-05 (Quick-adjust +50 EGP):** **Decision required before Unit 6.** Recommended approach: keep the buttons but add a 500ms debounce and a 5-second undo chip ("تم إضافة +50 ج.م. [تراجع]"). Full removal reduces batch-attendance speed by ~3x for teams >15 people. Confirm this UX direction.

> [!IMPORTANT]
> **P2-04 (hireDate guard):** Make `hireDate` optional on the server — only write it if explicitly provided. The DB column must be nullable for this to work. Confirm schema allows null `hireDate`.

---

## Confirmed Facts (Pre-Implementation Verification)

The following were verified against source before writing implementation units:

- `locale` is in scope in `EmployeeProfileClient` via `useLocale()` (L85).
- `router` is in scope via `useRouter()` (L86).
- `monthStr` is already a prop of `EmployeeProfileClient` (L76–L80) — no new plumbing needed.
- `kpis.totalBonuses` **exists** in the `ProfileData.kpis` interface (L64) and is populated by `hr-profile.ts`. This is distinct from `salary-utils.ts`'s top-level `totalBonuses` return — the profile action maps it into `kpis` before returning. The plan's Unit 4 fix is correct.
- `ConfirmationModal` `children` prop confirmed rendered at L74–L77 of `src/components/ui/ConfirmationModal.tsx`.
- `Decimal` is already imported in `EmployeeProfileClient` (L12). No new import needed.
- `getHRDashboardSummary` is a server action — `AbortController` cannot cancel it. The correct race condition fix is an `isMounted`/stale-flag ref + month-change debounce (not `AbortController`).

---

## Proposed Changes

### Unit 1 — Financial Precision & Payroll Month Fix (`src/actions/hr.ts`)

**Priority: P0/P1 — Deploy atomically with Unit 2.**

#### [MODIFY] `src/actions/hr.ts`

**Fix P0-01:** `payEmployeeSalary` hardcodes `now` for netDue validation window.
- `monthStr` is already accepted as a prop by `EmployeeProfileClient` and passed into the existing `getEmployeeProfileData` call — no new URL plumbing needed.
- Add `monthStr?: string` to `payEmployeeSalary`'s input type.
- Derive `start`/`end` from `monthStr` if provided (`YYYY-MM` format via `new Date(monthStr + '-01')`), else fall back to current month.
- `SalaryPaymentModal` (Unit 2) will forward the prop it already receives.

**Fix P0-02:** Treasury balance check uses `Number()` instead of `Decimal`.
- Replace `Number(treasury.balance) < data.amount` with:
  ```ts
  const balanceDec = new Decimal(treasury.balance.toString())
  if (balanceDec.lt(amountDec)) { ... }
  ```
- `amountDec` is already constructed from `data.amount` earlier in the function — reuse it.

**Fix P1-04 (server side):** Treasury required for all payment methods, not just CASH.
- Change `if (data.paymentMethod === 'CASH' && !data.treasuryId)` → `if (!data.treasuryId)`.
- Update error message: `"الخزينة أو الحساب المصرفي مطلوب لجميع طرق الدفع"`.

**Fix P2-04:** `updateEmployeeData` blocks all updates when `hireDate` is null.
- Remove the hard `if (!data.hireDate) return error` guard.
- In `updateData`, set `hireDate` only if `data.hireDate` is explicitly a non-empty string/date. If `data.hireDate` is `null` or empty, omit the field from the Prisma `update` call (preserving DB value).
- Note: if the DB column has a `NOT NULL` constraint, this also means clearing hireDate is impossible — the guard can stay but the error message should be improved to "تاريخ التعيين مطلوب للموظفين الجدد فقط".

**Test scenarios:**
- `payEmployeeSalary` with `monthStr: '2026-01'` called in February → validates against January netDue
- `payEmployeeSalary` without `monthStr` → falls back to current month (backward compat)
- Treasury balance exactly `1000.00` against payment of `1000.00` → passes (no float rejection)
- BANK payment without `treasuryId` → returns `"الخزينة أو الحساب المصرفي مطلوب..."` error
- `updateEmployeeData` called with `hireDate: null` → preserves existing DB value, does not error

---

### Unit 2 — Salary Payment UI Alignment (`src/components/hr/SalaryPaymentModal.tsx`)

**Priority: P1/P0 — Deploy atomically with Unit 1 in the same release.**

#### [MODIFY] `src/components/hr/SalaryPaymentModal.tsx`

**Fix P1-04 (UI side):** Always show treasury picker for all payment methods.
- Remove the `{formData.paymentMethod === 'CASH' && ...}` conditional wrapper.
- Treasury `<Select>` is always rendered regardless of payment method.
- Add loading skeleton (`animate-pulse`) while `getAllTreasuries` is fetching — disable the select and submit button until treasuries are loaded to prevent empty-treasury submission.
- Label: Show `"الخزينة"` when `paymentMethod === 'CASH'`, `"الحساب البنكي / المحفظة"` for all other methods. Use a computed label variable:
  ```ts
  const treasuryLabel = formData.paymentMethod === 'CASH' ? 'الخزينة' : 'الحساب / المصدر'
  ```

**Fix P3-04:** Remove dynamic `import('@/actions/hr')` inside `useEffect`.
- `getAllTreasuries` is already statically imported at the module level. Call it directly.

**Fix P3-06:** Remove unused `useRouter` import and `const router = useRouter()`.

**Fix UX-04 (suggestedAmount ↔ monthStr consistency):**
- Accept `monthStr?: string` prop (forwarded from `EmployeeProfileClient`).
- Pass `monthStr` in the `payEmployeeSalary` payload.
- Note: `suggestedAmount` is pre-computed for the profile's month (which equals `monthStr`) — no mismatch exists because `EmployeeProfileClient` always derives both from the same `monthStr` prop.

**Test scenarios:**
- Modal opens with BANK selected → treasury picker is visible with label "الحساب / المصدر"
- Modal opens with CASH selected → treasury picker visible with label "الخزينة"
- Modal opens → treasury select shows skeleton → loads options → submit enabled
- No treasury selected on submit → client validation blocks with `toast.error`
- `getAllTreasuries` called once on open (no dynamic import)

---

### Unit 3 — Transaction Modal Financial Precision (`src/components/hr/EmployeeTransactionModal.tsx`)

**Priority: P1.**

#### [MODIFY] `src/components/hr/EmployeeTransactionModal.tsx`

**Fix P1-03:** `parseFloat` used for monetary amounts.
- Wrap amount parsing in a `try/catch` using `new Decimal(formData.amount)` before submitting.
- If the Decimal constructor throws (invalid input like `"abc"`, `""`), call `toast.error("المبلغ المدخل غير صحيح")` and return early.
- Pass `amountDec.toNumber()` to the server action.
- Apply to both the MANUAL path (`upsertEmployeeTransaction`) and the ATTENDANCE path (`updateAttendanceEntry`).

**Fix P3-06:** Remove unused `useRouter` import and `const router = useRouter()`.

**Test scenarios:**
- Amount `"abc"` → Decimal throws → toast error, submit blocked
- Amount `"1234.56"` → parses correctly, submits
- Amount `"0"` → blocked by existing `!formData.amount` guard (guard runs before Decimal parse)
- ATTENDANCE mode: bonus/deduction amounts validated same way

---

### Unit 4 — EmployeeProfileClient Fixes (`src/components/hr/EmployeeProfileClient.tsx`)

**Priority: P0 (audit), P1 (dead search), P2 (projection, labels, routing), P3 (fake IDs).**

#### [MODIFY] `src/components/hr/EmployeeProfileClient.tsx`

**Fix P0-03:** Hardcoded deletion reason in audit trail.
- Add `deletionReason` state (`string`, default `''`).
- When `pendingAction.type === 'DELETE_TX'`, render inside `ConfirmationModal`'s `children` prop:
  ```tsx
  <div className="space-y-2">
    <label className="text-xs font-bold text-zinc-500 uppercase tracking-widest">
      سبب الحذف (مطلوب — 3 أحرف على الأقل)
    </label>
    <textarea
      value={deletionReason}
      onChange={e => setDeletionReason(e.target.value)}
      className="w-full bg-white/5 border border-white/10 rounded-xl p-3 text-sm resize-none min-h-[80px]"
      placeholder="اكتب سبب حذف هذه الحركة..."
    />
  </div>
  ```
- Block the `onConfirm` handler if `deletionReason.trim().length < 3`: show `toast.error("يرجى كتابة سبب الحذف")` and return without closing.
- Pass `deletionReason` to `deleteEmployeeTransaction` / `deleteAttendanceEntry` instead of the hardcoded string.
- Reset `deletionReason` to `''` on **both** `onClose` AND after `onConfirm` completes (whether success or error).

**Fix P1-06:** Dead ledger search input.
- Add `ledgerSearch` state (`string`, default `''`).
- Wire the existing search `<input>` to `value={ledgerSearch}` and `onChange={e => setLedgerSearch(e.target.value)}`.
- Derive `filteredLedger` from `ledgerEntries` before the render loop:
  ```ts
  const filteredLedger = ledgerSearch.trim()
    ? ledgerEntries.filter(e =>
        e.description?.toLowerCase().includes(ledgerSearch.toLowerCase()) ||
        LEDGER_TYPE_LABELS[e.type]?.includes(ledgerSearch)
      )
    : ledgerEntries
  ```
- Add a zero-results empty state below the table when `filteredLedger.length === 0`:
  ```tsx
  <div className="py-12 text-center text-zinc-500 text-sm font-bold">
    لا توجد نتائج مطابقة لـ "{ledgerSearch}"
    <button onClick={() => setLedgerSearch('')} className="block mx-auto mt-2 text-cyan-400 underline">
      مسح البحث
    </button>
  </div>
  ```
- Define `LEDGER_TYPE_LABELS: Record<string, string>` mapping type enums to Arabic (e.g., `SALARY_PAYMENT: 'راتب'`, `BONUS: 'مكافأة'`, etc.) for Arabic-language type search support.

**Fix P2-05:** Salary projection unstable on day 1 or after lump-sum bonuses.
- `kpis.totalBonuses` is available in the `ProfileData.kpis` interface (confirmed at L64).
- Change the projection formula to separate base from bonuses:
  ```ts
  // Project only the accrued base salary, add bonuses as a fixed delta
  const projectedBase = currentDay >= 3
    ? new Decimal(kpis.baseSalary).dividedBy(currentDay).times(daysInMonth)
    : new Decimal(kpis.baseSalary)  // too early in month to project reliably
  const projectedNet = isCurrentMonth
    ? projectedBase.plus(kpis.totalBonuses).minus(kpis.totalDeductions).toNumber()
    : null
  ```
- This ensures a single day-1 bonus doesn't get amplified by `× 30`.

**Fix P2-07:** Raw ticket status enum shown to Arabic users.
- Add a `TICKET_STATUS_LABELS` constant (derived from `src/components/tickets/TicketsList.tsx` L205):
  ```ts
  const TICKET_STATUS_LABELS: Record<string, string> = {
    DRAFT: 'مسودة',
    PENDING: 'في الانتظار',
    IN_PROGRESS: 'جارٍ التنفيذ',
    COMPLETED: 'مكتملة',
    READY_AT_BRANCH: 'جاهزة بالفرع',
    DELIVERED: 'تم التسليم',
    PAID_DELIVERED: 'مدفوع ومسلّم',
    REJECTED: 'مرفوضة',
    CANCELLED: 'ملغية',
    VOIDED: 'ملغاة',
    RETURNED_FOR_REFIX: 'إعادة إصلاح',
    PICKED_UP: 'تم الاستلام',
  }
  ```
- Replace `{ticket.status}` with `{TICKET_STATUS_LABELS[ticket.status] ?? ticket.status}`.

**Fix P2-08:** "فتح التذكرة" button does nothing.
- Add `onClick`: `router.push(`/${locale}/maintenance/tickets/${ticket.id}`)`.
- `locale` is in scope via `useLocale()` (confirmed L85), `router` via `useRouter()` (L86).

**Fix P3-05:** Fake ledger entry ID.
- Replace `ID: {entry.status}-{idx}` with `ID: {entry.id ?? `${entry.status}-${idx}`}`.
- Virtual base-salary rows have no `id` by design — the fallback remains.

**Pass `monthStr` to SalaryPaymentModal:**
- Add `monthStr={monthStr}` prop to `<SalaryPaymentModal>` — `monthStr` is already a prop of `EmployeeProfileClient` (L76–L80).

**Test scenarios:**
- Delete TX with reason < 3 chars → toast error, modal stays open
- Delete TX with reason ≥ 3 chars → submits, modal closes, `deletionReason` resets to `''`
- Cancel delete → modal closes, `deletionReason` resets to `''`
- Ledger search "مكافأة" → only matching entries visible
- Ledger search "راتب" → SALARY_PAYMENT entries visible (via type label map)
- Ledger search with no matches → empty state with "مسح البحث" button
- Day 1 with a 5000 EGP bonus: projection shows `baseSalary + 5000 - deductions`, not amplified
- `PAID_DELIVERED` ticket → shows "مدفوع ومسلّم"
- "فتح التذكرة" click → navigates to `/ar/maintenance/tickets/{id}`
- Manual ledger entry → shows real UUID (not STATUS-idx)

---

### Unit 5 — HRClient & EmployeeDirectory State Consolidation

**Priority: P1 (race condition), P2 (duplicate date), P3 (cleanup).**

#### [MODIFY] `src/app/(routes)/hr/HRClient.tsx`

**Fix P1-01:** Polling race condition + 10s interval.

The correct pattern for server actions (which cannot be aborted via `AbortController`):
```ts
// Add refs
const isFetchingRef = useRef(false)      // prevents concurrent fetches
const mountedRef = useRef(true)          // prevents setState after unmount

useEffect(() => {
  mountedRef.current = true
  return () => { mountedRef.current = false }
}, [])
```

In `fetchSummary`:
```ts
const fetchSummary = async () => {
  if (isFetchingRef.current) return  // drop concurrent call
  isFetchingRef.current = true
  setIsLoadingSummary(true)
  try {
    const res = await getHRDashboardSummary({ month: ..., year: ... })
    if (!mountedRef.current) return   // component unmounted
    if (res?.success && res.data) setSummary(res.data)
  } catch (err) {
    if (mountedRef.current) console.error(...)
  } finally {
    isFetchingRef.current = false
    if (mountedRef.current) setIsLoadingSummary(false)
  }
}
```

- Increase polling from `10000ms` to `60000ms`.
- Add 300ms debounce on `currentDate` changes (via `useEffect` with a timeout before calling `fetchSummary`).
- Type `res` as `{ success: boolean; data?: { expectedSalaries: number; totalAbsences: number; employeeCreditSales: number } }` — no `any`.

**Fix P2-01 / P3-02:** Single source of truth for month.
- Pass `filterDate={currentDate}` and `onFilterDateChange={setCurrentDate}` down to `<EmployeeDirectory>`.

**Fix P3-01:** "اليوم" button resets tab to `'directory'`.
- Change handler: `() => { setCurrentDate(new Date()); setActiveTab('directory') }`.

#### [MODIFY] `src/components/hr/EmployeeDirectory.tsx`

- Remove internal `filterDate` state, `nextMonth`, `prevMonth`, date navigator JSX.
- Accept `filterDate: Date` and `onFilterDateChange: (d: Date) => void` as required props.
- Replace `useState<any[]>([])` with proper interface:
  ```ts
  interface StaffMember {
    id: string
    name: string
    username: string
    role: string
    branch: string
    salary: number
    effectiveSalary: number
    netDue: number
    kpis: {
      completedTickets: number
      returnCount: number
      delayedTickets: number
      successRatio: number
      maintenanceCommissions: number
    }
    status: 'ONLINE' | 'OFFLINE'
    clockInTime: Date | null
    avatarSeed: string
    hireDate: Date | null
  }
  ```
- Fix financial footer totals — replace `Number()` reduce with `Decimal.js`:
  ```ts
  import { Decimal } from 'decimal.js'
  // ...
  const totalSalary = filteredStaff
    .reduce((sum, s) => sum.plus(new Decimal(s.salary.toString())), new Decimal(0))
    .toNumber()
  const totalNetDue = filteredStaff
    .reduce((sum, s) => sum.plus(new Decimal(s.netDue.toString())), new Decimal(0))
    .toNumber()
  ```
- `Decimal` is not currently imported in `EmployeeDirectory.tsx` — add the import.
- Remove orphaned "تعديل سريع" button (`Users` icon with dead onClick comment).

**Test scenarios:**
- Rapidly clicking prev/next month 5× → only last-requested month data commits to state
- Slow connection: two fetches in flight → second fetch is dropped by `isFetchingRef` guard
- After 60s idle → silent refresh, no loading flash
- "اليوم" button while on attendance tab → tab switches to directory AND month resets
- Directory footer total matches server-computed netDue sum (Decimal verified)
- `StaffMember[]` type: TypeScript compiler catches shape mismatches

---

### Unit 6 — DailyAttendance UX Hardening (`src/components/hr/DailyAttendance.tsx`)

**Priority: P1 (quick-adjust), P2 (rollback, popover).**

#### [MODIFY] `src/components/hr/DailyAttendance.tsx`

**Fix P1-05 (pending open question decision):**
- **If "keep with debounce + undo":** Add a 500ms debounce to `handleQuickAdjustment`. After the server call succeeds, show a `toast.success` with an "تراجع" action button that re-calls `handleStatusChange` with the reverted value.
- **If "remove":** Delete `handleQuickAdjustment` function and the two shortcut buttons inside the financial panel.
- ⚠️ Do not implement this until the open question is answered.

**Fix P2-03:** Optimistic rollback on server error.
- Before the optimistic `setLogs(...)`, capture the previous value:
  ```ts
  const previousLog = logs[userId]
  setLogs(prev => ({ ...prev, [userId]: { ... } }))  // optimistic update
  const res = await upsertDailyLog(...)
  if (!res.success) {
    setLogs(prev => ({ ...prev, [userId]: previousLog ?? { userId, status: 'PRESENT' } }))
    toast.error(res.error || 'فشل حفظ الحضور')
    setLoadingId(null)
    return
  }
  ```

**Fix P2-06:** Popover and late-entry tooltip close on outside click.
- Use `createPortal` to render the backdrop outside the `overflow-x-auto` container, preventing scroll interception:
  ```tsx
  import { createPortal } from 'react-dom'
  // ...
  {(financialUserId !== null || lateEntryUserId !== null) && createPortal(
    <div
      className="fixed inset-0 z-40"
      onClick={() => { setFinancialUserId(null); setLateEntryUserId(null) }}
    />,
    document.body
  )}
  ```
- The financial panel and late-entry tooltip remain `z-50` (above backdrop).
- `createPortal` requires `'use client'` — `DailyAttendance.tsx` does not currently have this directive. Add `'use client'` at the top of the file.

**Test scenarios:**
- Server error on attendance change → UI reverts to previous status, toast shows server message
- Server success → UI stays at new status (no flicker)
- Open financial panel, click outside table area → panel closes via backdrop
- Open late entry tooltip, click outside → closes via backdrop
- Scroll the table horizontally while no panel open → unaffected by backdrop (backdrop only renders when panel is open)
- Quick-adjust (post-decision): verify behavior matches chosen approach

---

### Unit 7 — P3 Cleanup

**Priority: P3 — batch with any unit.**

#### [MODIFY] `src/components/hr/EmployeeDirectory.tsx`
- When `staff.length === 200`, show a warning banner below the table footer:
  ```tsx
  {staff.length >= 200 && (
    <div className="mt-4 p-3 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-600 dark:text-amber-400 text-xs font-bold text-center">
      ⚠️ يتم عرض أول 200 موظف فقط — تواصل مع المطور لتفعيل الصفحات
    </div>
  )}
  ```

#### [MODIFY] `src/actions/hr.ts`
- Add comment above both `take: 200` occurrences:
  `// Safety hard-limit. Pagination deferred. Warn UI if count hits this limit.`

---

## Implementation Sequencing

```
┌─────────────────────────────────────────────┐
│  Unit 1 (hr.ts)  +  Unit 2 (SalaryPaymentModal) │  ← Single atomic release
└─────────────────────────────────────────────┘
         ↓
┌──────────────┐  ┌──────────────┐
│  Unit 3      │  │  Unit 4      │  ← Parallel
│  (TxModal)   │  │  (Profile)   │
└──────────────┘  └──────────────┘
         ↓
┌──────────────┐  ┌──────────────┐
│  Unit 5      │  │  Unit 6      │  ← Parallel (Unit 6 after open question resolved)
│  (HRClient + │  │  (Daily      │
│  Directory)  │  │  Attendance) │
└──────────────┘  └──────────────┘
         ↓
┌──────────────┐
│  Unit 7      │  ← Any time
│  (Cleanup)   │
└──────────────┘
```

---

## Patterns to Follow

- **Decimal.js for money:** `new Decimal(value.toString())` — never `Number()` or `parseFloat()` on monetary values. Pattern: `src/actions/hr.ts` `getHRDashboardSummary` bulk loop.
- **Server action concurrency guard:** `isFetchingRef.current` boolean + `mountedRef.current` unmount guard. Do NOT use `AbortController` — it has no effect on server actions.
- **ConfirmationModal children slot:** Renders `{children}` between message and buttons (`src/components/ui/ConfirmationModal.tsx` L74–L77). Use it to embed the deletion reason textarea.
- **Ticket status map source:** `src/components/tickets/TicketsList.tsx` L205. Copy the relevant keys.
- **createPortal for overlays inside overflow containers:** Import from `react-dom`. Required when the popover parent has `overflow-x-auto`.
- **secureAction return type:** Always `{ success: boolean; data?: T; error?: string }`. Type the `res` variable explicitly.

---

## Verification Plan

| Unit | Manual Check |
|---|---|
| 1+2 | Pay prior-month salary via profile page → validates correct month. Pay via BANK without treasury → server error returned. INSTAPAY payment → treasury deducted, GL correct. |
| 2 | Open SalaryPaymentModal with BANK → treasury picker shows "الحساب / المصدر". Loading skeleton visible on open before treasuries load. |
| 3 | Type "abc" in amount field → submit blocked with Arabic toast. |
| 4 | Delete ledger entry with 2-char reason → blocked. With 4-char reason → proceeds. Cancel → reason resets to empty. Search "مكافأة" → filtered. No-result state visible when nothing matches. "فتح التذكرة" → navigates. Day-1 projection not amplified. |
| 5 | Rapid month changes → no desync between summary and directory. 60s idle → silent refresh. "اليوم" on attendance tab → tab resets + month resets. Footer totals verified as Decimal-correct. |
| 6 | Server error on attendance mark → UI reverts. Click outside popover → closes. Horizontal table scroll unaffected when no popover open. |

---

## Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Unit 1+2 deployed out of sync → BANK payments break | Medium | **Critical** | Mark as single atomic release. CI/CD deploy gate. |
| `createPortal` SSR incompatibility (Unit 6) | Low | Medium | Wrap in `typeof document !== 'undefined'` check. |
| hireDate column is `NOT NULL` in DB schema — P2-04 fix silently fails | Low | Low | Check Prisma schema before implementing. If `NOT NULL`, improve error message instead of removing guard. |
| Quick-adjust removal (pending decision) upsets HR workflow speed | Medium | Medium | Resolved by debounce+undo approach (pending approval). |

---

## Out of Scope (Deferred)

- **P2-02 (N+1 → bulk query in `getStaffDirectory`)** — High-risk rewrite. Needs a dedicated plan with before/after output comparison test harness.
- **Pagination for staff > 200** — Requires UI redesign. Unit 7 adds a warning banner as stop-gap.
- **Accessibility sprint** (`aria-pressed`, focus trap in modals) — Separate sprint.
- **Pre-existing permission mismatch in `payEmployeeSalary`** (`MANAGE_USERS` outer vs `HR_MANAGE_PAYROLL` inner) — Separate security fix, out of scope here.
