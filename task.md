# Stage 3: Surgical Build Task List

- [x] Task 1: Viewport & dynamic height foundation in `src/app/layout.tsx` and `src/app/globals.css`
- [x] Task 2: Replace `h-screen` with `h-[100dvh]` across `LayoutContent.tsx`, `pos/page.tsx`, and `maintenance/tickets/[id]/page.tsx`
- [x] Task 3: Electron window constraint (`minWidth: 900, minHeight: 640`) in `electron/main.js`
- [x] Task 4: Extract shared RBAC hook `src/hooks/useFilteredNavItems.ts` and refactor `src/components/Sidebar.tsx`
- [x] Task 5: Implement `src/components/MobileHeader.tsx` with Radix Dialog navigation drawer
- [x] Task 6: Refactor `src/app/LayoutContent.tsx` with `hidden md:flex` sidebar and `<MobileHeader />`
- [x] Task 7: Implement mobile POS layout in `src/app/(routes)/pos/POSClientAPI.tsx` and `src/app/(routes)/pos/page.tsx` with `disableHotkeys`, `effectiveIsMobile`, bottom cart sheet, and >=44px touch steppers
