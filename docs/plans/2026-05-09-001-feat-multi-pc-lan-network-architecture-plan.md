---
title: "feat: Multi-PC LAN Network Architecture (Master/Sub-Node + PostgreSQL)"
status: active
created: 2026-05-09
type: feat
success_ratio: 90%
---

# feat: Multi-PC LAN Network Architecture

## Problem Frame

Casper POS currently runs as a single-machine application: one Electron process, one Next.js server, one SQLite database, all on one PC. The shop needs multiple PCs each running the **full app independently** (own CPU/RAM, own printer), all sharing **one central database** on a designated Master PC.

SQLite cannot be accessed concurrently over a network — hard architectural constraint. Solution: replace SQLite with **PostgreSQL 15 running as a Windows Service** on the Master PC. Each PC runs its own complete Electron + Next.js app connecting to shared PostgreSQL over LAN.

## Architecture

```
MASTER PC
├── Electron + Next.js (own CPU/RAM)
├── PostgreSQL 15 Windows Service (:5432)  ← only shared component
└── Own printer (Electron IPC)

SUB-NODE PC (×N)
├── Electron + Next.js (own CPU/RAM)
├── Prisma → postgresql://casper_app:***@{masterIp}:5432/casper_pos
└── Own printer (Electron IPC)
```

Config stored in `%APPDATA%\casper-pos-desktop\casper-config.json`:
```json
{ "nodeRole": "MASTER"|"SUB_NODE", "masterIp": "192.168.1.x", "dbPassword": "***" }
```

---

## Implementation Units (Execution Order)

---

### Unit 1 — PostgreSQL Schema Migration
**Effort:** Medium | **Risk:** 🟠 High | **Runs on:** Developer machine (one-time)

**Files:**
- `prisma/schema.prisma` — line 6: `provider = "sqlite"` → `provider = "postgresql"`
- `prisma/migrations/` — archive to `prisma/migrations.sqlite.bak/`, generate PG baseline
- `.env` — `DATABASE_URL` → `postgresql://casper_app:pass@localhost:5432/casper_pos`

**Steps:**
1. Rename `prisma/migrations/` → `prisma/migrations.sqlite.bak/`
2. Create empty `prisma/migrations/`
3. Update `.env` DATABASE_URL to a local PG instance
4. Run `npx prisma migrate dev --name init_postgresql_baseline`
5. Verify with `npx prisma db pull`

**Test scenarios:**
- `prisma generate` completes without errors
- `prisma migrate deploy` applies to a fresh PG database cleanly
- All `Decimal` columns map to PG `NUMERIC` (already correct in schema)
- `LocalBackup.id Int @default(autoincrement())` → maps to `SERIAL` — acceptable

**Risks:**
- ❌ Existing SQLite data is not automatically migrated → write `scripts/migrate-sqlite-to-pg.ts` as a separate one-time tool before production deploy
- ❌ Migration history is permanently incompatible with SQLite → archive (not delete) the old folder

---

### Unit 2 — `src/lib/prisma.ts` — Role-Aware URL Resolver
**Effort:** Easy | **Risk:** 🟢 Low | **Dependency:** Unit 1

**Files:** `src/lib/prisma.ts`

**Replace `getDynamicDbUrl()` entirely:**
- `MASTER` → `postgresql://casper_app:{dbPassword}@localhost:5432/casper_pos`
- `SUB_NODE` → `postgresql://casper_app:{dbPassword}@{masterIp}:5432/casper_pos`
- Missing/invalid config → fall back to `process.env.DATABASE_URL` (dev only)
- Throw descriptive error if `SUB_NODE` with no `masterIp`
- Keep `typeof window !== 'undefined'` guard (browser bundle safety — unchanged)

**Test scenarios:**
- Returns `postgresql://...localhost...` for MASTER role
- Returns `postgresql://...{masterIp}...` for SUB_NODE role
- Falls back to env var when config file absent (dev)
- Does not import `fs` on browser bundle

---

### Unit 3 — `electron/main.js` — Migration Runner + Server Env Injection
**Effort:** Medium | **Risk:** 🟠 High | **Dependency:** Units 1, 2

**Files:** `electron/main.js`

**`runMigrations()` — full rewrite (replaces lines 100–355):**
- **Delete** entire pre-patch block (lines 134–287): 40 SQLite `ALTER TABLE` statements — not needed in PG migrations
- **Delete** `PRAGMA integrity_check` block (lines 320–332)
- SUB_NODE: early return — Master owns schema authority
- MASTER: build PG URL from `loadConfig()`, run `prisma migrate deploy` against it
- On failure: show Arabic error dialog and call `app.quit()`

**`startServer()` env injection (line ~394):**
- Replace: `DATABASE_URL: \`file:${normalizedDbPath}\``
- With: role-aware PG URL (same logic as Unit 2)
- Verify correct PG query engine binary name in `@prisma/engines` for Windows — filename differs between SQLite and PG providers

**`runMigrations()` call site:**
- Pass `config` object instead of `dbPath` string
- Make `await`-able

**Test scenarios:**
- SUB_NODE: `runMigrations()` exits immediately, no SQL runs
- MASTER: `prisma migrate deploy` called with valid PG URL
- `DATABASE_URL` in spawned Next.js process is a `postgresql://` string
- Failure mode: dialog shown in Arabic, app quits cleanly

---

### Unit 4 — Setup Wizard in `electron/splash.html` + IPC
**Effort:** Hard | **Risk:** 🔴 Critical | **Dependency:** Unit 3

**Files:**
- `electron/splash.html` — add hidden wizard overlay (pure HTML/CSS/JS)
- `electron/main.js` — `createWindow()` boot gate + 2 new IPC handlers
- `electron/preload.js` — add `wizard` namespace with 2 IPC bridges

**Boot gate in `createWindow()`:**
```
createSplashWindow()
→ loadConfig()
→ if !config.nodeRole:
    splashWindow.webContents.send('wizard:show')
    await new Promise(resolve => ipcMain.once('wizard:complete', resolve))
→ startServer()   ← only runs after wizard saves config
```

**New IPC handlers:**
- `wizard:save-role` → writes `{nodeRole, masterIp, dbPassword}` to `casper-config.json`, applies `icacls` ACL, emits `wizard:complete`
- `wizard:test-connection` → TCP socket connect to `{masterIp}:5432`, 5s timeout → returns `{success, error}`

**`preload.js` addition:**
```js
wizard: {
  show: (cb) => ipcRenderer.on('wizard:show', cb),
  saveRole: (data) => ipcRenderer.invoke('wizard:save-role', data),
  testConnection: (ip) => ipcRenderer.invoke('wizard:test-connection', ip),
}
```

**Wizard UI (added to `splash.html` as hidden overlay):**

Screen 1 — Role Selection:
```
┌──────────────────────────────────────────────────────┐
│  ⬡ CASPER           إعداد النظام — الخطوة 1/2        │
├──────────────────────────────────────────────────────┤
│                                                      │
│  ┌───────────────────┐  ┌───────────────────┐        │
│  │  🖥️               │  │  📡               │        │
│  │  جهاز رئيسي      │  │  جهاز فرعي        │        │
│  │  Master           │  │  Sub-Node         │        │
│  │                   │  │                   │        │
│  │  يستضيف قاعدة     │  │  يتصل بالجهاز     │        │
│  │  البيانات         │  │  الرئيسي          │        │
│  └───────────────────┘  └───────────────────┘        │
│                                                      │
│  ⚠️ هذا الإعداد دائم ويتطلب إعادة التشغيل لتغييره   │
└──────────────────────────────────────────────────────┘
```

Screen 2 — Sub-Node IP Entry (slides in after Sub-Node selection):
```
┌──────────────────────────────────────────────────────┐
│  ← عودة        الاتصال بالجهاز الرئيسي — الخطوة 2/2 │
├──────────────────────────────────────────────────────┤
│                                                      │
│  عنوان IP للجهاز الرئيسي:                             │
│  ┌──────────────────────────────────────────────┐   │
│  │  192.168.1.___                               │   │
│  └──────────────────────────────────────────────┘   │
│                                                      │
│  كلمة المرور:                                         │
│  ┌──────────────────────────────────────────────┐   │
│  │  ••••••••                                    │   │
│  └──────────────────────────────────────────────┘   │
│                                                      │
│  [ اختبر الاتصال ]        [ حفظ والمتابعة ← ]        │
│                                                      │
│  ✅ الاتصال ناجح — الجهاز الرئيسي متاح               │
│  ❌ تعذّر الاتصال — تحقق من IP وجدار الحماية          │
└──────────────────────────────────────────────────────┘
```

Design rules:
- `direction: rtl` — Arabic primary
- Colors: `#3B6978` (teal), `#F9F7F2` (bg) — matches existing `splash.html`
- Card hover: `box-shadow` glow + `transform: scale(1.02)` 200ms ease
- "حفظ" disabled until connection test passes (Sub-Node) or password filled (Master)
- Zero external dependencies — vanilla HTML/CSS/JS only

**Test scenarios:**
- First boot (no nodeRole): wizard appears before Next.js loads
- Subsequent boots: wizard skipped, boot proceeds normally
- Connection test returns correct result for reachable/unreachable IP
- Empty IP shows inline validation, does not call IPC
- After save: status text updates to "جاري تحضير النظام...", spinner resumes

---

### Unit 5 — `src/lib/db-init.ts` — Remove SQLite PRAGMAs
**Effort:** Easy | **Risk:** 🟢 Low | **Dependency:** Unit 1

**Files:** `src/lib/db-init.ts`

**Remove (lines 30, 33, 36, 40–46):**
- `PRAGMA journal_mode=WAL` — PG uses WAL by default, no config needed
- `PRAGMA foreign_keys=ON` — FK enforcement is schema-level in PG
- `PRAGMA synchronous=NORMAL` — PG-managed
- `PRAGMA integrity_check` — no PG equivalent at this level

**Keep unchanged:**
- `seedAccounts()`, `seedCashCategories()` — PG-compatible Prisma queries
- `storeSettings.create()` — unchanged
- `ensureMainBranch()` — unchanged
- Orphan purge logic — unchanged

**Add:** `await prisma.$queryRaw\`SELECT 1\`` as a lightweight connectivity check in place of integrity_check.

**Test scenarios:**
- `initDatabase()` completes against PG without errors
- Seeding is idempotent (safe to re-run)
- Connectivity check fails gracefully if PG unreachable

---

### Unit 6 — `src/lib/sync-worker.ts` — Master-Only Sync Gate
**Effort:** Easy | **Risk:** 🟢 Low | **Dependency:** Unit 4

**Files:** `src/lib/sync-worker.ts`

**`start()` changes:**
- Read `nodeRole` from `window.electronAPI.config.getConfig()` at start
- `SUB_NODE`: skip all 3 `setInterval` blocks, start `startMasterHeartbeat()` only
- `MASTER` (or missing config): run existing intervals unchanged
- Gate `LocalPersistenceService.mirrorToSQLite()` interval behind MASTER (SUB_NODE has no local file)

**New `startMasterHeartbeat()` (private static):**
- TCP ping `window.fetch('/api/health')` every 10s with 3s `AbortSignal.timeout`
- 3 consecutive failures → `window.dispatchEvent(new CustomEvent('casper:master-offline'))`
- Recovery → `window.dispatchEvent(new CustomEvent('casper:master-online'))`

**Test scenarios:**
- MASTER: all 3 intervals start (sync, mirror, reindex)
- SUB_NODE: 0 sync intervals, heartbeat starts
- 3 ping failures → `casper:master-offline` event fires
- Recovery → `casper:master-online` event fires

---

### Unit 7 — Master Offline Modal (SUB_NODE Guard)
**Effort:** Medium | **Risk:** 🟡 Medium | **Dependency:** Unit 6

**Files:**
- `src/components/MasterOfflineModal.tsx` (new)
- `src/app/layout.tsx` — mount modal, attach event listeners

**Behavior:**
- Mounts only if `nodeRole === 'SUB_NODE'` (check via `window.electronAPI.config.getConfig()`)
- Shows full-screen overlay when `casper:master-offline` fires
- Auto-dismisses when `casper:master-online` fires
- Does NOT block: read-only pages (reports, ticket history, catalog)
- Blocks: all write actions (sales, tickets, payments, stock)
- Shows animated reconnecting indicator + Arabic message

**Test scenarios:**
- Modal appears on `casper:master-offline`
- Modal dismisses on `casper:master-online`
- Modal never mounts on MASTER machines
- Read-only pages still accessible during offline state

---

## Risk Matrix

| Risk | Prob | Impact | Severity | Mitigation |
|---|---|---|---|---|
| Boot wizard fails to gate `startServer()` | Med | 🔴 Critical | **P0** | `ipcMain.once('wizard:complete')` Promise — test in isolation first |
| PG not running on Master at app boot | High | 🔴 Critical | **P0** | `initDatabase()` `SELECT 1` check → Arabic error dialog → `app.quit()` |
| PG engine binary wrong name in packaged build | Med | 🔴 Critical | **P0** | Verify filename in `node_modules/@prisma/engines` after `prisma generate --provider postgresql`; update `electron-builder.yml` `asarUnpack` |
| Existing SQLite data lost on migration | High | 🟠 High | **P1** | One-time `scripts/migrate-sqlite-to-pg.ts` export tool before production deploy |
| Windows Firewall blocks port 5432 | High | 🟠 High | **P1** | Wizard connection test surfaces this immediately; document setup checklist |
| SQLite pre-patch block left in `main.js` | Certain | 🟠 High | **P1** | Explicit deletion in Unit 3 — not a conditional, a hard remove |
| Sub-Node on newer app version than Master schema | Med | 🟡 Medium | **P2** | v1 known limitation; add version check in v2 |
| `app:vacuum-db` sends SQLite `VACUUM` to PG | Med | 🟡 Medium | **P2** | Disable handler for v1; replace with `VACUUM ANALYZE` in v2 |

---

## Gap Registry

| # | Gap | Owner | Status |
|---|---|---|---|
| G1 | `electron-builder.yml` `asarUnpack` must include PG engine binary | Unit 3 | Resolve before packaging |
| G2 | `preload.js` has no `wizard` namespace | Unit 4 | Add in same PR as wizard |
| G3 | `app:vacuum-db` sends SQLite-only `VACUUM;` | Post-v1 | Disable for now |
| G4 | `app:export-support-bundle` copies `.db` file — PG has no file | Post-v1 | Disable for now |
| G5 | `app:restore-from-backup` — SQLite file restore only | Post-v1 | Disable for now |
| G6 | No data migration tool for existing SQLite → PG | Pre-deploy | Write `scripts/migrate-sqlite-to-pg.ts` |

---

## Success Ratio Per Unit

| Unit | Confidence | Primary Risk |
|---|---|---|
| 1 — Schema migration | 90% | PG round-trip edge cases |
| 2 — prisma.ts resolver | 95% | Self-contained, well-tested pattern |
| 3 — main.js runner | 85% | PG engine binary path in packaged build |
| 4 — Setup Wizard | 80% | Boot-gate IPC sequencing + HTML complexity |
| 5 — db-init.ts cleanup | 95% | Trivial deletion |
| 6 — SyncWorker gate | 95% | Additive, low blast radius |
| 7 — Offline modal | 90% | Standard React component |
| **Overall** | **~90%** | Execute in dependency order |

---

## One-Time Master PC Setup (Shop IT Checklist)

```
□ Download PostgreSQL 15 installer: postgresql.org/download/windows
□ Run installer — set password for postgres superuser
□ Open pgAdmin → Login → Servers → PostgreSQL 15
□ Create Login Role: casper_app / [chosen password] / Can login: yes
□ Create Database: casper_pos / Owner: casper_app
□ Edit pg_hba.conf (C:\Program Files\PostgreSQL\15\data\pg_hba.conf):
    Add line: host  casper_pos  casper_app  192.168.1.0/24  md5
□ Restart PostgreSQL service (services.msc → PostgreSQL → Restart)
□ Windows Defender Firewall → Advanced → Inbound Rules →
    New Rule → Port → TCP → 5432 → Allow → Name: "Casper POS DB"
□ Install Casper POS on Master PC → Wizard: "جهاز رئيسي" → enter password
□ Install Casper POS on each Sub-Node → Wizard: "جهاز فرعي" → enter Master IP + password
```
