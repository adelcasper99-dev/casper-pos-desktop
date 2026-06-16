---
title: "fix: Harden migration batch script and restore granular logging"
date: "2026-06-16"
status: "active"
---

# Harden Migration Batch Script and Restore Granular Logging

This plan addresses the risks identified after the initial optimization of the pre-patch migration batch script.

## User Review Required

Please review the plan below. It is a lightweight hardening fix. Once approved, I will implement the changes.

## Open Questions

None.

## Proposed Changes

### Electron Main Process

The changes are entirely contained within the `electron/main.js` script.

#### [MODIFY] [main.js](file:///f:/casper%20desktop/casper-pos-desktop/electron/main.js)
- `[x]` Update the dynamically generated `PrismaClient` script to include `console.log('OK: ' + sql.slice(0, 70))` on success and `console.log('SKIP: ' + sql.slice(0, 70))` on failure.
- `[x]` Capture the `stdout` of the `execSync` command.
- `[x]` Split the captured `stdout` by newline and pipe each non-empty line back to the main Electron thread's `log()` function, restoring the original granular line-by-line logging into `casper-boot.log`.
- `[x]` Wrap the `fs.unlinkSync(tmpPath)` call in a `try/catch` block to gracefully ignore `EPERM` or `EBUSY` errors caused by temporary antivirus file locking.

## Verification Plan

### Manual Verification
- Start the application and check `casper-boot.log`. Verify that the line-by-line `OK` and `SKIP` messages for the pre-patch SQL statements are successfully recorded.
- Verify that no unhandled exceptions crash the startup process when cleaning up the temporary file.
