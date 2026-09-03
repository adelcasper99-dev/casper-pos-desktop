# Mobile POS & ERP Engineering Best Practices (Stage 0b Research)

## 1. Viewport & Dynamic Height Architecture
- **Problem**: Classic `100vh` in mobile browsers (WebKit / Chrome Mobile) computes to full screen including navigation/URL bars, hiding bottom controls (CTAs) behind dynamic browser chrome.
- **Industry Standard**: Next.js 14+ `export const viewport: Viewport = { width: 'device-width', initialScale: 1, viewportFit: 'cover' }`.
- **CSS Solution**: Use `100dvh` (Dynamic Viewport Height) with fallback `@supports (height: 100dvh) { ... }`.
- **Safe Area Insets**: Mandate `env(safe-area-inset-bottom)` padding for bottom bars and checkout sheets on notched displays (iPhone / modern Android).

## 2. Touch Target Ergonomics & Accessibility (WCAG 2.5.5)
- Standard minimum touch target: **44×44px** for actionable buttons (quantity increment/decrement, clear, checkout trigger).
- Cart drawer steppers must not use desktop 24px (`w-6 h-6`) buttons.
- Sticky checkout bar with fixed bottom dock provides ergonomic thumb-reach zone.

## 3. Hydration-Safe Mobile Breakpoint Detection (Next.js App Router)
- **Problem**: `typeof window !== 'undefined'` evaluation in `useState` initializer causes SSR / client HTML mismatch, triggering React hydration errors and layout pop.
- **Industry Standard**:
  1. Default to server-safe state (`mounted = false`, `isMobile = false`, default `gridCols = 5`).
  2. In `useEffect` (client-only post-mount), set `mounted = true`, measure `window.innerWidth < 768`, update `isMobile` and `gridCols`.
  3. Derive `effectiveIsMobile = mounted && isMobile`.

## 4. Orientation & Viewport Resize Stability
- Debounce window resize callbacks with 150ms window using `useDebouncedCallback`.
- Separate hardware keydown handlers (barcode scanners) from mobile soft keyboard input events by conditionally detaching event listeners when `effectiveIsMobile` is active.
