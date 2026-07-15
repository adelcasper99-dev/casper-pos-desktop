---
title: "feat: Full Print System Hardening & Hardware Integration Completion"
date: 2026-07-04
sequence: "001"
status: active
type: feat
---

# feat: Full Print System Hardening & Hardware Integration Completion

## Problem Frame

Casper's print stack has a solid 4-channel priority chain (Electron IPC → Hardware Bridge HTTP → QZ Tray → iframe fallback) but carries **six implementation-layer gaps** that range from silent data loss to a cashier-blocking race condition. This plan closes all gaps identified in the dual-track architecture review, producing a fully production-grade print subsystem.

**Root causes (confirmed by code inspection):**

1. **IPC `any` types** — `electron.d.ts` exposes `data: any` on multiple config channels; `print-guard.ts` accepts `settings: any`. No Zod validation in `electron/main.js` `safeHandle` wrappers.
2. **No cash drawer IPC channel** — `printer.openCashDrawer()` is hardcoded inside `POST /api/print` in `casper-hardware-bridge/main.js:158`. The drawer only fires if the receipt print job succeeds. Paper-out or printer-offline = locked drawer.
3. **No durable print job queue** — `HardwareBridgeClient.printDocument()` fires HTTP fire-and-forget. Mid-batch bridge crash = silently lost jobs.
4. **No printer status state machine** — no Zustand slice tracking printer connectivity. UI has no live status indicator. No auto-flush of queued jobs on reconnect.
5. **`localStorage` used for bridge IP** in Electron context — a security-sensitive routing value stored in a renderer-accessible store, SSRF-escalable via XSS.
6. **Auto-updater fires immediately** — `autoUpdater.autoInstallOnAppQuit = true` with no shift-awareness check. An update mid-shift kills the POS session.

---

## Research Findings

**From external best-practices research:**

- **Electron IPC Security**: Treat all renderer payloads as untrusted. Use `event.senderFrame` sender verification + Zod schema validation inside every `ipcMain.handle`. Never expose entire modules via `contextBridge` — only narrow, well-defined API surfaces (already correct). Payload size caps (100KB) are standard. *(Official Electron docs + community consensus)*
- **Durable Print Queue**: SQLite (WAL mode) + main-process worker loop is industry standard for POS desktop apps. Store `id, payload, status, retry_count, next_retry_at`. Exponential backoff formula: `baseDelay * 2^retryCount` with ±10% jitter. Dead-letter at retry ≥ 3. *(2025 community consensus for Electron POS apps)*
- **Cash Drawer Decoupling**: ESC/POS drawer kick (`0x1B 0x70 0x00 0x19 0xFA`) must be sent as a standalone packet, independent of the receipt print buffer. `node-thermal-printer`'s `openCashDrawer()` already exists in the bridge — it just needs to be callable via its own endpoint/IPC, not as a side-effect of print. *(ESC/POS specification + hardware vendor docs)*
- **Shift-Aware Auto-Update**: `electron-updater` best practice is `autoDownload = true`, `autoInstallOnAppQuit = false`. On `update-downloaded` event: check shift status from local SQLite, if active → show non-blocking banner, store pending update flag, do NOT call `quitAndInstall`. Install only on explicit shift close or manual user action. *(electron-updater official docs + 2025 POS patterns)*

**From local codebase inspection:**

- `electron/main.js` already has a `safeHandle` wrapper (line 19) — Zod validation slots directly into it.
- `electron/preload.js` already uses `contextBridge` with `contextIsolation: true` — foundation is correct.
- `casper-hardware-bridge/main.js` already uses `node-thermal-printer` with `printer.openCashDrawer()` on line 158 — it is already available, just needs its own endpoint.
- `autoUpdater` is already wired in `electron/main.js` lines 46–53 — shift-aware logic is additive.
- `src/lib/print-service.ts` already has a `PrinterRegistry` type and `initRegistry()` — `safeStorage` migration is additive.

---

## Scope Boundary

**In scope:** Six gaps across `electron/main.js`, `electron/preload.js`, `casper-hardware-bridge/main.js`, `src/lib/print-service.ts`, `src/lib/print-guard.ts`, `src/types/electron.d.ts`, and new files for the queue and state machine.

**Out of scope:** Tauri migration, embedded Bridge child process, CI/CD pipeline, QZ Tray refactor.

---

## Implementation Units

### Unit 1 — IPC Type Hardening + Zod Validation Layer
**Priority: P0 | Effort: Low | Risk: Medium**

**Files:**
- `src/types/electron.d.ts` — replace all `data: any` with strict interfaces
- `src/types/ipc-schemas.ts` *(NEW)* — Zod schemas for every IPC channel payload
- `electron/main.js` — add Zod validation + sender-frame check to `safeHandle`

**Changes:**

1. **`src/types/electron.d.ts`**: Define `ElectronAppConfig`, `OfflineDataPayload`, `CloudConfig` interfaces. Replace all `data: any` return types.

2. **`src/types/ipc-schemas.ts`** *(NEW)*: Zod schema per dangerous IPC channel:
   - `PrintStandardSchema`: `html` max 200KB string, `printerName` string, optional `options` object
   - `PrintThermalSchema`: `html` max 200KB, `printerName` string, `paperWidthMm` int 40–300
   - `KickDrawerSchema`: `printerName` optional string
   - `SaveCloudConfigSchema`: Zod mirror of `CloudConfig` shape
   - `SaveNodeConfigSchema`: Zod mirror of node config shape

3. **`electron/main.js`**: Extend `safeHandle(channel, schema, handler)` — add sender-frame verification and Zod `safeParse` before invoking handler. Pass schema to all print and config call sites.

**Test scenarios:**
- HTML > 200KB to `print:standard` → rejected, no crash.
- `paperWidthMm: 'eighty'` (string) → rejected by Zod.
- Message from non-main iframe → rejected by sender-frame check.
- Valid payloads flow through normally (regression).

---

### Unit 2 — `print-guard.ts` Type Safety Fix
**Priority: P0 | Effort: Very Low | Risk: Low**

**Files:**
- `src/lib/print-guard.ts`
- `src/types/print-settings.ts` *(NEW or extend existing)*

**Changes:**

1. Define strict `PrintSettings` interface and a matching Zod schema `PrintSettingsSchema`.
2. Replace `settings: any` with `settings: PrintSettings | null | undefined`.
3. At function entry: `PrintSettingsSchema.safeParse(settings)` — on failure, log warning and return `false`.

**Test scenarios:**
- `shouldAutoPrint(null)` → `false`
- `shouldAutoPrint({ autoPrintTicket: true }, 'ticket')` → `true`
- `shouldAutoPrint({ autoPrintTicket: 'yes' as any }, 'ticket')` → `false`
- `shouldAutoPrint({ autoPrintTicket: 1 as any }, 'ticket')` → `false`

---

### Unit 3 — Cash Drawer Decoupling (Highest UX Risk)
**Priority: P0 | Effort: Low | Risk: High**

**The bug:** `printer.openCashDrawer()` fires inside `POST /api/print` at `casper-hardware-bridge/main.js:158`, after `printer.execute()`. If print fails (paper out, offline), the catch block fires, `500` is returned, drawer command never sent. Cashier is locked out of the till.

**Files:**
- `casper-hardware-bridge/main.js` — add `POST /api/drawer/kick`; remove drawer from print route
- `electron/main.js` — add `hardware:kick-drawer` IPC channel
- `electron/preload.js` — expose `kickDrawer()` on `electronAPI`
- `src/types/electron.d.ts` — add `kickDrawer` to interface
- `src/lib/print-service.ts` — add `kickCashDrawer()` method to `PrintService`
- `src/components/tickets/TicketPaymentModal.tsx` — update to `Promise.allSettled([print, drawer])`
- `src/components/tickets/TicketPrintOptionsModal.tsx` — same update (lines 321–325, 393–396)

**Key design:** `kickCashDrawer()` in `print-service.ts` follows the same channel priority as `printSilentHTML`: Electron IPC first, then Bridge HTTP `POST /api/drawer/kick`, never blocks on print outcome.

**Sale completion pattern:**
```typescript
const [printResult, drawerResult] = await Promise.allSettled([
  printService.printThermal(htmlContent, targetPrinter, paperWidthMm),
  printService.kickCashDrawer(targetPrinter)
]);
// Both logged independently. Neither blocks the other.
```

**Test scenarios:**
- Paper out → print `500`, drawer still kicks → cashier can make change.
- Printer offline → both fail → both toasts shown independently, POS not blocked.
- Happy path → both succeed → single success UX.
- `POST /api/drawer/kick` with empty body → uses default `receiptPrinter` from bridge store.

---

### Unit 4 — Durable Print Job Queue (SQLite-backed)
**Priority: P0 | Effort: Medium | Risk: Medium**

**Architecture:** Queue lives in Electron main process, backed by `print-queue.db` in `app.getPath('userData')`. Renderer enqueues via IPC; main process dequeues and prints. Renderer never blocks on print I/O.

**Files:**
- `electron/print-queue.js` *(NEW)* — `PrintQueue` class with `better-sqlite3`
- `electron/main.js` — wire up queue, IPC channels, startup recovery, shutdown drain
- `electron/preload.js` — expose `printQueue.enqueue()`, `getStatus()`, `onStatusChange()`
- `src/types/electron.d.ts` — add `printQueue` namespace

**SQLite schema (`print_jobs` table):**
```sql
CREATE TABLE IF NOT EXISTS print_jobs (
  id           TEXT PRIMARY KEY,
  job_type     TEXT NOT NULL CHECK(job_type IN ('receipt','a4','barcode','label')),
  html         TEXT NOT NULL,
  printer      TEXT,
  paper_width  INTEGER,
  status       TEXT NOT NULL DEFAULT 'PENDING'
               CHECK(status IN ('PENDING','PROCESSING','DONE','FAILED','FAILED_PERMANENT')),
  retry_count  INTEGER NOT NULL DEFAULT 0,
  next_retry_at INTEGER,
  created_at   INTEGER NOT NULL,
  completed_at INTEGER,
  error_msg    TEXT
);
CREATE INDEX IF NOT EXISTS idx_pj_status ON print_jobs(status, next_retry_at);
```

**`PrintQueue` class methods:**
- `enqueue(job)` → INSERT `PENDING`
- `dequeueNext()` → SELECT WHERE `status='PENDING' AND (next_retry_at IS NULL OR next_retry_at <= now)`
- `markDone(id)` → UPDATE `DONE`
- `markFailed(id, error, maxRetries=3)` → exponential backoff: `1000 * 2^retryCount * jitter(0.9–1.1)`. At retry ≥ 3 → `FAILED_PERMANENT`
- `recoverPending()` → on startup, reset any `PROCESSING` rows to `PENDING` (crash recovery)
- `getQueueStatus()` → counts by status
- Worker loop: `setInterval(processNext, 2000)`

**Test scenarios:**
- Enqueue 3 jobs while Bridge offline → all `PENDING` in SQLite.
- Bridge comes online → all 3 flush within one poll cycle.
- Job fails 3× → `FAILED_PERMANENT`, no more retries.
- App crash mid-print → `recoverPending()` on restart.
- `getQueueStatus()` returns accurate counts.

---

### Unit 5 — Printer Status Zustand State Machine
**Priority: P1 | Effort: Medium | Risk: Low**

**Files:**
- `src/stores/printer-status-store.ts` *(NEW)*
- `src/components/layout/PrinterStatusBadge.tsx` *(NEW)*
- `src/components/settings/PrinterSettings.tsx` — subscribe to store, remove local polling

**State:** `'UNKNOWN' | 'ONLINE' | 'PRINTING' | 'ERROR_OFFLINE' | 'ERROR_NO_PAPER' | 'FAILED_PERMANENT' | 'RECONNECTING'`

**Store fields:** `status`, `printerName`, `queueCounts: { pending, failed }`, `lastChecked`

**Polling:** `PrinterStatusBadge.tsx` starts a 10s interval on mount via `useEffect`, calls `printService.getStatus()` → updates store. Badge renders green/amber/red in the app layout header.

**Transitions:**
- `ONLINE → PRINTING` on any print call start
- `PRINTING → ONLINE` on success
- `PRINTING → ERROR_NO_PAPER` when bridge returns `'paper_out'` error string
- `ERROR_* → RECONNECTING` after first retry backoff
- `RECONNECTING → ONLINE` when `/api/status` returns `ok: true`

**Test scenarios:**
- Printer goes offline → badge red within 10s.
- Printer reconnects → badge returns green.
- Queue has pending jobs → amber badge with count.

---

### Unit 6 — Shift-Aware Auto-Update Logic
**Priority: P1 | Effort: Low | Risk: Medium**

**Files:**
- `electron/main.js` — modify `autoUpdater` event handlers
- `electron/preload.js` — expose `updater.onPendingUpdate`, `updater.installNow`
- `src/types/electron.d.ts` — add to `updater` namespace
- `src/components/layout/UpdateBanner.tsx` *(NEW)* — non-blocking banner

**Changes to `electron/main.js`:**
1. Set `autoUpdater.autoInstallOnAppQuit = false` (change from `true`).
2. On `update-downloaded`: query local SQLite for `shifts` with `status='OPEN'` AND `lastHeartbeat > (now - 120s)`. If active → `pendingUpdateInfo = info`, send `updater:update-pending` to renderer. If not → send `updater:update-downloaded` as today.
3. Add `safeHandle('app:install-update-now', null, ...)` → `autoUpdater.quitAndInstall(false, true)` if `pendingUpdateInfo !== null`.
4. On shift-close event hook → auto-install if `pendingUpdateInfo !== null`.

**`src/components/layout/UpdateBanner.tsx`** *(NEW)*:
- Slim top banner: "🔄 Update ready — will install when shift closes."
- "Install Now" button → confirmation → `electronAPI.updater.installNow()`.
- Dismissable for session.

**Test scenarios:**
- Update downloaded with open shift → banner shows, no install.
- Shift close → `quitAndInstall` fires automatically.
- "Install Now" clicked → confirmation → restarts.
- Orphaned shift (heartbeat > 2min) → treated as no active shift, install proceeds.

---

### Bridge IP Security Migration
**Priority: P1 | Effort: Low | Risk: Low**

**Files:**
- `electron/main.js` — add `config:get-bridge-url` / `config:set-bridge-url` using `safeStorage`
- `electron/preload.js` — expose `config.getBridgeUrl()`, `config.setBridgeUrl(ip)`
- `src/lib/print-service.ts` — in Electron context, call `electronAPI.config.getBridgeUrl()` instead of reading `localStorage`
- `src/types/electron.d.ts` — add to `config` namespace

**Pattern:** `safeStorage.encryptString(ip)` → store in `casper-config.json`. Decrypt at read. `localStorage` fallback retained only for web/browser (non-Electron) mode.

---

## Execution Sequencing

```
Unit 1 (IPC Zod) ──────────┐
Unit 2 (print-guard) ──────┤ Parallel — no deps between them
                            ▼
Unit 3 (Drawer) ────── needs Unit 1 (new schema + preload slot)
                            │
                            ▼
Unit 4 (Queue) ───────────── needs Unit 1 + Unit 3
Unit 5 (State Machine) ───── needs Unit 4 (queue status)
Unit 6 (Auto-Update) ──────── independent — parallel with 4–5
Bridge IP Migration ──────── independent — parallel with 5–6
```

---

## Verification Plan

### Automated Tests
- `src/__tests__/print-guard.test.ts` — add malformed-settings cases
- `src/__tests__/print-queue.test.ts` *(NEW)* — `PrintQueue` class: enqueue, dequeue, backoff math, crash recovery
- `src/__tests__/ipc-schemas.test.ts` *(NEW)* — boundary tests: valid pass, oversized HTML rejected, wrong types rejected

### Manual Verification
1. Complete a sale with printer online → receipt prints + drawer kicks (both succeed independently).
2. Pull printer cable mid-print → receipt fails → drawer still kicks → badge turns amber.
3. Remove paper → print error → drawer kicks → badge shows `ERROR_NO_PAPER`.
4. Download test update with open shift → no install prompt → shift close → `quitAndInstall` fires.
5. Send 200KB+ HTML via IPC → rejected at Zod, no main-process crash.
6. Disconnect Bridge, enqueue 5 jobs → reconnect → all 5 flush within one poll cycle.
