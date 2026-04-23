---
status: active
created: 2026-04-23
deepened: false
---

# Direct Print for Manual Buttons

This plan addresses the user's request to trigger direct, silent printing when manually clicking "Engineer Copy", "Customer Receipt", or "Print Label" inside the ticket details page, provided that the required printers are configured.

## Problem Context
Currently, the manual print buttons inside `src/app/[locale]/maintenance/tickets/[id]/page.tsx` are hardcoded to `setIsSilentPrint(false)`, meaning they *always* open the full print settings modal and wait for the user to click "Print", even if the store has printers configured and "Speed Print" is enabled.

## Proposed Changes

### 1. `src/app/[locale]/maintenance/tickets/[id]/page.tsx`
Update the `onClick` handlers for the three print buttons located in the top-left action bar.

Instead of hardcoding `setIsSilentPrint(false)`, we will conditionally set the `silent` flag based on the presence of configured printers and the global `isSpeedPrintEnabled` state (which we just linked in the previous session).

*   **Print Label Button:**
    *   `const silent = hasLabelPrinter() && isSpeedPrintEnabled;`
    *   `setIsSilentPrint(silent)`
*   **Print Engineer Copy Button:**
    *   `const silent = hasThermalPrinter() && isSpeedPrintEnabled;`
    *   `setIsSilentPrint(silent)`
*   **Print Receipt Button:**
    *   `const silent = hasThermalPrinter() && isSpeedPrintEnabled;`
    *   `setIsSilentPrint(silent)`

If `silent` evaluates to `true`, the `TicketPrintOptionsModal` will open in the background, instantly dispatch the print job to the hardware, and close itself without requiring any additional clicks from the user. If `false` (no printer configured), the modal will open normally to let the user configure their settings.
