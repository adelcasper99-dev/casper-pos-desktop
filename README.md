# Casper POS Desktop - Development Setup

This guide explains how to set up the development environment on a new machine.

## Prerequisites

1.  **Node.js**: Install the latest LTS version of Node.js (v18+ recommended).
    -   Download: [nodejs.org](https://nodejs.org/)
2.  **Git** (Optional): If you are using version control.

## Setup Steps

1.  **Copy the Project**:
    -   Copy the `desktop` folder to your new machine.
    -   **Important**: Do NOT copy the `node_modules`, `.next`, or `dist` folders. These will be regenerated.

2.  **Install Dependencies**:
    Open a terminal in the `desktop` folder and run:
    ```bash
    npm install
    ```

3.  **Database Setup (SQLite)**:
    -   **Option A: Keep Existing Data**
        -   Copy the `prisma/local.db` file from your old machine to `desktop/prisma/local.db` on the new machine.
    -   **Option B: Start Fresh**
        -   Run the following command to create a new empty database:
            ```bash
            npx prisma db push
            ```

4.  **Generate Prisma Client**:
    Regardless of Option A or B, you must run:
    ```bash
    npx prisma generate
    ```

## Running the App

### Development Mode
To start the development server (with hot-reload):
```bash
npm run dev
```
-   The app will open in your browser at `http://localhost:3000`.
-   The Electron window will also launch.

### Production Build
To build the Windows installer (`.exe`):
```bash
npm run dist
```
-   The output will be in the `dist` folder.

## Troubleshooting

-   **Database Errors**: If you see errors about "table not found", run `npx prisma db push`.
-   **Native Module Errors**: If `npm install` fails on `sqlite3` or compilation, ensure you have build tools installed (Windows Build Tools) or simply skip `sqlite3` as it's not strictly required (Prisma uses its own engine).
