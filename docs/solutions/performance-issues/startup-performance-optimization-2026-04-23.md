---
title: Electron Startup Performance Optimization (SQL Batching & Versioning)
date: 2026-04-23
category: docs/solutions/performance-issues/
module: Electron Main Process / Database
problem_type: performance_issue
component: database
severity: high
symptoms:
  - "App takes 60-90 seconds to show the main window"
  - "Splash screen stays stuck on 'Initializing' for a long time"
root_cause: logic_error
resolution_type: code_fix
tags: [electron, sqlite, startup-performance, batch-processing, user-version, ipc-progress]
---

# Electron Startup Performance Optimization (SQL Batching & Versioning)

## Problem
The Casper POS application suffered from a severe bottleneck during the startup sequence. In the production (packaged) environment, the Electron main process was executing over 120+ `prePatchStatements` individually using sequential `execSync` calls. This caused a cumulative latency of up to 90 seconds, even if no schema changes were actually needed, as each statement spawned a new process to check for column existence.

## Symptoms
- Observable 60-90s delay before the dashboard appears.
- Splash screen provides no feedback while the main process blocks on sequential database checks.
- High CPU usage during the "Initialization" phase.

## What Didn't Work
- **Process spawning per statement**: Using `npx prisma migrate` or direct SQL execution via separate process spawns for every single `ALTER TABLE` check is too heavy for a desktop application boot sequence.
- **Static Splash Screen**: A non-interactive splash screen led users to believe the application had crashed or hung.

## Solution
Implemented a multi-tier optimization strategy focused on **Process Reduction** and **UI Feedback**:

1.  **PRAGMA user_version Tracking**: Introduced version tracking within the SQLite database itself. The system now checks the `user_version`. If it matches the expected version, it skips all 120+ individual statement checks instantly (< 1ms).
2.  **SQL Batching**: When updates are required, statements are now grouped and executed in batches rather than spawning separate processes for each line.
3.  **IPC Progress Reporting**: Connected the `runMigrations` logic to the splash screen via IPC. The splash screen now displays real-time status (e.g., "Optimizing Database (45/123)...") to improve perceived performance.
4.  **Backend Seeding Optimization**: Refactored `seedAccounts` and `seedCashCategories` to use `findMany` followed by `createMany`. This reduced dozens of individual queries to just two per seeding module.

## Why This Works
- **Process Overheads**: By avoiding `execSync` process spawns for every line, we eliminated the overhead of initializing the environment 120 times.
- **Indexing over Probing**: Using `PRAGMA user_version` acts like an index for the database state, avoiding the need to "probe" every table schema on every boot.
- **Asynchronous Feedback**: Utilizing IPC allows the blocking migration logic to communicate without freezing the renderer's ability to update the UI.

## Prevention
- **Batch by Default**: Any new schema patches must be appended to the `prePatchStatements` and the target `user_version` incremented accordingly.
- **Avoid Sequential I/O**: Use `createMany` for all bulk data operations to minimize database transaction overhead.
- **Heartbeat during Boot**: Ensure long-running initialization tasks always emit status events to the `boot-status` IPC channel.

## Related Issues
- [Bi-Directional Sync V2](../../knowledge/bi-directional-sync-v2/artifacts/sync-v2-architecture.md)
- [Ticket System Refactor](../../knowledge/ticket-system-refactor/artifacts/refactor_summary.md)
