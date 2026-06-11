---
title: "fix: Resolve bytecode compilation gap, IP detection confusion, and git object misconception"
type: fix
status: active
date: 2026-06-09
---

# fix: Resolve bytecode compilation gap, IP detection confusion, and git object misconception

## Overview

Three unrelated but user-impacting issues were identified during debugging:

1. Edits to `electron/main.js` and `electron/preload.js` are silently ignored in production because `main-loader.js` loads bytecode-compiled `.jsc` files instead
2. The `bridgeIpAddress` (Hardware Bridge IP) is stored in `localStorage` and never auto-updates
3. The number ~6900 is misinterpreted as commits when it is actually the git object count

## Problem Frame

### Issue 1: Edits silently lost

When a developer edits `electron/main.js` or `electron/preload.js` and closes/reopens the app (production mode), `electron/main-loader.js` loads the `.jsc` bytecode instead of the edited source. The current loader already supports `NODE_ENV=development` to load source files, but in any other mode it always loads bytecode. The `.jsc` files in git status show binary diffs while the source `.js` files show no changes — indicating the bytecode was regenerated/replaced without corresponding source edits.

Current loader logic (`electron/main-loader.js:26-28`):
```
if (NODE_ENV === 'development' && main.js exists) → load main.js
else                                               → load main.jsc
```

### Issue 2: Shared IP doesn't change on restart

The POS has two IP mechanisms:

| Mechanism | Source | Persistence |
|---|---|---|
| Auto-detected IP (`GET /api/network/ip`) | `os.networkInterfaces()` at request time | Always fresh |
| `bridgeIpAddress` (PrinterRegistry) | `localStorage` key `casper_printer_registry_v2` | Survives restarts |

The `bridgeIpAddress` is manually configured in the PrinterSettings UI (`src/components/settings/PrinterSettings.tsx:261-271`) and used by `print-service.ts:72-90` to route print jobs to the Casper Hardware Bridge. It only appears when running as a web browser (not Electron). There is no way to auto-detect or refresh it — users must manually type the IP.

### Issue 3: git object count vs commit count

`git rev-list --count HEAD` returns **102** commits. `git count-objects -v` shows **6689** objects. The user is reading the objects count (~6900, likely from GitKraken or similar GUI) and interpreting it as commits.

## Requirements Trace

- R1. Edits to `electron/main.js` and `electron/preload.js` should take effect without manual bytecode recompilation
- R2. Users should be able to auto-detect the current machine IP and fill it into the bridge IP field
- R3. The git object/commit distinction should be clarified so developers don't misinterpret the count

## Scope Boundaries

- Does not change the production shipping behavior (`.jsc` bytecode remains the default load path in production)
- Does not remove the `bridgeIpAddress` localStorage persistence (it's by design)
- Does not modify the `/api/network/ip` endpoint (it already works correctly)
- Does not change which IP the auto-detection chooses among multiple NICs (first-found heuristic is preserved)

## Context & Research

### Relevant Code and Patterns

| File | Role |
|---|---|
| `electron/main-loader.js` | Entry-point loader that decides `.js` vs `.jsc` |
| `scripts/compile-bytecode.js` | Compiles `.js` → `.jsc` via bytenode |
| `src/components/settings/PrinterSettings.tsx` | UI for bridge IP configuration |
| `src/lib/print-service.ts` | Reads `bridgeIpAddress` from localStorage for Hardware Bridge routing |
| `src/types/printer-config.ts` | `PrinterRegistry` interface with `bridgeIpAddress` field |
| `src/app/api/network/ip/route.ts` | Auto-detects machine IP via `os.networkInterfaces()` |
| `src/components/layout/NetworkGuideModal.tsx` | Shows detected IP for secondary device connection |
| `package.json` | Scripts `dev:electron` (already sets `NODE_ENV=development`) and `compile:bytecode` |

### Institutional Learnings

- `docs/solutions/` has no existing learning about bytecode or IP detection — these will be new additions

### External References

- bytenode docs: V8 bytecode compilation via Node.js `require()` hook — the `.jsc` extension handler is registered by calling `require('bytenode')` before requiring the compiled file

## Success Metrics

| Metric | Target | How Measured |
|---|---|---|
| Time from editing `electron/main.js` to seeing changes in running app | Zero developer steps — just save and restart | Developer workflow test |
| Time to configure bridge IP | < 5 seconds (one click) | UI interaction timing |
| Developer understanding of git object vs commit count | No support questions about commit count | Observation over next 2 weeks |
| Regression rate | Zero regressions in existing print and boot behavior | Existing test suite + manual boot test on production build |

## Key Technical Decisions

- **Decision: Compare file mtime instead of checking NODE_ENV** — Rather than relying on `NODE_ENV` (which is easy to forget), compare the modification timestamps of `.js` and `.jsc` files. If `.js` exists and is newer, load source. If `.jsc` is newer or `.js` doesn't exist, load bytecode. This is automatic regardless of environment mode.
- **Decision: Add detect-IP button, not full auto-detection** — The `bridgeIpAddress` is intentionally manual (it points to a different machine's IP on the network). Auto-detecting and overwriting it on every boot would break users who configured it to a remote machine. A one-click "Detect" button gives the best UX without side effects.
- **Decision: Keep `compile:bytecode` as the only compilation path** — No need for a watcher. The mtime-based loader makes recompilation optional in development, and the existing `dist` pipeline already handles production builds correctly.

## Open Questions

### Resolved During Planning

- Should the bridge IP field be visible in Electron mode too? — **Reopened.** See gap G1 below. The user's complaint originated from the desktop app, but the field is currently hidden in Electron. The plan now includes showing it in Electron.
- Should `compile:bytecode` auto-run on every `npm run dev` start? — No. The mtime-based loader makes it unnecessary in dev mode, and the existing `npm run dev` already loads from source.

### Deferred to Implementation

- Exact mtime comparison threshold (sub-second precision may behave differently across OS filesystems) — handle via `fs.statSync` mtimeMs comparison with tolerance for rounding
- Automated test strategy for the mtime loader — the loader runs in Electron main process before any test framework. Options: extract mtime logic into a helper module for unit testing, or rely on manual verification with boot log checks

## Implementation Units

- [ ] **Unit 1: Bytecode-aware Electron Loader with mtime detection**

**Goal:** Make `electron/main-loader.js` automatically prefer source `.js` files when they've been edited more recently than the `.jsc` bytecode, so edits take effect without manual recompilation.

**Requirements:** R1

**Dependencies:** None

**Files:**
- Modify: `electron/main-loader.js`
- Modify: `scripts/compile-bytecode.js` (add post-compile log that reminds about the mtime behavior)

**Approach:**
- In `main-loader.js`, replace the `NODE_ENV === 'development'` check with an mtime comparison
- Use `fs.statSync()` to get mtime of both `main.js` and `main.jsc`
- Logic:
  1. If `main.js` does not exist → require `main.jsc` (bytecode-only)
  2. If `main.jsc` does not exist but `main.js` does → require `main.js` (development without bytecode)
  3. If both exist → compare `.mtimeMs`. If `main.js` is newer, load `main.js` (source edited after bytecode compilation). Otherwise load `main.jsc`
- Log which file is being loaded and why via the existing `log()` function

**Patterns to follow:**
- `electron/main-loader.js` — the existing logging pattern using the `log()` helper

**Test scenarios:**
- **Happy path: .jsc is newer than .js** — After running `compile:bytecode`, launching the app loads `main.jsc` bytecode. Verify via boot log message.
- **Happy path: .js is newer than .jsc** — After editing and saving `main.js`, launching the app loads `main.js` source. Verify via boot log message.
- **Edge case: .jsc is missing** — Without a `.jsc` file, the loader falls back to `.js` source if available.
- **Edge case: .js is missing** — If only `.jsc` exists (packaged build), load bytecode normally.
- **Edge case: identical mtime** — Both files updated at the same time (e.g., bytecode compiled immediately after editing). Prefer `.jsc` (the explicitly compiled output).

**Verification:**
- Boot log shows the correct file path being loaded depending on mtime relationship
- Running `npm run dev` (development mode) continues to work
- Running the production build continues to load `.jsc`

- [ ] **Unit 2: Auto-detect IP button in PrinterSettings**

**Goal:** Add a one-click "Detect" button in the Printer Settings page that fetches the current machine IP from `GET /api/network/ip` and fills the `bridgeIpAddress` field, so users don't have to manually look up and type the IP.

**Requirements:** R2

**Dependencies:** Unit 1 (not a real dependency — can be done in parallel)

**Files:**
- Modify: `src/components/settings/PrinterSettings.tsx`
- Modify: `src/lib/print-service.ts` (add `detectLocalIp()` convenience method)
- Test: `src/__tests__/printer-ip-detection.test.ts`

**Approach:**
- Add a `detectLocalIp()` async method to `PrintService` class in `print-service.ts` that does `fetch('/api/network/ip').then(r => r.json())` and returns the `ip` field
- In `PrinterSettings.tsx`, add a small "Detect My IP" button next to the bridge IP input field (only shown when the bridge IP section is visible, i.e., `!printService.isElectron()`)
- On mount, if `bridgeIpAddress` is empty, auto-detect and fill it with a toast notification
- Include a loading spinner while detecting
- Detect button uses a `Detect` icon (or the existing `RefreshCw` icon)

**Patterns to follow:**
- `src/components/layout/NetworkGuideModal.tsx` — existing fetch pattern for `/api/network/ip`
- `PrinterSettings.tsx` lines 128-139 (`handleTestReceipt`) — pattern for async action + toast UX

**Test scenarios:**
- **Happy path: detect button fills IP** — Clicking "Detect" fetches from `/api/network/ip`, the IP input field is populated, and a success toast appears
- **Edge case: API fails (500)** — If `/api/network/ip` returns an error, show an error toast and leave the field unchanged
- **Edge case: auto-detect on mount when empty** — Loading the settings page with an empty `bridgeIpAddress` triggers auto-detect and fills the field
- **Edge case: auto-detect skipped when already set** — Loading the settings page with a non-empty `bridgeIpAddress` does NOT trigger auto-detect (preserves the user's manual setting)
- **Integration: saved value persists** — After detecting and saving, reloading the settings page shows the saved IP

**Verification:**
- Clicking "Detect" populates the IP field
- The IP is saved correctly when clicking "Commit Preferences"
- On next page load, the saved IP is displayed
- Auto-detect fires only when the field is empty

- [ ] **Unit 3: Document git object vs commit count confusion**

**Goal:** Add a brief note to the project reference docs so developers new to the repo don't misinterpret the git object count as commit count.

**Requirements:** R3

**Dependencies:** None

**Files:**
- Modify: `CASPER_PROJECT_MEMORY.md` (add section 13 with a note)

**Approach:**
- Add a new section at the end of `CASPER_PROJECT_MEMORY.md`:
  - `## Repository Statistics`
  - Note: current commit count, object count, and explanation that the larger number is git objects (blobs/trees/commits), not commits specifically

**Test scenarios:**
- Test expectation: none — documentation only

**Verification:**
- The note is visible in `CASPER_PROJECT_MEMORY.md`

## System-Wide Impact

- **Interaction graph:** Unit 1 changes `electron/main-loader.js` which is the first code that runs on app boot. Affects every app launch. Unit 2 is isolated to the Printer Settings UI and print service. No other components are affected.
- **Error propagation:** Unit 1 errors are caught by the existing `try/catch` in `main-loader.js` and shown as a boot error dialog. Unit 2 errors are handled by the existing toast pattern. No silent failures.
- **State lifecycle risks:** Unit 2's auto-detect on mount only triggers when `bridgeIpAddress` is empty — no risk of overwriting user data.
- **Unchanged invariants:**
  - The production build pipeline (`npm run dist`) continues to compile bytecode via `compile:bytecode` before packaging. The mtime logic only affects ad-hoc launches, not the build pipeline.
  - The `bridgeIpAddress` field remains hidden in Electron mode — web-only.

## Gaps & Concerns

| ID | Gap | Severity | Resolution |
|---|---|---|---|
| G1 | `bridgeIpAddress` field is hidden in Electron mode — the user's complaint came from the desktop app, so this field is invisible to them. They may have been referring to the auto-detected IP in NetworkGuideModal, which already works correctly. | Medium | Either show the bridge IP field in Electron too, or confirm the user's actual complaint is about the NetworkGuideModal. The plan currently takes the conservative path (keep hidden), but this should be revisited during implementation if the user confirms they need it in Electron. |
| G2 | No automated test strategy for Unit 1 — the mtime loader logic runs inside Electron's main process before any test framework is available. The mtime comparison itself is a few lines of logic, but spawning Electron in CI to test it is expensive. | Medium | Extract the mtime comparison into a standalone helper function in a testable module (e.g., `electron/loader-utils.js`), unit test that helper. The `require()` call itself can be integration-tested manually. |
| G3 | The IP auto-detect in PrinterSettings uses `fetch('/api/network/ip')` which may fail during early app initialization before the Next.js server is fully ready. | Low | Add retry with exponential backoff (3 attempts, 500ms/1s/2s) in `detectLocalIp()`. The current plan doesn't specify retry behavior — adding it during implementation resolves this. |
| G4 | React StrictMode double-mount in development could trigger the auto-detect fetch twice on mount. | Low | Guard auto-detect with a `useRef` flag so it fires at most once per component lifetime. |
| G5 | If the network has multiple valid external IPv4 addresses (multiple NICs), the current `/api/network/ip` endpoint only returns the first one found. The user may expect a specific IP. | Low | Acceptable for now — most setups have one external interface. Document as a future consideration. |

## Risk Analysis & Mitigation

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| mtime comparison fails on filesystems with coarse timestamp granularity (FAT32/exFAT): `.js` and `.jsc` have same mtime after edit+compile | Low | Medium | Use `mtimeMs` (millisecond precision); prefer `.jsc` on exact tie — conservative toward production behavior |
| Race condition: app launches while `compile:bytecode` is mid-write — loader reads a truncated `.jsc` | Low | High | Add atomic write to `compile-bytecode.js`: write to temp file, then rename. Loader already falls back to `.js` if `.jsc` load fails |
| Developer edits `.js`, runs `compile:bytecode` (`.jsc` becomes newer), then wonders why edits aren't loading | Medium | Low | Log at boot: which file was loaded and why. Message: "main.jsc is newer — loading bytecode. Edit main.js to re-enable source loading." |
| React StrictMode double-mount fires auto-detect twice | Medium | Low | Guard with `useRef` flag |
| Auto-detect fires while Next.js dev server hasn't started the API route yet | Low | Medium | Retry with 3-attempt exponential backoff |
| `npm run dev` is stopped — new developers try `electron .` directly without `NODE_ENV=development` | Medium | Low | Unit 1's mtime logic removes this dependency — works regardless of NODE_ENV |
| Multiple valid IPv4 addresses — user detects wrong one | Low | Low | Acceptable; first-found heuristic covers 90% of single-NIC setups |

## Documentation / Operational Notes

- After Unit 1, developers should know that editing `electron/main.js` or `electron/preload.js` will automatically take effect on next app launch without running `compile:bytecode` (as long as the `.js` file is saved later than the `.jsc`)
- The `compile:bytecode` command is still required before creating a distribution build
- Unit 2 makes the Printer Settings more user-friendly for web browser users who need to connect to the Hardware Bridge

## Sources & References

- Related code: `electron/main-loader.js`, `electron/main.js`, `electron/preload.js`, `scripts/compile-bytecode.js`, `src/components/settings/PrinterSettings.tsx`, `src/lib/print-service.ts`, `src/app/api/network/ip/route.ts`
