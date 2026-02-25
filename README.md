# Casper POS Desktop

Casper POS Desktop is a modern, offline-first Point of Sale application built with Next.js, Electron, Prisma, and SQLite.

## Core Features

- **Offline-First Resilience**: Transactions are logged locally to IndexedDB and securely mirrored to a local SQLite database for maximum durability, even without an internet connection.
- **Guided Setup Wizard**: First-time launch provides a seamless setup experience, allowing you to choose your database storage location and establish the first Admin superuser account.
- **Automated Background Updates**: Powered by `electron-updater` and GitHub Releases. New versions download silently over-the-air. A "Restart to Update" button appears when ready, ensuring cashiers are never interrupted.
- **High-Speed Thermal Printing**: Direct IPC integration for silent, rapid ESC/POS thermal printing with RTL Arabic support.
- **Production-Ready Performance**: Electron initialization is accelerated using V8 bytecode compilation (`bytenode`), and the local SQLite database runs in WAL mode for high-concurrency read/writes.

## Prerequisites

- **Node.js**: v18+ (v20+ recommended)
- **Windows**: Target platform for the executable.

## Development Setup

1. **Install Dependencies**:

   ```bash
   npm install
   ```

2. **Start Development Server**:

   ```bash
   npm run dev
   ```

   This will spin up Next.js on port 3001 and launch the Electron wrapper with hot-reloading.

## Production Build & Code Signing

The build pipeline uses `electron-builder` to package the Next.js standalone output and Prisma engines into a secure `.asar` and single executable installer.

### To release an update

1. You must have a valid Code Signing Certificate to avoid Windows SmartScreen warnings. Set the required environment variables:

   ```powershell
   $env:WIN_CSC_LINK="C:\path\to\your\certificate.pfx"
   $env:WIN_CSC_KEY_PASSWORD="your-password"
   $env:GH_TOKEN="your-github-personal-access-token"
   ```

2. Update the `version` in `package.json`.
3. Run the full distribution pipeline:

   ```bash
   npm run dist
   ```

4. The signed executable and `latest.yml` will be published as a Draft Release on your GitHub repository. Publish the release to automatically deploy it to all terminals.

## Data Maintenance

The application features a built-in Desktop Status widget (located in the top header) which provides:

- Live network connectivity status.
- Real-time backup monitoring.
- One-click Database Vacuuming (Optimization).
- One-click Support Bundle Export for troubleshooting.
