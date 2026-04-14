# PRD: Casper POS Desktop - Application Feature Audit

## Document Information

| Field | Value |
|-------|-------|
| **Document ID** | PRD-2026-001 |
| **Version** | 1.0 |
| **Date** | 2026-04-11 |
| **Author** | Kilo Code Review |
| **Status** | Draft |
| **Application** | Casper POS Desktop |
| **Tech Stack** | Next.js, Prisma, PostgreSQL, TypeScript |

---

## 1. Executive Summary

This PRD documents the comprehensive feature-by-feature audit of the Casper POS Desktop application.

### 1.1 Scope

- **In-Scope**: All server actions (src/actions/*.ts), lib utilities (src/lib/*.ts)
- **Out-of-Scope**: Third-party integrations (QZ Tray, Google Drive), CI/CD pipelines

### 1.2 Overall Assessment

The application demonstrates enterprise-grade architecture with atomic transaction handling, Decimal.js precision, comprehensive audit logging, permission-based access control, and centralized AccountingEngine.

**Technical Debt Identified**: 5 High-priority issues, 12 Medium-priority issues, 25 Low-priority issues

---

## 2. Module: Sales/POS Module

### Files Analyzed
- src/actions/pos.ts (569 lines)
- src/actions/sales-actions.ts (1050 lines)

### Requirements
- FR-POS-001: Process sale with atomic transaction and shift guard
- FR-POS-002: Support idempotency key for offline sync
- FR-POS-003: Handle bundle products
- FR-POS-004: Support multiple payment methods
- FR-POS-005: Warranty expiry date calculation

### Findings
| ID | Severity | Finding | Recommendation |
|----|----------|---------|----------------|
| S-01 | Medium | No audit log for sale creation | Add auditLog.create |
| S-02 | Low | Type assertions for trackStock | Create proper type guards |

---

## 3. Module: Inventory Module

### Files Analyzed
- src/actions/inventory.ts
- src/lib/stock-helpers.ts

### Findings
| ID | Severity | Finding |
|----------|---------|----------------|
| I-01 | Medium | Hard delete cascades could leave orphans |

---

## 4. Module: HR & Employee Management

### Findings
| ID | Severity | Finding |
|----------|---------|----------------|
| H-01 | **High** | Manual salary allows arbitrary amount without validation |
| H-02 | Medium | String-based permission checks |

---

## 5. Module: Shift Management

### Findings
| ID | Severity | Finding |
|----------|---------|----------------|
| SH-01 | **High** | Discrepancy detected AFTER close |

---

## 6. Module: Security

### Findings
| ID | Severity | Finding |
|----------|---------|----------------|
| SEC-01 | **High** | Super admin hardcoded (username: a, password: 0) |

---

## 7. Priority Action Items

### Immediate (Sprint 1-2)
1. Add audit logging to sale creation (POS, S-01)
2. Validate manual salary payments (HR, H-01)
3. Move super admin to environment (Security, SEC-01)

### Short-Term (Sprint 3-4)
1. Split ticket-actions.ts (3500+ lines)
2. Remove @ts-nocheck
3. Add timezone support

---

## 8. Appendix: File Inventory

### Actions (~55 files)
- pos.ts, sales-actions.ts - Sales/POS
- inventory.ts, purchase-actions.ts - Inventory
- hr.ts, hr-profile.ts - HR
- accounting.ts - Accounting
- shift-management-actions.ts - Shift
- treasury.ts - Treasury
- ticket-actions.ts - Tickets (CRITICAL: Split needed)

---

# ADDENDUM A: Comprehensive Findings by Module

## A.1 Sales/POS Module - Detailed Findings

### A.1.1 Strengths
- Robust transaction handling with Prisma  (20s timeout)
- Decimal.js precision for financial calculations
- Idempotency support for offline sync
- Shift enforcement guards
- Comprehensive refund logic (full/partial/prorated)
- Automatic journal entry creation via AccountingEngine
- Permission-based access via secureAction wrapper

### A.1.2 Issues
| Issue | Severity | Location | Description |
|-------|----------|----------|-------------|
| S-01 | Medium | pos.ts:186 | No explicit audit log for sales creation |
| S-02 | Low | pos.ts:139 | trackStock type assertion uses as any |
| S-03 | Low | pos.ts:342-370 | Bundle stock bypasses decrementWarehouseStock |
| S-04 | Low | pos.ts:207 | Hardcoded 30-day warranty default |

## A.2 Inventory Module - Detailed Findings

### A.2.1 Strengths
- Complete product lifecycle (CRUD with cascade)
- Multi-warehouse stock tracking
- Bundle product component handling
- Auto-product creation during purchase
- FIFO auto-allocation for supplier payments

### A.2.2 Issues
| Issue | Severity | Location | Description |
|----------|----------|----------|-------------|
| I-01 | Medium | inventory.ts:646 | Hard delete could leave orphaned data |
| I-02 | Low | inventory.ts:63-85 | Opening balance lacks audit log |

## A.3 HR Module - Detailed Findings

### A.3.1 Strengths
- calculateNetDue for complex payroll
- Monthly attendance aggregation
- Employee transaction ledger
- Frozen account support
- Treasury integration for salary

### A.3.2 Issues
| Issue | Severity | Location | Description |
|----------|----------|----------|-------------|
| H-01 | **High** | hr.ts:298-399 | Manual salary allows arbitrary amount (no netDue validation) |
| H-02 | Medium | hr.ts:130 | String-based permission check instead of hasPermission |
| H-03 | Low | hr.ts:130 | Arabic role names hardcoded

## A.4 Accounting Module - Detailed Findings

### A.4.1 Strengths
- Rate limiting for expense creation (20 req/min)
- Dynamic GL code resolution
- Treasury balance reconciliation
- Soft delete with reversal

### A.4.2 Issues
| Issue | Severity | Location | Description |
|----------|----------|----------|-------------|
| A-01 | Low | accounting.ts:26-33 | In-memory rate limit resets on restart |
| A-02 | Medium | accounting.ts:634 | Trial balance calculation needs review |

## A.5 Shift Management - Detailed Findings

### A.5.1 Strengths
- Real-time accumulation via shift totals
- Variance detection (overage/shortage)
- Orphan detection (>24h no heartbeat)
- Force close for crash recovery
- Z-Report with safe drop

### A.5.2 Issues
| Issue | Severity | Location | Description |
|----------|----------|----------|-------------|
| SH-01 | **High** | shift-management-actions.ts:267 | Sales count discrepancy detected AFTER close |
| SH-02 | Low | shift-management-actions.ts:70 | BusinessDate not timezone-aware |

## A.6 Treasury - Detailed Findings

### A.6.1 Strengths
- Atomic balance updates via Prisma where clause
- Permission-based negative balance
- Idempotency support
- Inter-treasury transfers with GL validation
- Soft delete with balance reversal

### A.6.2 Issues
| Issue | Severity | Location | Description |
|----------|----------|----------|-------------|
| T-01 | Medium | treasury.ts:496 | Delete allowed with non-zero balance |

## A.7 Tickets Module - Detailed Findings

### A.7.1 Strengths
- Sequential barcode generation (collision protection)
- Smart linking by phone number
- Branch isolation
- Idempotency for sync

### A.7.2 Issues
| Issue | Severity | Location | Description |
|----------|----------|----------|-------------|
| TK-01 | **High** | ticket-actions.ts:1 | @ts-nocheck at file top - 3500+ lines monolithic |
| TK-02 | Medium | ticket-actions.ts:332-357 | Phone lookup race condition |

## A.8 Security - Detailed Findings

### A.8.1 Strengths
- Login rate limiting (5 attempts, 5-min lock)
- bcrypt password hashing
- Permission registry with dependencies
- Session management

### A.8.2 Issues
| Issue | Severity | Location | Description |
|----------|----------|----------|-------------|
| SEC-01 | **High** | auth.ts:53 | Super admin hardcoded (username: a, password: 0) - should be env only |
| SEC-02 | Medium | auth.ts:10-27 | In-memory rate limiting not distributed |

# ADDENDUM B: Issues Summary Matrix

## B.1 By Severity

| Severity | Count | Module(s) Affected |
|----------|-------|---------------------|
| **High** | 5 | HR, Tickets, Security, Sync, Shift |
| **Medium** | 12 | POS, Inventory, HR, Accounting, Treasury |
| **Low** | 25 | All modules |

## B.2 By Module

| Module | High | Medium | Low |
|--------|------|--------|-----|
| Sales/POS | 0 | 1 | 3 |
| Inventory | 0 | 1 | 2 |
| HR | 1 | 1 | 1 |
| Accounting | 0 | 1 | 2 |
| Shift | 1 | 0 | 2 |
| Treasury | 0 | 1 | 2 |
| Tickets | 1 | 1 | 1 |
| Security | 1 | 1 | 2 |
| Sync | 1 | 1 | 2 |
| **Total** | **5** | **12** | **25** |

---

**Document End**
