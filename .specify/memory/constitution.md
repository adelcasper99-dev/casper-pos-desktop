<!--
Sync Impact Report:
- Version change: [TEMPLATE] → v1.0.0
- Principal Update: Established initial 5 core principles.
- Added sections: Technology Standards, Security & Compliance.
- Templates requiring updates:
  - .specify/templates/plan-template.md (✅ aligned)
  - .specify/templates/spec-template.md (✅ aligned)
  - .specify/templates/tasks-template.md (✅ aligned)
- Follow-up TODOs: RATIFICATION_DATE set to today's date.
-->

# Casper POS Desktop Constitution

## Core Principles

### I. Offline-First Resilience

The application MUST function fully without internet connectivity. Daily operations—including sales, printing, and inventory management—are executed against local IndexedDB and SQLite storage. Data durability is guaranteed through automated 5-minute mirroring of the browser cache to the local filesystem using native Electron IPC.

### II. Data Integrity & Self-Healing

Local SQLite databases MUST perform integrity checks (`PRAGMA integrity_check`) on every cold start. If operational data is found to be corrupted or lost, the system MUST automatically attempt recovery from the latest filesystem backup. Database optimization (VACUUM) MUST be easily accessible to maintain performance.

### III. Desktop-First Performance

Performance-intensive tasks (database optimization, thermal printing, large data exports) MUST leverage native Electron IPC to minimize browser-thread latency. The POS interface MUST prioritize speed, with features like "Speed Print" providing instant physical feedback with minimal user interaction.

### IV. Premium User Experience

The interface MUST maintain a premium, modern aesthetic using dark mode, glassmorphism, and responsive layouts. Standard browser defaults are rejected in favor of custom-styled components, high-quality Lucide iconography, and curated typography (e.g., Inter, Roboto).

### V. Operational Transparency & Auditability

All system-level actions (backups, vacuuming, support exports) and sensitive business logic (refunds, deletions) MUST provide immediate UI feedback via toasts and background audit logs. Support bundles MUST be exportable to allow for forensic troubleshooting without requiring remote access.

## Technology Standards

Core stack: Electron (Main/Preload), Next.js (Renderer), Prisma (SQLite), Dexie (IndexedDB/Web Cache), TypeScript. All new components MUST be built with accessible semantic HTML and Vanilla CSS, avoiding heavy utility-first frameworks unless explicitly requested for consistency.

## Security & Compliance

Authentication requires secure local sessions. CSRF tokens MUST be enforced for all server-side actions. Local data encryption is a prioritized target for future iterations; currently, data isolation is provided by the Electron sandbox and filesystem permissions.

## Governance

The Casper POS Desktop Constitution supersedes all other documentation. No code changes that degrade offline functionality or compromise data persistence are permitted. Any modification to the data schema MUST include a migration plan or a verified recovery path. Amendments to this document require a MINOR version bump for additions and a MAJOR bump for removals/redefinitions.

**Version**: 1.0.0 | **Ratified**: 2026-02-24 | **Last Amended**: 2026-02-24
