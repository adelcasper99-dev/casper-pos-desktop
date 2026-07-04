# Fix Electron Thermal Print Margins (Ironclad Revised)

## Objective
Enable hardware-level thermal margin calibration (top, right, bottom, left) over the native Electron IPC channel safely, while maintaining backward compatibility and providing a visual UI preview for thermal padding.

## User Review Required

- This plan alters the Electron IPC signature for `print:thermal`. The Electron renderer will pass a new optional `margins` object.
- Validated via Zod on the main process to ensure safety. Limits set to max 30mm to prevent Chromium print rendering crashes.
- Adds a visual receipt preview box to `PrinterSettings.tsx`.

## Stack / Tools
- Electron Main / Preload (IPC)
- Zod (IPC Validation)
- React / Zustand (Frontend Settings)

## Data Model Changes
None. (Registry types were already updated).

## API / Action Layer
**IPC Channel:** `print:thermal`
- Request: `[html: string, printerName: string, paperWidthMm: number, margins?: { top, right, bottom, left }]`
- Response: `{ success: boolean, error?: string }`

## Business Logic

### 1. IPC Schema (`electron/ipc-schemas.js`)
Update `PrintThermalSchema` to include an optional 4th argument with max limits:
```javascript
const PrintThermalSchema = z.tuple([
    z.string().max(200000, 'HTML payload too large (max 200KB)'),
    z.string().min(1, 'Printer name is required'),
    z.number().int().min(40).max(300),
    z.object({
        top: z.number().min(0).max(30).default(0),
        right: z.number().min(0).max(30).default(0),
        bottom: z.number().min(0).max(30).default(0),
        left: z.number().min(0).max(30).default(0)
    }).optional()
]);
```

### 2. Preload (`electron/preload.js`)
Pass the new `margins` object to `ipcRenderer.invoke`:
```javascript
printThermal: (html, printerName, paperWidthMm, margins) =>
    ipcRenderer.invoke('print:thermal', html, printerName, paperWidthMm, margins),
```

### 3. Main Process (`electron/main.js`)
Update `handleThermalPrint` to accept `margins` safely and destructure it with fallbacks:
```javascript
const handleThermalPrint = async (event, html, printerName, paperWidthMm, margins = {}) => {
    const { top = 0, bottom = 0, left = 0, right = 0 } = margins;
    // ...
    margins: { marginType: 'custom', top, bottom, left, right },
```
Update `safeHandle('print:thermal', ...)` to match the new 4-parameter signature.

### 4. Print Service (`src/lib/print-service.ts`)
Update `ElectronPrintChannel` to pass the `margins` object mapped from the registry.

## UI Flow (`src/components/settings/PrinterSettings.tsx`)
Add a dynamic visual receipt preview next to the Thermal Margin sliders, replicating the UX of the A4 margins preview, so users can visually verify what "10mm" padding looks like on a receipt.

## Error Handling Matrix
| Scenario | Handler | User Message |
|----------|---------|--------------|
| Missing margins object from old client | `main.js` fallback to `{}` | None (Silent fallback to 0 margins) |
| Margin exceeds 30mm | Zod IPC Schema Reject | "Invalid margin size" (caught in logs) |

## Testing Checklist
- [ ] **Unit**: Verify Zod schema accepts missing 4th argument.
- [ ] **Edge case**: Pass large margins (e.g., 25mm) to ensure Chromium renderer doesn't crash on 80mm paper.
- [ ] **Integration**: Print actual test receipt with 10mm Left/Right nudge.
