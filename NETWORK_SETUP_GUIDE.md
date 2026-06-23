# Casper ERP: Multi-Node Network Setup & PostgreSQL Guide

## Architecture Overview
Casper POS is now powered by **PostgreSQL** on the Master Node, enabling a true multi-terminal setup over a Local Area Network (LAN) without cloud dependencies for local queries.

- **MASTER NODE**: Runs the Next.js server, hosts the PostgreSQL database (`casper_pos`), runs database migrations, handles hardware bridging, and manages Bi-Directional Cloud Syncing.
- **SUB-NODE**: Acts as a thin client connecting to the Master's IP. It does NOT run local database migrations and does NOT execute cloud sync tasks.

---

## 1. Prerequisites (Master Node Only)

### Install PostgreSQL
1. Download PostgreSQL 16+ for Windows from the official site.
2. During installation, set the password for the default `postgres` user to: `postgres`.
3. Port: `5432` (Default).
4. Open pgAdmin or psql and create the database:
   ```sql
   CREATE DATABASE casper_pos;
   ```

### Firewall Configuration
You MUST allow inbound traffic on the Master Node to permit Sub-Nodes to connect.
1. Open **Windows Defender Firewall with Advanced Security**.
2. Go to **Inbound Rules** -> **New Rule...**
3. Select **Port** -> **TCP**.
4. Specify local ports: `5432` (PostgreSQL), `3001` (Next.js App), and `4040` (Hardware Print Bridge).
5. Allow the connection and name it `Casper POS LAN`.

---

## 2. Bootstrapping the System

### Initial Startup (Setup Wizard)
1. Launch the `Casper POS.exe` on the Master Node.
2. The system will detect it is unconfigured and redirect to the **Setup Wizard**.
3. Select **"Master Server"** role.
4. *(Optional)* If migrating from an old offline setup, place the old `dev.db` in the app's roaming folder and click **"Import Legacy Data"** to copy all records into PostgreSQL.
5. Click **Finish & Restart**. The app will automatically run Prisma migrations and start the server.

### Setting up a Sub-Node
1. Launch the `Casper POS.exe` on the Sub-Node machine.
2. The Setup Wizard will appear.
3. Select **"Sub-Node"**.
4. Enter the **IP Address of the Master Node** (e.g., `192.168.1.50`).
5. Click **Finish & Restart**. The Sub-Node will bypass local DB checks and connect directly to the Master via LAN.

---

## 3. CI/CD & Auto-Updater

The project utilizes a generic deployment provider targeting a Contabo VPS.
1. Pushing to `main` triggers the `.github/workflows/deploy.yml` Action.
2. The action builds the Windows executable and copies it via SCP to the Contabo Nginx server.
3. The Casper POS instances ping `https://updates.casper-erp.com/desktop/latest.yml` on boot.
4. Updates download silently in the background and install automatically when the cashier closes the app.

## 4. Hardware Bridge Printing
Sub-Nodes do not need local printers if the Master Node acts as the print server.
When a Sub-Node attempts to print a receipt, the `PrintService` automatically routes the request over the LAN to `http://[MASTER_IP]:4040/api/print`.
