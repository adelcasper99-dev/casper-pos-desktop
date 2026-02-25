# Quickstart: Baseline Casper POS Desktop

## Environment Setup

1. Run `npm install` to ensure all dependencies (`dexie`, `prisma`, `lucide-react`, `electron-updater`) are present.
2. Ensure you have Windows build tools installed for any native module compilation.

## Running the Baseline

1. Start the dev server: `npm run dev`
2. The Electron app will open automatically.
3. **If this is the first run:** You will be intercepted by the **Setup Wizard**. Follow the prompts to configure your database location and navigate to the admin initialization panel.

## Verifying Core Features

### 1. Offline Mode

- Disconnect your internet connection.
- Process a "Speed Print" sale.
- Verify the transaction appears in the "Offline Status" indicator.

### 2. Auto-Backup

- The system mirrors IndexedDB to SQLite every 5 minutes.
- You can manually trigger a filesystem backup from the **Desktop Status** widget in the POS header.

### 3. Background Auto-Updates

- The system queries GitHub Releases automatically on boot.
- If a new version exists, it downloads silently. The Desktop Status widget will show download progress and reveal a "Restart to Update" button when ready.
- See `CODE_SIGNING_AND_UPDATES.md` for release instructions.

### 4. Data Integrity

- The database operates in WAL mode with rigorous `PRAGMA` constraints.
- You can trigger a `VACUUM` (Optimization) directly from the POS interface using the "Wand" icon in the Desktop Status widget.

## Troubleshooting

- **Setup Loop**: If the Setup Wizard keeps appearing, ensure the application has write access to your `%APPDATA%` (or custom selected) database directory.
- **IPC Fails**: Check `electron/preload.js` for missing context bridge exports.
- **Printing Misfires**: Set a default printer in Windows Settings for "Speed Print" to target automatically.
