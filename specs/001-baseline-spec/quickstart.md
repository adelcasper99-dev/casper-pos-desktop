# Quickstart: Baseline Casper POS Desktop

## Environment Setup

1. Ensure `uv` is installed and `specify-cli` is active.
2. Run `npm install` to ensure all dependencies (`dexie`, `prisma`, `lucide-react`) are present.

## Running the Baseline

1. Start the dev server: `npm run dev`.
2. Open the Electron app.

## Verifying Features

### 1. Offline Mode

- Disconnect your internet.
- Process a "Speed Print" sale.
- Verify the transaction appears in the "Offline Status" indicator.

### 2. Auto-Backup

- Wait 5 minutes OR trigger a "Manual Backup" from the POS header.
- Locate the backup file in `C:\Users\TheExpert\Downloads\casper pos desktop\backups\`.

### 3. Data Integrity

- Close the app.
- Re-open and check `C:\Users\TheExpert\Downloads\casper pos desktop\build.log` for the "PRAGMA integrity_check: OK" message.

## Troubleshooting

- If IPC fails, check `electron/preload.js` for missing context bridge exports.
- If printing fails, ensure a default printer is set in Windows.
