---
title: Headless Printing and Manual Preview Override
date: 2026-04-23
category: docs/solutions/workflow-issues/
module: Maintenance / Tickets / Printing
problem_type: workflow_issue
component: tooling
severity: medium
applies_when:
  - "High-volume printing workflows where speed is critical"
  - "Automated actions that require occasional manual inspection"
tags: [printing, headless, manual-override, ux, localization, qz-tray]
---

# Headless Printing and Manual Preview Override

## Context
The Casper POS printing workflow was previously slowed down by a mandatory preview modal (`TicketPrintOptionsModal`) for every ticket. While this provided control, it created friction for high-volume retail environments where printers are already configured and stable. Users wanted a "one-click" experience without losing the ability to manually inspect or change print options when needed.

## Guidance
Implement a **Headless Printing** (Silent) mode as the default behavior when speed-print is enabled, combined with a **Manual Override** mechanism.

1.  **Headless Default**: When the "Speed Print" (Direct Print) toggle is enabled, bypass the preview modal and send the payload directly to the `printService`.
2.  **Hardware Guard**: Use a utility like `checkPrinterAndRedirect` to verify printer availability BEFORE attempting a silent print. If hardware is missing, automatically redirect to settings instead of failing silently.
3.  **Manual Override**: Detect the `Shift` key during the click event (`e.shiftKey`) to force-open the preview modal regardless of the headless setting.
4.  **Visual Feedback**: Since the modal is removed, use localized button states (e.g., "Printing...", "جاري التحقق...") and loading spinners to provide immediate feedback to the user.

## Why This Matters
*   **Efficiency**: Reduces the "click-to-paper" time significantly in high-pressure environments.
*   **Error Prevention**: Prevents users from clicking "Print" and wondering why nothing happened if a printer was disconnected (by redirecting to settings).
*   **Flexibility**: Maintains the full feature set of the preview modal (selecting copies, changing printers) for cases where the default behavior is insufficient.

## When to Apply
*   When implementing any automated workflow that is usually standard but occasionally needs tuning.
*   In POS systems, warehouse management, or shipping stations where throughput is the primary metric.

## Examples

### Manual Override Implementation (React)
```tsx
const handlePrint = async (e: React.MouseEvent) => {
    const isManualOverride = e.shiftKey;
    
    // Check if printers are ready if we are NOT in manual override
    if (!isManualOverride && !await checkPrinterAndRedirect('receipt', router, locale)) {
        return;
    }

    const silent = isSpeedPrintEnabled && !isManualOverride;
    
    if (silent) {
        // Trigger direct print without modal
        setIsSilentPrint(true);
        setShowPrintOptions(true); // Modal component handles the actual print-and-close logic
    } else {
        // Show the modal normally
        setIsSilentPrint(false);
        setShowPrintOptions(true);
    }
}
```

### UX Feedback (Arabic)
```tsx
<Button onClick={handlePrint} disabled={isPrinting}>
    {isPrinting ? <Loader2 className="animate-spin" /> : <Printer />}
    {isPrinting ? t('workflow.syncing') : t('printOptions.printReceipt')}
</Button>
<span className="text-xs text-zinc-400">
    {t('printOptions.shiftClickHint')} // "(Shift + Click) للمعاينة اليدوية"
</span>
```

## Related
- [Hardware Bridge Architecture](../../knowledge/hardware-bridge-hybrid/artifacts/hybrid-bridge-architecture.md)
- [Ticket System Refactor](../../knowledge/ticket-system-refactor/artifacts/refactor_summary.md)
