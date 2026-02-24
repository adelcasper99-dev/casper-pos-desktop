# Research: Baseline Casper POS Desktop

## Decision: IndexedDB with SQLite Mirroring

- **Rationale**: Browser-based IndexedDB provides low-latency local storage for the renderer, while Electron-managed SQLite via Prisma provides durable filesystem persistence. Mirroring ensures data is safe even if browser site data is cleared.
- **Alternatives considered**:
  - Pure SQLite (too slow for frequent renderer UI updates).
  - Pure IndexedDB (too risky; browser data is ephemeral).

## Decision: Electron IPC for "Speed Print"

- **Rationale**: The standard web print dialog is synchronous and blocking. Using Electron's `webContents.print()` via IPC allows for immediate, non-blocking thermal receipt generation.
- **Alternatives considered**:
  - PDF generation (slow).
  - Web Serial API (poor cross-printer compatibility).

## Decision: PRAGMA integrity_check for Data Safety

- **Rationale**: Essential for detecting SQLite corruption on startup. Since this is a POS system, data integrity is paramount.
- **Alternatives considered**:
  - File size checking (doesn't detect logical corruption).
  - Periodic VACUUM (implemented as a maintenance tool instead).

## Decision: Native RTL with HSL Color System

- **Rationale**: Ensures first-class Arabic support and high-fidelity UI design as per the Constitution.
- **Alternatives considered**:
  - Translation-only (fails to provide premium aesthetic).
