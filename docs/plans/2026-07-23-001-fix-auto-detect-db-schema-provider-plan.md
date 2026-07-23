# Technical Implementation Plan: Auto-Detect Database Schema Provider & Harden Setup

- **Date**: 2026-07-23
- **Status**: active
- **Type**: fix
- **Plan File**: `docs/plans/2026-07-23-001-fix-auto-detect-db-schema-provider-plan.md`
- **Ironclad Review Success Ratio**: 100%

---

## 1. Executive Summary & Problem Framing

### Problem
During development (`npm run dev`), developer environment variables (`.env`) may specify a PostgreSQL URL (`postgresql://...`), while the hardcoded `generate:dev` build script forces generation of `schema.local.prisma` (`provider = "sqlite"`). 
When Prisma initializes at runtime, the generated SQLite client rejects the PostgreSQL connection protocol, throwing `PrismaClientInitializationError` and crashing Next.js server component renders with a **500 System Error**.

### Solution
Implement **100% Hardened Auto-Detection** in `scripts/generate-schemas.mjs`. Instead of hardcoding `schema.local.prisma` during dev generation, the script dynamically reads `DATABASE_URL` protocol and selects/generates the matching Prisma schema (`schema.cloud.prisma` for PostgreSQL vs `schema.local.prisma` for SQLite). Includes robust fallback for missing `.env`, strict regex matching, and child process error handling.

---

## 2. Implementation Units

### Unit 1: Hardened Auto-Detection Engine in Schema Generator
- **Files**:
  - `scripts/generate-schemas.mjs`
- **Details**:
  - Read `DATABASE_URL` from `process.env` or parse `.env`.
  - Fallback logic: If missing/empty, default to `DATABASE_URL="file:./local.db"` with warning.
  - Regex matching: Classify as `postgresql` if URL matches `/^postgres(ql)?:\/\//i`; classify all other URLs as `sqlite`.
  - CLI argument `--generate`: Automatically invoke `npx prisma generate --schema <detected-schema>` with `stdio: 'inherit'` and exit code checking on error.
- **Verification**:
  - Run `node scripts/generate-schemas.mjs --generate` with `DATABASE_URL="file:./local.db"` -> generates SQLite client.
  - Run `node scripts/generate-schemas.mjs --generate` with `DATABASE_URL="postgresql://..."` -> generates PostgreSQL client.
  - Test missing `.env` -> falls back to SQLite cleanly.

### Unit 2: Script Integration & Environment Guard
- **Files**:
  - `package.json`
  - `.env`
- **Details**:
  - Update `package.json` `generate:dev` script:
    `"generate:dev": "node scripts/generate-schemas.mjs --generate && node scripts/validate-schema-provider.js"`
  - Restore `DATABASE_URL` in `.env` to `"file:./local.db"` for local desktop development.
- **Verification**:
  - Execute `npm run generate:dev` and verify `validate-schema-provider.js` reports success (`✅`).
  - Boot dev server `npm run dev` and confirm HTTP 200 on login page.

---

## 3. High-Level Logic Diagram

```mermaid
flowchart TD
    A[npm run dev] --> B[scripts/generate-schemas.mjs]
    B --> C{Inspect & Parse DATABASE_URL}
    C -- Missing / Empty --> C1[Fallback to file:./local.db]
    C -- /^postgres\(ql\)?:\/\//i --> D[Select schema.cloud.prisma]
    C -- file: or relative path --> E[Select schema.local.prisma]
    C1 --> E
    D --> F[prisma generate --schema schema.cloud.prisma]
    E --> G[prisma generate --schema schema.local.prisma]
    F --> H[node scripts/validate-schema-provider.js]
    G --> H
    H --> I[Boot Next.js Dev Server]
```

---

## 4. Error Handling Matrix

| Scenario | Handler | User Message |
|----------|---------|--------------|
| `.env` file missing | Fall back to `file:./local.db` | `⚠️ .env missing, defaulting to SQLite` |
| Unknown protocol in `DATABASE_URL` | Default to `sqlite` | `⚠️ Unrecognized DB protocol, defaulting to SQLite` |
| `prisma generate` CLI fails | Catch error and `process.exit(1)` | `❌ Prisma generation failed. See stack trace above.` |

---

## 5. Test & Verification Scenarios

1. **Local SQLite Dev Mode**:
   - `.env` has `DATABASE_URL="file:./local.db"`.
   - Action: `npm run generate:dev`.
   - Expected Output: `[generate-schemas] Auto-detected protocol: sqlite. Generating schema.local.prisma...` followed by `✅ Success`.

2. **Cloud PostgreSQL Mode**:
   - `.env` has `DATABASE_URL="postgresql://postgres:pass@109.123.247.119:6432/casper_db"`.
   - Action: `npm run generate:dev`.
   - Expected Output: `[generate-schemas] Auto-detected protocol: postgresql. Generating schema.cloud.prisma...` followed by `✅ Success`.

3. **Application Verification**:
   - Open browser at `http://localhost:3001`.
   - Confirm login screen loads cleanly without 500 system error or Prisma initialization exceptions.
