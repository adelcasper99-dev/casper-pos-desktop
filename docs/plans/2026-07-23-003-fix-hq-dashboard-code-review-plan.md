# fix: HQ Dashboard Code-Review Remediation

> Created: 2026-07-23 | Origin commit: `27625ac` (feat: hq sales pipeline + staff override tabs) | Hardened via `/ironclad-review`

Nine findings across correctness, security, performance, and maintainability. Plan resolves all nine, incorporating confirmed architecture decisions and Ironclad review hardening.

---

## Resolved Architecture & Security Decisions

1. **DB Optimization (`casper-hq/page.tsx`)**: Use `Promise.all([prisma.tenant.findMany(...), prisma.user.findMany(...)])` for concurrent DB fetching.
2. **CSRF Consistency (`TechSupportTab.tsx`)**: Use `generateCSRFToken()` from `@/lib/csrf-client` for all client-side POST payloads.
3. **Zod Input Bounds (`renewLicenseSchema`)**: Constrain `durationDays` with `z.number().int().positive().max(3650)`.
4. **Audit Trail (`staff-generate/route.ts`)**: Add structured audit logging for Staff Override token issuance.

---

## Proposed Changes

### ① [NEW] Shared Classification Utility

#### [NEW] `src/lib/hq-metrics.ts`

Extract all tenant-classification business logic into a pure module.

**Classification priority order (strict):**
```
1. !isActive OR licenseStatus === "REVOKED"  → expiredOrSuspended
2. !primaryLic OR daysRemaining <= 0         → expiredOrSuspended
3. createdDaysAgo <= 14 AND !primaryLic      → trial
4. daysRemaining <= 7                         → expiringSoon
5. createdDaysAgo <= 14 AND daysRemaining <= 30 AND licenseStatus !== "ACTIVE" → trial
6. else                                       → active
```

Exports: `classifyTenant`, `computePipelineMetrics`, `LIFETIME_YEAR_THRESHOLD = 2090`

---

### ② Server Actions & API Routes

#### [MODIFY] `src/actions/hq-tenant-actions.ts`

- `revokeLicense` (P1 IDOR): Verify `license.tenantId === tenantId` before `$transaction`.
- `renewLicense` (P2): Guard Lifetime licenses (`year > 2090`) and enforce `z.number().int().positive().max(3650)`.

#### [MODIFY] `src/app/api/admin/license/staff-generate/route.ts`

- Add audit log `[STAFF_OVERRIDE_ISSUED]` with session user metadata.

---

### ③ Page Layer — Performance

#### [MODIFY] `src/app/(admin)/casper-hq/page.tsx`

Parallelize queries using `Promise.all`:
```typescript
const [tenants, primaryUsers] = await Promise.all([
  prisma.tenant.findMany({ include: { licenses: true }, orderBy: { createdAt: 'desc' } }),
  prisma.user.findMany({ select: { tenantId: true, username: true, roleStr: true }, orderBy: { createdAt: 'asc' } })
]);
```

---

### ④ React Components

#### [MODIFY] `src/components/hq/HQDashboardClient.tsx`
Use `computePipelineMetrics` from `src/lib/hq-metrics.ts`.

#### [MODIFY] `src/components/hq/TenantsManagementTab.tsx`
- Add `useEffect` to sync `activeFilter` when `initialFilter` prop changes.
- Replace inline filter logic with `classifyTenant`.

#### [MODIFY] `src/components/hq/TechSupportTab.tsx`
Attach `csrfToken` from `generateCSRFToken()` to `/api/admin/license/staff-generate` POST payload.

---

### ⑤ Tests

#### [NEW] `src/actions/__tests__/hq-tenant-actions.test.ts`
Unit tests for `renewLicense` and `revokeLicense` covering happy paths, float rejection, Lifetime guards, and cross-tenant IDOR protection.
