---
title: Manual Print Buttons Triggering Silent Auto-Print
problem_type: bug
module: tickets
tags: [printing, ux, thermal-printer, modal]
date: 2026-04-23
---

# Problem
The user disabled the "Auto Print" setting, but when clicking the manual "Print Receipt" or "Print Engineer" buttons on the Ticket Details page, the print modal opened with disabled buttons and immediately printed the ticket silently without user consent.

# Root Cause
The `onClick` handlers for the manual print buttons in `src/app/[locale]/maintenance/tickets/[id]/page.tsx` were hardcoded to set `setIsSilentPrint(hasThermalPrinter())`. If the user had a thermal printer configured, the modal opened with `silent=true`. Inside `TicketPrintOptionsModal.tsx`, the `isAutoPrintRequested` flag evaluated to true because `silent` was true, bypassing the user's `settings.autoPrintTicket` toggle. This triggered the `doAutoPrint` sequence immediately, forcing a print and disabling the manual buttons in the modal.

# Solution
Changed the manual button click handlers in `tickets/[id]/page.tsx` to explicitly set `setIsSilentPrint(false)`.

```tsx
// Before
onClick={() => { clearPrintGuard(); setDefaultPrintMode('receipt'); setIsSilentPrint(hasThermalPrinter()); setShowPrintOptions(true); }}

// After
onClick={() => { clearPrintGuard(); setDefaultPrintMode('receipt'); setIsSilentPrint(false); setShowPrintOptions(true); }}
```

# Prevention
Manual user interactions (like clicking a generic "Print" button) should never trigger silent background flags or override user settings unless explicitly intended as a dedicated "Quick Action" (like a lightning bolt). When opening modals, ensure the default state is interactive rather than auto-executing.
