# Dense Desktop ERP & Attendance Grid Engineering Best Practices (Stage 0b Research)

## 1. Single-Viewport High-Density Data Grid Architecture (Linear / Odoo POS / ERPNext)
- **Problem**: Default table padding (`px-6 py-6`) and large row heights (>80px) cause massive vertical spill. In a 1080p desktop viewport, only 2-3 records fit without page scroll, disorienting POS operators.
- **Industry Standard**:
  - High-density table rows: row height target **34px - 40px** with `px-3 py-1.5` padding.
  - Sticky table headers: `sticky top-0 z-20 bg-zinc-100/95 dark:bg-zinc-900/95 backdrop-blur-xs` preventing loss of column context.
  - Contained scroll boundary: `max-h-[calc(100vh-270px)] overflow-y-auto custom-scrollbar` ensuring page navigation and metrics remain permanently docked in view.

## 2. Compact Segmented Presence Toggles (Toast POS / Square Staff)
- **Problem**: Independent oversized buttons (`p-3 rounded-xl scale-110 rotate-3`) with heavy box-shadows introduce row height distortion and jumpy hover states.
- **Industry Standard**:
  - Segmented inline control strip: `h-7 p-0.5 rounded-lg bg-zinc-100 dark:bg-zinc-900/60 border border-zinc-200/80 dark:border-white/10`.
  - Micro action buttons: `w-7 h-7 rounded-md` with `w-3.5 h-3.5` icons (Check, X, Clock, Coffee).
  - Subtle active state: `bg-emerald-500 text-black shadow-xs font-bold` without radical rotation or scale that breaks row boundary.

## 3. Financial & Numeric Wrapping Guardrails in Dense KPI Cards
- **Problem**: Dynamic currency strings (e.g. `EGP 12,450.00`) wrap decimals or currency units onto a secondary line when flex containers shrink, destroying vertical grid rhythm.
- **Industry Standard**:
  - Layout: `flex items-center justify-between gap-2 min-w-0 overflow-hidden`.
  - Label: `truncate text-xs font-bold min-w-0`.
  - Value: `font-mono tabular-nums whitespace-nowrap shrink-0 text-sm sm:text-base font-black`.

## 4. Optimistic UI & Server Action Concurrency Safety (Casper Core Architecture)
- Maintain optimistic local React state with `previousStates` ref map.
- Clean up debounce timeouts (`pendingTimeouts.current`) on component unmount and rollback gracefully on server action failure.
- Ensure strict Decimal.js / integer parsing without JavaScript floating-point arithmetic errors on bonuses and deductions.
