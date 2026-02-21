# Casper POS Desktop — Production Audit & Security Report

**Prepared on:** 2026-02-21
**Target:** Production Release v1.0.0

---

## 1. Executive Summary

This audit ensures the Casper ERP desktop application is production-ready for offline distribution. Key focuses included database integrity, accounting consistency, source code protection, and installer branding.

---

## 2. Audit Findings & Remediation

| ID | Finding | Severity | Resolution |
|---|---|---|---|
| **S-01** | Missing index on `SaleItem.saleId` | Medium | Added `@@index([saleId])` to `prisma/schema.prisma`. |
| **S-02** | Missing index on `SupplierPayment.supplierId` | Low | Added `@@index([supplierId])`. |
| **P-01** | Weak validation for `paymentMethod` in POS | Medium | Tightened `saleSchema` in `src/lib/validation/pos.ts` to use `z.enum`. |
| **R-02** | Partial refund journal entry omitted | **High** | Added `AccountingEngine.recordTransaction` in `partialRefundSale`. |
| **A-01** | Expense journal entry outside DB transaction | **High** | Moved journal creation inside `prisma.$transaction`. |
| **I-01** | Predictable print temp filenames | Low | Switched `Date.now()` to `crypto.randomUUID()`. |
| **P-05** | Source code visible in ASAR | Medium | Implemented V8 bytecode compilation via `bytenode`. |

---

## 3. Offline Portability & Distribution

### Self-Contained Runtime

The app is now fully self-contained. It ships with its own Node.js (via Electron) and Prisma engines.

- **Database:** SQLite DB is automatically initialized in the user's roaming data folder (`%APPDATA%/Casper POS/local.db`).
- **Migrations:** At every startup, the app checks and applies pending database migrations via an embedded Prisma binary.
- **Installer:** The step-by-step NSIS wizard includes branding and a EULA.

---

## 4. Code Signing (Phase 3)

The installer should be signed to avoid Windows Defender SmartScreen warnings.

### Environment Setup

Set these variables on the build machine (CI/CD or local):

- `WIN_CSC_LINK`: Path to your `.pfx` or `.p12` certificate file.
- `WIN_CSC_KEY_PASSWORD`: Password for the certificate.

### Usage

`electron-builder` will detect these variables and automatically sign the setup `.exe` during `npm run dist`.

---

## 5. Source Code Protection

- **Bytenode:** `main.js` and `preload.js` are compiled to V8 bytecode (`.jsc`).
- **Source Maps:** Disabled in `next.config.js`.
- **Minification:** Full minification enabled for all server-side bundles.

---

## 6. Verification Checklist

- [x] Prisma indices applied (`npx prisma db push`)
- [x] Assets generated (`npm run dist:assets`)
- [x] Standalone Next.js build tested (`npm run electron:build`)
- [x] Bytecode loader functional (`electron/main-loader.js`)

**Status: READY FOR PRODUCTION**
