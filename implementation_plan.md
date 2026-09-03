# Mobile Optimization Strategy & Architecture Plan (v4 — FINAL)
> **Ironclad Score: 82% architecture** | **Effective score: ~65% until bugs #1, #2, #4, #8–10 are resolved**  
> *Reviews applied: `mobile_plan_review.md` (10 items) + `mobile_plan_review_v3.md` (2 items) — all 12 resolved*

---

## Executive Overview
Casper POS is currently desktop-first with rigid horizontal split views (`h-screen`, `w-20` sidebar, `w-[380px]` cart, multi-column datagrids, and missing mobile viewport meta). Goal: fully responsive + touch-friendly on phones/tablets, preserving 100% of desktop cashier workflow, keyboard shortcuts, and financial precision.

> [!CAUTION]
> **Execution is gated on resolving these 4 items before merging Phase 2 to production:**
> 1. **Bug #1** — `isMobile` race condition (lazy `useState` init, not `useEffect`)
> 2. **Bug #2** — No `resize` listener (orientation flip / window resize breaks state)
> 3. **Design Gap #4** — Shared `useFilteredNavItems()` hook (no dual RBAC logic copies)
> 4. **QA Gap #8** — Real device pass (iOS Safari + Android Chrome) before Phase 2 ships

---

## 1. Summary Table: Current State vs. Target

| Component / Layer | Current State | Target (<768px) | Risk |
| :--- | :--- | :--- | :--- |
| **Viewport & Meta** | Missing `viewport` export in `layout.tsx` | `width: 'device-width', initialScale: 1, viewportFit: 'cover'` | Zero |
| **App Shell** | Fixed sidebar `w-20`/`w-64` | `hidden md:flex` sidebar + `<MobileHeader>` (`@radix-ui/react-dialog` drawer) | Low |
| **`h-screen` Heights** | 6 occurrences across 3 files | `h-[100dvh]` + `globals.css` fallback | Low |
| **Modals / Dialogs** | Fixed `w-[550px]`, `w-[700px]` | `w-[calc(100vw-2rem)] max-w-[550px]` | Low |
| **Dashboard & KPIs** | Multi-column grids | `grid-cols-1 sm:grid-cols-2 lg:grid-cols-4` | Low |
| **POS Terminal** | Rigid split: Cart + Products + Categories | Fullscreen grid + sticky cart bar + `@radix-ui/react-dialog` bottom sheet | Medium |
| **POS Hotkeys** | `window.keydown` fires unconditionally | `disableHotkeys` prop; gated by lazy `isMobile` state | Medium → Mitigated |
| **VirtuosoGrid** | `gridCols=5` default, `height: '100%'` | Mobile default `2` cols; `key` remount on switch | High → Mitigated |
| **MutationObserver Focus** | Fires `.focus()` on all DOM changes | Touch-device guard: `if ('ontouchstart' in window) return;` | Medium → Mitigated |
| **DataGrids** | 12-column spreadsheet | Keep on desktop; `overflow-x-auto` on mobile (card fallback deferred) | Medium |
| **Touch Targets** | 24px buttons | Min 44×44px in cart drawer; `env(safe-area-inset-bottom)` | Low |
| **Electron Window** | No minimum size | `minWidth: 900, minHeight: 640` in `BrowserWindow` | Zero |
| **RBAC Navigation** | N/A | Shared `useFilteredNavItems()` hook (no dual copies) | Medium |
| **Mobile Kill-Switch** | N/A | Feature flag `mobile_layout_enabled` (default `true`) | Low |

---

## 2. Dependency Clarification

> [!IMPORTANT]
> **NO new libraries.** Use `@radix-ui/react-dialog` (already in `package.json`) for bottom sheets:
> ```
> fixed bottom-0 top-auto inset-x-0 rounded-t-2xl max-h-[90dvh] overflow-y-auto
> data-[state=open]:animate-in data-[state=closed]:animate-out
> data-[state=closed]:slide-out-to-bottom data-[state=open]:slide-in-from-bottom
> pb-[env(safe-area-inset-bottom)]
> ```
> Z-index: `z-[9998]` (below `TitleBar` at `9999`).

---

## 3. Bug Fixes Required (Build Blockers)

### Bug #1 — `isMobile` Race Condition (HIGH)
**Problem:** `isMobile` initialized via `useEffect` (runs post-mount) while `gridCols` init checks `window.innerWidth` directly (runs at `useState` time). First render on mobile: `gridCols=2` ✅ but `isMobile=false` ❌ — hotkeys stay active for one full render pass.

**Fix:**
```typescript
// ❌ WRONG — causes one-render hotkey window on mobile
const [isMobile, setIsMobile] = useState(false);
useEffect(() => { setIsMobile(window.innerWidth < 768); }, []);

// ✅ CORRECT — lazy initializer runs synchronously on mount
const [isMobile, setIsMobile] = useState(
  () => typeof window !== 'undefined' && window.innerWidth < 768
);
// Keep a separate resize-only useEffect for updates (see Bug #2)
```

### Bug #2 — No Resize / Orientation Listener (HIGH)
**Problem:** `isMobile` is computed once at mount and never updates. A tablet rotating orientation (portrait 768px → landscape 1024px) or an Electron window resize does not flip the layout state — CSS breakpoints (`hidden md:flex`) switch visually, but JS state (`isMobile`, `disableHotkeys`, `gridCols`) stays stale. This creates a state/UI mismatch: sidebar may show mobile drawer while hotkeys still run in desktop mode.

**Fix:** Use `useDebouncedCallback` at component top level (it's a hook — cannot be called inside `useEffect`), then reference it in the effect:
```typescript
import { useDebouncedCallback } from 'use-debounce'; // already in package.json

// ── At component top level (alongside useState declarations) ──
const handleResize = useDebouncedCallback(() => {
  setIsMobile(window.innerWidth < 768);
}, 150); // 150ms — avoids thrashing during resize drag / orientation animation

// ── In a mount-only useEffect ──
useEffect(() => {
  window.addEventListener('resize', handleResize);
  return () => window.removeEventListener('resize', handleResize);
}, [handleResize]); // stable ref — useDebouncedCallback returns a stable function
```

> [!WARNING]
> Do NOT call `useDebouncedCallback` or any hook inside `useEffect`. Do NOT use bare `debounce()` from lodash — `use-debounce` is already in `package.json` and provides the hook form.

### Bug #3 — `minWidth: 900` on Low-Res Netbooks (LOW — Noted, Not Fixed)
**Known Limitation:** On a physical screen narrower than 900px, Electron's `minWidth` may push the window partially off-screen. This is an accepted limitation for sub-900px hardware. Document in `README.md` under "Minimum System Requirements." No code fix required.

### Bug #14 — `isMobile` + `gridCols` Lazy Init Causes SSR Hydration Mismatch (MEDIUM — Decision Required)
**Problem:** `POSClientAPI` is a `'use client'` component, but Next.js still SSRs it. The lazy `useState(() => typeof window !== 'undefined' && window.innerWidth < 768)` initializer evaluates on the server as `false` (no `window`). On the client, it evaluates to the real value. Both `isMobile` **and `gridCols`** have this problem — `gridCols` is initialized from `window.innerWidth` too. Any JSX or prop that branches on either (`VirtuosoGrid` column count, `disableHotkeys` prop) will mismatch between server HTML and client first-render, causing React hydration warnings and a flash of desktop layout on mobile.

**Explicit Decision (mark one before Phase 2 build starts):**
- [ ] **`mounted` flag pattern (Recommended)** — SSR-safe defaults for all window-dependent state. Real values applied after mount only.
  ```typescript
  // ── State declarations (all SSR-safe defaults) ──
  const [mounted, setMounted] = useState(false);
  const [isMobile, setIsMobile] = useState(false);     // SSR default: false
  const [gridCols, setGridCols] = useState(5);          // SSR default: desktop columns

  // ── Single mount effect: set all window-dependent state together ──
  useEffect(() => {
    const mobile = window.innerWidth < 768;
    setMounted(true);
    setIsMobile(mobile);
    setGridCols(mobile ? 2 : 5);
  }, []);

  // ── Derived: only true after mount AND window confirms mobile ──
  const effectiveIsMobile = mounted && isMobile;

  // ── Usage in JSX ──
  // disableHotkeys={effectiveIsMobile}          ← NOT isMobile
  // key={effectiveIsMobile ? 'grid-mobile' : 'grid-desktop'}  ← NOT isMobile
  ```
- [ ] **`suppressHydrationWarning`** — Wraps mismatched JSX. Hides the warning, does not fix the cause. Flash still occurs. Not recommended — masks real errors.
- [ ] **CSS-only layout** — Drive all visual differences through Tailwind breakpoints (`hidden md:flex`). Restrict `isMobile` JS state to non-visual behavior only. Requires `gridCols` to use a CSS `grid-template-columns` approach instead of a JS state integer. More work, eliminates the problem at root.

> Recommendation: **`mounted` flag** for Phase 2. Lowest risk, minimal code change, consistent with the codebase pattern. Phase 2 checklist cross-references this section — do NOT copy this snippet into the checklist.

---

## 4. Design Gaps (Architecture Fixes)

### Gap #4 — Shared `useFilteredNavItems()` Hook (CRITICAL — Build Blocker)
**Problem:** `MobileHeader` copying RBAC `filteredItems` logic from `Sidebar.tsx:235–260` creates two sources of truth. When a new permission or feature flag is added, one copy will be missed, silently exposing restricted routes to mobile users.

**Fix:** Extract into `src/hooks/useFilteredNavItems.ts`:
```typescript
// src/hooks/useFilteredNavItems.ts
export function useFilteredNavItems(user: any, settings: any) {
  // Move the exact logic from Sidebar.tsx:235–260 here
  // Both <Sidebar> and <MobileHeader> import and call this hook
}
```
Both `Sidebar.tsx` and `MobileHeader.tsx` call `useFilteredNavItems(user, settings)`.

### Gap #5 — VirtuosoGrid Remount on Orientation Flip (PRODUCT DECISION REQUIRED)
**Problem:** `key={isMobile ? 'grid-mobile' : 'grid-desktop'}` forces a full Virtuoso remount on every mobile↔desktop breakpoint crossing. For a one-time load, this is fine. For a tablet user rotating the device mid-session while a cart is building, the product list resets scroll position to the top every time.

**Explicit Decision (mark one before build starts):**
- [ ] **Accept** — scroll position loss on orientation change is acceptable for this use case (POS product grid, user can re-scroll quickly).
- [ ] **Reject** — implement scroll-position restoration via `useRef` storing `scrollTop` before remount and restoring after.

> Recommendation: **Accept** for Phase 2. The POS product grid is short-session (pick item → add → done). Scroll memory is a delight feature, not a blocker. Document the trade-off.

### Gap #6 — DataGrid Mobile Fallback Tracking (PROCESS)
**Resolution:** Mobile card fallback for `PurchaseDataGrid` is explicitly deferred to **Phase 4** with a tracked decision:

> **Accepted Limitation (Phase 3 completion):** `PurchaseDataGrid.tsx` (2,373 lines, 12-column keyboard spreadsheet) renders with `overflow-x-auto` horizontal scroll on mobile. Full card-per-row fallback is deferred to Phase 4. Until then, Purchasing invoice entry on mobile is functional but not ergonomic — it requires landscape orientation.

Phase 4 item: `[ ] PurchaseDataGrid mobile card fallback with bottom-sheet row editor`

### Gap #7 — Feature Flag / Kill-Switch for Mobile Layout (PROCESS)
**Problem:** Phase 2 touches the primary cashier checkout flow. Ship-to-all on a live POS = high blast radius if something breaks.

**Fix:** Add `mobile_layout_enabled` to the store `features` JSON (settings):
```typescript
// In LayoutContent.tsx / POSClientAPI.tsx — read from settings
const isMobileLayoutEnabled = features?.mobile_layout_enabled !== false; // default: true
// If false: always render desktop layout regardless of window width
```
This allows emergency disablement from the Settings page without a deploy.

---

## 5. Phased Implementation Plan (FINAL)

### Phase 1: Global Mobile Foundation
- [ ] Add `export const viewport: Viewport` to `src/app/layout.tsx`
- [ ] Replace `h-screen` → `h-[100dvh]` in:
  - `src/app/LayoutContent.tsx` (lines 209, 222)
  - `src/app/(routes)/pos/page.tsx` (line 109)
  - `src/app/[locale]/maintenance/tickets/[id]/page.tsx` (lines 449, 458, 470)
  - Add `globals.css` fallback: `@supports (height: 100dvh) { .h-screen { height: 100dvh; } }`
- [ ] Add `minWidth: 900, minHeight: 640` to `BrowserWindow` in `electron/main.js`
- [ ] **Extract `useFilteredNavItems()` hook** from `Sidebar.tsx:235–260` into `src/hooks/useFilteredNavItems.ts` ← *Bug #4 fix*
- [ ] Refactor `src/app/LayoutContent.tsx`:
  - Desktop sidebar: `<div className="hidden md:flex h-full"><Sidebar ... /></div>`
  - Add `<MobileHeader />` using `@radix-ui/react-dialog` for slide-over nav drawer
  - `MobileHeader` calls `useFilteredNavItems()` — no permission logic duplication
- [ ] Normalize modal widths: `w-[calc(100vw-2rem)] max-w-[550px]`
- [ ] Add `mobile_layout_enabled` feature flag read in layout-sensitive components ← *Gap #7 fix*

### Phase 2: POS Mobile Overhaul

> [!CAUTION]
> **Phase 1 → Phase 2 Transition Gate (hard blocker):**  
> Real-device QA pass on Phase 1 changes MUST complete before any Phase 2 work starts.  
> Phase 1 ships `h-[100dvh]`, `env(safe-area-inset-bottom)`, and `viewportFit: 'cover'` — exactly the changes Chrome DevTools emulation gets wrong. Do not assume Phase 1 is correct without a real iOS Safari + Android Chrome pass.
> - [ ] iOS Safari (iPhone, iOS 16+) — `dvh` height, notch safe area, modal widths
> - [ ] Android Chrome — orientation flip, `100dvh` scroll container behavior
- [ ] **`isMobile` state + `mounted` flag** (Bugs #1, #14 fix) — implementation in **Section 3, Bug #14**. Use the `mounted`-flag pattern verbatim. SSR-safe defaults for `isMobile` and `gridCols`. Derive `effectiveIsMobile = mounted && isMobile`. Do NOT inline a new snippet here.
- [ ] **Debounced resize listener** (Bug #2 fix) — implementation in **Section 3, Bug #2**. Use `useDebouncedCallback` hook form verbatim. Do NOT inline a new snippet here.
- [ ] Add `disableHotkeys?: boolean` prop to `POSClientAPI`. Skip `handleGlobalKeyDown` when `true`.
- [ ] Pass `disableHotkeys={effectiveIsMobile}` ← use `effectiveIsMobile`, NOT `isMobile` (see Section 3, Bug #14).
- [ ] `gridCols` SSR-safe default and mobile value set inside the `mounted` `useEffect` (Section 3, Bug #14) — no separate `useState` lazy init for `gridCols`.
- [ ] Touch-device guard in `restoreFocus()`: `if ('ontouchstart' in window) return;`
- [ ] Add `key={effectiveIsMobile ? 'grid-mobile' : 'grid-desktop'}` on `VirtuosoGrid` ← use `effectiveIsMobile`, NOT `isMobile` (Gap #5 accept trade-off).
- [ ] On `md+`: desktop split layout unchanged
- [ ] On `<md`:
  - Fullscreen product catalog + swipeable category rail
  - Sticky bottom cart bar: `formatCurrency(finalTotal)` + item count badge
  - Cart drawer: `@radix-ui/react-dialog` as bottom sheet (Section 2 CSS)
  - Quantity steppers: `min-h-[44px] min-w-[44px]`
  - Checkout CTA → `setIsCheckoutOpen(true)` → existing `CheckoutModal`
  - `pb-[env(safe-area-inset-bottom)]` on drawer

### Phase 3: Secondary Pages
- [ ] `Dashboard`: `grid-cols-1 sm:grid-cols-2 lg:grid-cols-4` KPI cards
- [ ] `Inventory` & `Purchasing`: `overflow-x-auto` + touch-scroll hints on tables
- [ ] `Reports`: Responsive chart containers

### Phase 4: Deferred Work (Tracked)
- [ ] `PurchaseDataGrid` mobile card fallback with bottom-sheet row editor
- [ ] `Maintenance / Tickets` mobile-friendly tabs and status stepper

---

## 6. Verification Plan (HARDENED)

### Automated Tests
```bash
# Playwright e2e — mobile viewport smoke test (NEW — required before Phase 2 merge)
# Test file: tests/mobile-pos.spec.ts
npx playwright test tests/mobile-pos.spec.ts --project=mobile-chrome
```
**E2e test must cover (minimum):**
1. Open `/pos` at 390px viewport — assert product grid renders `> 0` visible items
2. Tap first product card — assert cart badge shows `1`
3. Tap cart bar — assert bottom sheet opens
4. Tap Checkout in sheet — assert `CheckoutModal` dialog opens
5. Verify `Space` key press in customer name input does NOT trigger `holdCart()`

### Real Device Passes

> [!IMPORTANT]
> **Gate point is Phase 1 → Phase 2 transition, not Phase 2 merge.**  
> The `dvh`, `env(safe-area-inset-bottom)`, and `viewportFit` changes land in Phase 1. These must be validated on real devices before Phase 2 starts building on top of them.

**Phase 1 gate (before Phase 2 starts):**
- [ ] **iOS Safari** — iPhone (any model, iOS 16+): `dvh` height, `env(safe-area-inset-bottom)`, modal width rendering
- [ ] **Android Chrome** — Any Pixel or Samsung: `100dvh` scroll behavior, orientation flip layout

**Phase 2 gate (before Phase 2 merges to main):**
- [ ] iOS Safari — cart bottom sheet animation, checkout CTA above notch, virtual keyboard behavior
- [ ] Android Chrome — cart drawer open/close, quantity stepper touch targets (44px), orientation flip during active cart

### RBAC Navigation Matrix Test
Test at minimum one user per major permission boundary (not just one sample):

| Role | `/purchasing` visible? | `/treasury` visible? | `/admin/licenses` visible? |
| :--- | :--- | :--- | :--- |
| ADMIN | ✅ | ✅ | ✅ |
| Cashier (POS only) | ❌ | ❌ | ❌ |
| Purchasing Manager | ✅ | ❌ | ❌ |
| Accountant | ❌ | ✅ | ❌ |

### Desktop / Electron Non-Regression
- [ ] Electron `minWidth: 900` is respected (window cannot be dragged below 900px)
- [ ] All keyboard hotkeys (`Space`, `Enter`, `Ctrl+P`, `Delete`, `Backspace`) function correctly
- [ ] VirtuosoGrid renders products without blank state on desktop
- [ ] `MobileHeader` is NOT visible at desktop widths
- [ ] **Kill-switch: `mobile_layout_enabled: false`** — Set flag in Settings; confirm desktop layout renders on a <768px viewport (mobile layout is suppressed)
- [ ] **Kill-switch: flag absent (not set)** — Remove key from settings JSON entirely; confirm mobile layout is enabled by default (per `features?.mobile_layout_enabled !== false` logic)

### Build & Type Check
```bash
npm run build
# Zero TypeScript errors. Zero new `any` types introduced.
```

---

## 7. Known Limitations (Explicit — Not Deferred Into Oblivion)

| Limitation | Accepted? | Tracking |
| :--- | :--- | :--- |
| Scroll position resets on orientation change (VirtuosoGrid `key` remount) | ✅ Accepted for Phase 2 | Phase 4 if complaints received |
| `PurchaseDataGrid` not mobile-ergonomic (horizontal scroll only) | ✅ Accepted for Phase 3 | Phase 4 card fallback |
| `Maintenance / Tickets` detail page not mobile-optimized | ✅ Accepted for Phase 3 | Phase 4 |
| Netbook/low-res laptop with screen <900px may have partial window off-screen | ✅ Accepted — document in README | System requirement note |
| Chrome DevTools emulation only for Phase 1 QA | ❌ NOT accepted | Real device gate at Phase 1→Phase 2 transition AND Phase 2 merge |
