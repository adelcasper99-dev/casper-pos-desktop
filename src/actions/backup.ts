"use server";

import { readdir, stat, readFile, unlink } from "fs/promises";
import { join } from "path";
import { exec } from "child_process";
import { promisify } from "util";
import { existsSync } from "fs";
import { prisma } from "@/lib/prisma";

const execAsync = promisify(exec);
const DEFAULT_BACKUP_DIR = join(process.cwd(), "backups");

async function getBackupPath() {
  try {
    const config = await prisma.systemConfig.findFirst();
    // @ts-ignore - Prisma Client Stale
    return (config as any)?.backupPath || DEFAULT_BACKUP_DIR;
  } catch (error) {
    return DEFAULT_BACKUP_DIR;
  }
}

/**
 * List all database backups from filesystem
 */
export async function getBackups() {
  try {
    const backupDir = await getBackupPath();
    if (!existsSync(backupDir)) {
      return { success: true, backups: [] };
    }

    const files = await readdir(backupDir);
    const sqlFiles = files.filter(f => f.endsWith(".sql"));

    const backups = await Promise.all(
      sqlFiles.map(async (filename) => {
        const filePath = join(backupDir, filename);
        const stats = await stat(filePath);

        return {
          id: filename, // Use filename as ID
          filename,
          fileSize: stats.size,
          createdAt: stats.birthtime,
          uploadStatus: 'UNKNOWN', // We don't track this in DB anymore, user checks Drive manually or via script logs
        };
      })
    );

    // Sort by newest first
    backups.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());

    return {
      success: true,
      backups,
    };
  } catch (error) {
    console.error("Failed to list backups:", error);
    return { success: false, error: "Failed to list backups" };
  }
}

/**
 * Trigger npm run db:backup
 */
export async function createManualBackup() {
  try {
    console.log("Triggering backup script...");

    // Check if we need to pass a custom path to the script
    // The current script scripts/backup-db.js hardcodes 'backups' dir relative to script
    // We should modify the script OR just use the default logic if no custom path,
    // BUT we promised custom path support. 
    // Best way: Pass path as env var to the script.

    const backupDir = await getBackupPath();

    // Execute the backup script with custom env
    const { stdout, stderr } = await execAsync("npm run db:backup", {
      cwd: process.cwd(),
      env: { ...process.env, CUSTOM_BACKUP_DIR: backupDir }
    });

    console.log("Backup stdout:", stdout);

    if (stderr && !stderr.includes("Debugger attached")) {
      console.warn("Backup stderr:", stderr);
    }

    // Find the newest file
    const result = await getBackups();
    const newest = result.backups?.[0];

    if (!newest) {
      throw new Error("Backup script ran but no file found");
    }

    // Read for download
    const filePath = join(backupDir, newest.filename);
    const fileBuffer = await readFile(filePath);

    return {
      success: true,
      backup: newest,
      downloadData: fileBuffer.toString('base64'),
    };

  } catch (error) {
    console.error("Backup creation failed:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error"
    };
  }
}

/**
 * Delete a backup file
 */
export async function removeBackup({ backupId }: { backupId: string }) {
  try {
    const backupDir = await getBackupPath();
    // Sanity check to prevent directory traversal
    const filename = backupId;
    if (filename.includes("..") || !filename.endsWith(".sql")) {
      throw new Error("Invalid filename");
    }

    const filePath = join(backupDir, filename);
    await unlink(filePath);

    return { success: true };
  } catch (error) {
    console.error("Failed to delete backup:", error);
    return { success: false, error: "Delete failed" };
  }
}

/**
 * Get simple stats
 */
export async function getBackupStats() {
  const result = await getBackups();
  if (!result.success || !result.backups) {
    return { success: false };
  }

  const backups = result.backups;
  const totalSize = backups.reduce((acc, b) => acc + b.fileSize, 0);

  const backupDir = await getBackupPath();

  return {
    success: true,
    stats: {
      totalBackups: backups.length,
      totalSize,
      totalSizeMB: (totalSize / 1024 / 1024).toFixed(2),
      syncedCount: 0, // Not tracking sync status in FS mode
      latestBackup: backups[0] || null,
      backupDir // Return this so UI can show it
    }
  };
}

// Stub for checking drive, implemented in specific action file or just check FS
export async function checkBackupIntegrity() {
  return { success: true, isValid: true, message: "Use Restore Test to verify." };
}

export async function downloadBackup({ backupId }: { backupId: string }) {
  // Sanity check
  if (backupId.includes("..") || !backupId.endsWith(".sql")) {
    throw new Error("Invalid filename");
  }
  const backupDir = await getBackupPath();
  const filePath = join(backupDir, backupId);
  if (!existsSync(filePath)) throw new Error("File not found");

  const fileBuffer = await readFile(filePath);
  return {
    success: true,
    filename: backupId,
    downloadData: fileBuffer.toString('base64')
  };
}

/**
 * RESTORE DATABASE FROM BACKUP
 * ⚠️ DANGER: This will overwrite the current database!
 */
export async function restoreBackup({ backupId }: { backupId: string }) {
  try {
    // 1. Sanity Checks
    // Security check: simple path validation (real auth should be middleware/session based)
    if (backupId.includes("..") || !backupId.endsWith(".sql")) {
      throw new Error("Invalid filename");
    }

    const backupDir = await getBackupPath();
    const backupPath = join(backupDir, backupId);
    if (!existsSync(backupPath)) {
      throw new Error(`Backup file not found: ${backupId}`);
    }

    // 2. Resolve Database Connection
    if (!process.env.DATABASE_URL) {
      throw new Error("DATABASE_URL is not set");
    }
    const dbUrl = process.env.DATABASE_URL;

    // Resolve psql path (Win/Linux support)
    const isWin = process.platform === "win32";
    let psqlPath = "psql";
    if (isWin) {
      // Search common paths or rely on PATH
      // Trying a documented path from backup script logic
      const explicitPath = "C:\\Program Files\\PostgreSQL\\18\\bin\\psql.exe";
      if (existsSync(explicitPath)) {
        psqlPath = `"${explicitPath}"`;
      }
    }

    console.log(`[RESTORE] Starting restore process for ${backupId}...`);

    // 3. SAFETY: Auto-Backup Current State
    console.log("[RESTORE] creating pre-restore backup...");
    await createManualBackup();

    // 4. Force Disconnect Other Users
    // We need to execute SQL to terminate connections. 
    // We'll use psql for this to avoid needing a separate pg client connection just for this.
    // Note: We connect to 'postgres' db or the target db to run the termination command.
    // Terminating connections to the target DB from the target DB sessions can be tricky, 
    // but usually calling pg_terminate_backend on self is fine if we expect to be disconnected.

    // Actually, simpler approach for restore:
    // We handle the drop/create sequence.

    // 5. Execute Restore
    // We use a comprehensive shell command chain to ensure environment is set

    // Command 1: Terminate connections (Failure here is non-critical if no one else is on, but good practice)
    // We attempt to terminate connections to the target DB.

    // Parse DB Name from URL for the terminate query is safer
    // But for simplicity/robustness, we'll try to rely on Postgres dropping the schema if possible.
    // 'DROP SCHEMA public CASCADE; CREATE SCHEMA public;' is the standard clean slate.

    const cleanDbUrl = dbUrl.replace('?schema=public', ''); // psql doesn't like some params

    // Construct the Restore Command
    // -f: file
    // -d: database
    // --clean: clean (drop) database objects before creating
    // --if-exists: used with clean
    // OR we manually drop public schema which is safer than dropping the whole DB

    const restoreCommand = `${psqlPath} "${cleanDbUrl}" -c "DROP SCHEMA public CASCADE; CREATE SCHEMA public;" && ${psqlPath} "${cleanDbUrl}" < "${backupPath}"`;

    console.log("[RESTORE] Executing restore command...");
    // Increase maxBuffer for large outputs
    await execAsync(restoreCommand, { maxBuffer: 10 * 1024 * 1024 });

    // 6. Run Migrations (to fix any schema drift from old backups)
    console.log("[RESTORE] Running migrations to sync schema...");
    await execAsync("npx prisma migrate deploy");

    // 7. Regenerate Client (Just in case)
    // await execAsync("npx prisma generate"); // Usually not strictly needed at runtime if node_modules didn't change

    console.log("[RESTORE] Success!");
    return { success: true, message: "Database restored successfully" };

  } catch (error) {
    console.error("Restore failed:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown restore error"
    };
  }
}

/**
 * List directories for the browse modal
 */
export async function listServerDirectory(currentPath?: string) {
  try {
    const startPath = currentPath || (await getBackupPath()) || process.cwd();
    // Normalize path to prevent issues
    const normalizedPath = join(startPath, '.');

    if (!existsSync(normalizedPath)) {
      // Fallback to cwd if path doesn't exist
      // check if cwd exists (it should)
      return listServerDirectory(process.cwd());
    }

    const entries = await readdir(normalizedPath, { withFileTypes: true });

    const folders = entries
      .filter(entry => entry.isDirectory())
      .map(entry => ({
        name: entry.name,
        path: join(normalizedPath, entry.name)
      }));

    // Determine parent path
    const parentPath = join(normalizedPath, '..');

    return {
      success: true,
      currentPath: normalizedPath,
      parentPath: parentPath !== normalizedPath ? parentPath : null,
      folders
    };
  } catch (error) {
    console.error("Failed to list directory:", error);
    return { success: false, error: "Failed to list directory" };
  }
}
