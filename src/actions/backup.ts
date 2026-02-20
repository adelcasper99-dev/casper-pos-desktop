"use server";

import { readdir, stat, readFile, unlink, copyFile } from "fs/promises";
import { join } from "path";
import { existsSync } from "fs";
import { prisma } from "@/lib/prisma";

const DEFAULT_BACKUP_DIR = join(process.cwd(), "backups");
const DB_FILE = join(process.cwd(), "local.db");

async function getBackupPath() {
  try {
    const config = await prisma.systemConfig.findFirst();
    // @ts-ignore
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
    const sqlFiles = files.filter(f => f.endsWith(".sql") || f.endsWith(".db") || f.endsWith(".sqlite"));

    const backups = await Promise.all(
      sqlFiles.map(async (filename) => {
        const filePath = join(backupDir, filename);
        const stats = await stat(filePath);

        return {
          id: filename,
          filename,
          fileSize: stats.size,
          createdAt: stats.birthtime,
          uploadStatus: 'UNKNOWN', // Drive sync status tracking removed for FS mode
        };
      })
    );

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
 * Create a manual backup by copying local.db
 */
export async function createManualBackup() {
  try {
    const backupDir = await getBackupPath();
    const fs = require('fs');
    if (!fs.existsSync(backupDir)) {
      fs.mkdirSync(backupDir, { recursive: true });
    }

    const filename = `backup_${new Date().toISOString().replace(/[:.]/g, '-')}.db`;
    const destPath = join(backupDir, filename);

    console.log(`Copying DB from ${DB_FILE} to ${destPath}`);
    await copyFile(DB_FILE, destPath);

    const stats = await stat(destPath);
    const fileBuffer = await readFile(destPath);

    return {
      success: true,
      backup: {
        id: filename,
        filename,
        fileSize: stats.size,
        createdAt: stats.birthtime,
        uploadStatus: 'UNKNOWN'
      },
      downloadData: fileBuffer.toString('base64'),
    };

  } catch (error) {
    const { getTranslations } = await import('@/lib/i18n-mock');
    const t = await getTranslations('SystemMessages.Errors');
    console.error("Backup creation failed:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : t('generic')
    };
  }
}

export async function removeBackup({ backupId }: { backupId: string }) {
  try {
    const { getTranslations } = await import('@/lib/i18n-mock');
    const t = await getTranslations('SystemMessages.Errors');

    const backupDir = await getBackupPath();
    const filename = backupId;
    if (filename.includes("..")) throw new Error(t('invalidFilename'));

    const filePath = join(backupDir, filename);
    await unlink(filePath);

    return { success: true };
  } catch (error) {
    console.error("Failed to delete backup:", error);
    const { getTranslations } = await import('@/lib/i18n-mock');
    const t = await getTranslations('SystemMessages.Errors');
    return { success: false, error: t('deleteFailed') };
  }
}

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
      syncedCount: 0,
      latestBackup: backups[0] || null,
      backupDir
    }
  };
}

export async function checkBackupIntegrity() {
  return { success: true, isValid: true, message: "Use Restore Test to verify." };
}

export async function downloadBackup({ backupId }: { backupId: string }) {
  const { getTranslations } = await import('@/lib/i18n-mock');
  const t = await getTranslations('SystemMessages.Errors');

  if (backupId.includes("..")) throw new Error(t('invalidFilename'));

  const backupDir = await getBackupPath();
  const filePath = join(backupDir, backupId);
  if (!existsSync(filePath)) throw new Error(t('fileNotFound'));

  const fileBuffer = await readFile(filePath);
  return {
    success: true,
    filename: backupId,
    downloadData: fileBuffer.toString('base64')
  };
}

export async function restoreBackup({ backupId }: { backupId: string }) {
  try {
    const { getTranslations } = await import('@/lib/i18n-mock');
    const t = await getTranslations('SystemMessages.Errors');

    if (backupId.includes("..")) throw new Error(t('invalidFilename'));

    const backupDir = await getBackupPath();
    const backupPath = join(backupDir, backupId);
    if (!existsSync(backupPath)) throw new Error(`${t('fileNotFound')}: ${backupId}`);

    console.log(`[RESTORE] Restoring from ${backupPath}...`);

    const safetyBackup = `${DB_FILE}.bak_${Date.now()}`;
    await copyFile(DB_FILE, safetyBackup);
    console.log(`[RESTORE] Safety backup created: ${safetyBackup}`);

    try {
      await copyFile(backupPath, DB_FILE);
    } catch (copyError) {
      throw new Error(t('dbLocked'));
    }

    console.log("[RESTORE] Success!");
    const tSuccess = await getTranslations('SystemMessages.Success');
    return { success: true, message: tSuccess('restoreComplete') };

  } catch (error) {
    console.error("Restore failed:", error);
    const { getTranslations } = await import('@/lib/i18n-mock');
    const t = await getTranslations('SystemMessages.Errors');
    return {
      success: false,
      error: error instanceof Error ? error.message : t('restoreFailed')
    };
  }
}

export async function listServerDirectory(currentPath?: string) {
  try {
    const startPath = currentPath || (await getBackupPath()) || process.cwd();
    const normalizedPath = join(startPath, '.');

    if (!existsSync(normalizedPath)) {
      return listServerDirectory(process.cwd());
    }

    const entries = await readdir(normalizedPath, { withFileTypes: true });

    const folders = entries
      .filter(entry => entry.isDirectory())
      .map(entry => ({
        name: entry.name,
        path: join(normalizedPath, entry.name)
      }));

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
