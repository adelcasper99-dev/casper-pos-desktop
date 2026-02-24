# Implementation Plan: Baseline Casper POS Desktop

**Branch**: `001-baseline-spec` | **Date**: 2026-02-24 | **Spec**: [spec.md](file:///c:/Users/TheExpert/Downloads/casper%20pos%20desktop/specs/001-baseline-spec/spec.md)
**Input**: Feature specification from `/specs/001-baseline-spec/spec.md`

## Summary

Implement a durable, offline-first foundation for the Casper POS Desktop. This involves a hybrid storage approach (IndexedDB + SQLite mirroring), automated self-healing integrity checks, and a "Speed Print" physical feedback mechanism via Electron IPC.

## Technical Context

**Language/Version**: TypeScript / Node.js 20+  
**Primary Dependencies**: Next.js, Electron, Prisma, Dexie.js, Lucide React  
**Storage**: IndexedDB (Web Cache) mirrored to SQLite (Filesystem)  
**Testing**: Manual Simulation (Offline/Restore), PRAGMA integrity checks  
**Target Platform**: Windows Desktop (Electron)
**Project Type**: Desktop App  
**Performance Goals**: <1s Speed Print, <15s end-to-end checkout
**Constraints**: Fully offline-capable, RTL Arabic support required  
**Scale/Scope**: Local POS operations with background cloud sync

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

- [x] **Offline-First**: Hybrid storage strategy ensures zero-internet functionality.
- [x] **Data Integrity**: Automated PRAGMA checks and filesystem snapshots.
- [x] **Desktop Performance**: IPC-based printing and background mirroring.
- [x] **Premium UX**: Lucide icons and RTL Arabic hardcoded support.
- [x] **Transparency**: Maintenance tools for VACUUM and Export.

## Project Structure

### Documentation (this feature)

```text
specs/001-baseline-spec/
├── plan.md              # This file
├── research.md          # Implementation decisions
├── data-model.md        # Transaction & local-backup schemas
├── quickstart.md        # How to run the baseline
├── contracts/           # IPC & Sync interfaces
└── tasks.md             # Implementation tasks
```

### Source Code (repository root)

```text
src/
├── lib/
│   ├── local-persistence.ts # Mirroring logic
│   ├── offline-db.ts        # IndexedDB/Dexie
│   └── print-service.ts     # IPC print triggers
├── components/
│   ├── pos/
│   │   ├── DesktopStatus.tsx
│   │   └── CheckoutModal.tsx
│   └── Sidebar.tsx
electron/
├── main.js                  # SQLite & FS Handlers
└── preload.js               # IPC Bridge
```

**Structure Decision**: Single project with Electron/Next.js separation. The core logic resides in `src/lib` for reuse across renderer and main processes where applicable.
