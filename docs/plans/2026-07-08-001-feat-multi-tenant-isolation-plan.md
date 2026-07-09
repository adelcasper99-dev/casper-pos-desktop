---
title: Multi-Tenant Architecture Hardening & Isolation
type: feat
status: active
created: 2026-07-08
---

# Multi-Tenant Architecture Hardening & Isolation

This plan details the implementation of a bulletproof, "Defense-in-Depth" multi-tenant architecture for Casper ERP. It guarantees absolute data isolation between different businesses (tenants) operating on the same Cloud VPS, while supporting the existing offline-first "Octopus" sync model.

## User Review Required

> [!CAUTION]
> **Database Migrations:** Implementing Row Level Security (RLS) requires raw SQL migrations that alter table permissions globally. Once enforced, any Prisma query that fails to set the `app.current_tenant_id` context will return zero records or throw a permissions error.

> [!IMPORTANT]  
> **PgBouncer & Connection Pooling Leakage:** To prevent session variables from leaking between pooled connections, we MUST use `SET LOCAL` instead of `SET`. This ensures the session variable destroys itself at the end of the transaction.

## Problem Frame & Scope

**Problem:** Relying solely on developers to remember to include `where: { tenantId }` in every Prisma query is prone to human error and poses a critical data-leak risk in a shared-VPS environment.

**Scope Boundaries:**
- **In Scope:** Prisma Client Extensions for automatic `tenantId` injection, PostgreSQL RLS for database-level enforcement, Next.js middleware for tenant extraction, and Super Admin bypassing logic.
- **Out of Scope:** Changing the actual offline-first Sync Worker payload structure.

## Key Decisions & Rationale

1. **Defense-in-Depth Isolation:** We will use Prisma Extensions (Application Layer) AND PostgreSQL RLS (Database Layer).
2. **Cloud-First Registration:** Local setups will only activate via a Cloud-generated `activationCode`.
3. **Session Leakage Prevention:** Use `SET LOCAL` inside Prisma `$transaction` blocks.
4. **Raw Query Safety:** Create a mandatory wrapper for `prisma.$queryRaw` to enforce tenant context, since Prisma Extensions don't intercept raw queries.
5. **Super Admin Access:** Use a special `tenantId = 'SYSTEM'` or PostgreSQL `BYPASSRLS` role to allow the Super Admin to view aggregated cloud data without RLS blocking them.

---

## Proposed Changes

### 1. Database Layer (PostgreSQL RLS)
Enforce isolation at the storage level.

#### [NEW] `prisma/migrations/20260708000000_enable_rls/migration.sql`
- Write raw SQL migration to `ALTER TABLE` and `ENABLE ROW LEVEL SECURITY` on all tenant-aware tables (e.g., Invoices, Products, Customers).
- Create a policy that includes the Super Admin bypass:
  ```sql
  CREATE POLICY tenant_isolation ON "Table" 
  USING (
    current_setting('app.current_tenant_id') = 'SYSTEM' 
    OR 
    "tenantId" = current_setting('app.current_tenant_id')
  );
  ```

### 2. Prisma Layer (Application Enforcement)
Automate `tenantId` injection and secure raw queries.

#### [NEW] `src/lib/prisma-tenant-extension.ts`
- Create a Prisma Client Extension using `$extends`.
- Intercept `findMany`, `findFirst`, `update`, `delete`, and `create` operations to inject `where: { tenantId }`.

#### [MODIFY] `src/lib/db.ts`
- Integrate the `prisma-tenant-extension`.
- Provide a secure wrapper for `$transaction` that uses `SET LOCAL`:
  ```typescript
  await tx.$executeRaw`SET LOCAL app.current_tenant_id = ${context.tenantId}`;
  ```
- **[NEW]** Add a `secureRawQuery` wrapper to ensure raw SQL queries also receive the tenant context before execution.

### 3. Context & Network Layer
Extract the tenant context safely from incoming requests.

#### [MODIFY] `src/middleware.ts`
- Extract subdomain or custom header (`X-Tenant-ID`).
- Reject the request immediately with `401 Unauthorized` if the `tenantId` is missing or invalid.

#### [MODIFY] `src/app/api/sync/route.ts` (Sync Engine Endpoint)
- Extract `tenantId` securely from the authenticated Sync JWT (not the payload).
- Reject the sync if the JWT `tenantId` does not match the payload data.

---

## Verification Plan

### Automated Tests
- **RLS Bypass Test:** Write a unit test that attempts to execute a raw SQL query `SELECT * FROM Invoices` without setting `app.current_tenant_id`. Assert that it returns 0 rows.
- **Cross-Tenant Leak Test:** Authenticate as Tenant A, attempt to query a resource belonging to Tenant B using its UUID. Assert a `NotFound` or `PermissionDenied` error.
- **Super Admin Test:** Authenticate with `tenantId = 'SYSTEM'` and verify all records are returned.
- **Connection Leak Test:** Simulate concurrent requests with PgBouncer to ensure `SET LOCAL` properly destroys the context after the transaction.
