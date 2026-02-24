# Tasks: Baseline Casper POS Desktop

**Input**: Design documents from `/specs/001-baseline-spec/`
**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/

**Tests**: Test tasks are included below as TDD is recommended for ensuring offline data integrity.

**Organization**: Tasks are grouped by user story to enable independent implementation and testing of each story.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2, US3)
- Include exact file paths in descriptions

## Path Conventions

- Paths assume a single project structure with Next.js renderer in `src/` and Electron main in `electron/`.

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Project initialization and basic structure

- [x] T001 Initialize `specs/001-baseline-spec/` documentation structure
- [x] T002 [P] Verify `dexie`, `prisma`, and `lucide-react` are installed in `package.json`
- [x] T003 [P] Configure `next.config.js` to support Electron build output

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Core infrastructure for persistence and data integrity

- [x] T004 Setup `Prisma` schema and SQLite database in `prisma/schema.prisma`
- [x] T005 [P] Implement `Dexie` wrapper for IndexedDB in `src/lib/offline-db.ts`
- [x] T006 [P] Create `LocalPersistenceService` for IDB-SQLite mirroring in `src/lib/local-persistence.ts`
- [x] T007 Implement `PRAGMA integrity_check` handler in `electron/main.js`
- [x] T008 [P] Setup unified logging in `src/lib/logger.ts` for build and runtime audits

**Checkpoint**: Foundation ready - user story implementation can now begin in parallel

---

## Phase 3: User Story 1 - Seamless Offline Sales (Priority: P1) 🎯 MVP

**Goal**: Process sales without internet connectivity using local storage.

**Independent Test**: Disable network, add item to cart, click pay. Verify IndexedDB entry exists.

### Implementation for User Story 1

- [x] T009 [P] [US1] Define `Transaction` schema in `prisma/schema.prisma` and `Dexie` stores
- [x] T010 [US1] Implement offline transaction controller in `src/actions/pos.ts`
- [x] T011 [US1] Create `CheckoutModal.tsx` handles offline payment state in `src/components/pos/CheckoutModal.tsx`
- [x] T012 [P] [US1] Implement background cloud sync worker in `src/lib/sync-worker.ts`

**Checkpoint**: User Story 1 (Offline Sales) is fully functional

---

## Phase 4: User Story 2 - Automated Data Safety (Priority: P1)

**Goal**: Automatically back up IndexedDB to SQLite every 5 minutes.

**Independent Test**: Check `backups/` directory for a new .sqlite file after 5 minutes of app runtime.

### Implementation for User Story 2

- [ ] T013 [P] [US2] Implement `saveOfflineData` IPC handler in `electron/main.js`
- [ ] T014 [US2] Setup `setInterval` for auto-backup in `src/lib/offline-init.ts`
- [x] T015 [US2] Create filesystem recovery logic in `electron/main.js` (Auto-recovery on boot) and `preload.js`
- [ ] T016 [US2] Create `DesktopStatus.tsx` to display backup status in `src/components/pos/DesktopStatus.tsx`

**Checkpoint**: User Story 2 (Data Safety) is fully functional

---

## Phase 5: User Story 3 - Rapid Physical Feedback (Priority: P2)

**Goal**: Print receipts instantly using a dedicated "Speed Print" button.

**Independent Test**: Click "Speed Print" in POS menu. Verify immediate thermal print start.

### Implementation for User Story 3

- [x] T017 [P] [US3] Implement `printThermalReceipt` IPC handler in `electron/main.js`
- [x] T018 [US3] Create `Speed Print` button and trigger in `src/components/Sidebar.tsx`
- [x] T019 [US3] Define default thermal receipt template in `src/lib/print-templates.ts`

**Checkpoint**: User Story 3 (Speed Print) is fully functional

---

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**: UI/UX refinements and final verification

- [ ] T020 Implement RTL support for Arabic receipts in `src/lib/print-service.ts`
- [ ] T021 [P] Update `README.md` and `quickstart.md` with final baseline architecture docs
- [ ] T022 Final manual E2E validation of offline -> sync -> restore loop

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies.
- **Foundational (Phase 2)**: Depends on Phase 1. BLOCKS all user stories.
- **User Stories (Phase 3-5)**: All depend on Phase 2. US1 and US2 are P1 and should be prioritized.
- **Polish (Phase 6)**: Depends on all user stories.

### Execution Order

1. T001 -> T008 (Base)
2. T009 -> T012 (Offline Sales)
3. T013 -> T016 (Data Safety)
4. T017 -> T019 (Speed Print)
5. T020 -> T022 (Polish)

---

## Parallel Example: User Story 2

```bash
# Launch background handlers and UI components in parallel:
Task: "Implement saveOfflineData IPC handler in electron/main.js"
Task: "Create DesktopStatus.tsx to display backup status in src/components/pos/DesktopStatus.tsx"
```

---

## Implementation Strategy

### MVP First (User Story 1 + 2)

1. Complete Phase 1 & 2.
2. Complete Phase 3 (Offline Sales).
3. Complete Phase 4 (Data Safety).
4. **STOP and VALIDATE**: Verify end-to-end local persistence and recovery.
