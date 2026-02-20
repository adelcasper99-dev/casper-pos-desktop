import { copyFile, unlink, stat, mkdir } from 'fs/promises';
import path from 'path';
import { encryptFile, decryptFile, calculateChecksum } from './encryption';
import { prisma } from '@/lib/prisma';

const BACKUPS_DIR = path.join(process.cwd(), 'backups');
const DB_PATH = path.join(process.cwd(), 'prisma/local.db'); // Adjust if db location differs

/** Ensure backups directory exists */
async function ensureBackupsDir() {
  try {
    await mkdir(BACKUPS_DIR, { recursive: true });
  } catch (error) {
    // Directory already exists
  }
}

/**
 * Generate backup filename with timestamp
 * Format: casper-pos-backup-YYYY-MM-DD-HHmmss.db
 */
function generateBackupFilename(): string {
  const now = new Date();
  const date = now.toISOString().split('T')[0];
  const time = now.toTimeString().split(' ')[0].replace(/:/g, '');
  return `casper-pos-backup-${date}-${time}.db`;
}

/**
 * Create full database backup
 * Steps:
 * 1. Copy local.db to backup folder
 * 2. Encrypt
 * 3. Calculate checksum
 * 4. Log to database
 */
export async function createBackup(userId: string) {
  await ensureBackupsDir();

  const filename = generateBackupFilename();
  const backupPath = path.join(BACKUPS_DIR, filename);
  const encPath = backupPath + '.enc';

  try {
    const startTime = Date.now();
    console.log('📦 Starting backup creation...');

    // Step 1: Copy DB
    console.log('🔄 Copying database file...');
    await copyFile(DB_PATH, backupPath);

    // Step 2: Encrypt
    console.log('🔄 Encrypting...');
    await encryptFile(backupPath, encPath);
    const encStats = await stat(encPath);

    // Step 3: Checksum
    console.log('🔄 Calculating checksum...');
    const checksum = await calculateChecksum(encPath);

    // Step 4: Log to database
    // Note: stored in the DB we just backed up, but that's fine for history.
    // Ideally we log BEFORE backup? No, we need file details.

    const backupLog = await prisma.backupLog.create({
      data: {
        filename: path.basename(encPath),
        filePath: encPath,
        fileSize: encStats.size, // Float in schema
        checksum,
        compressed: false, // SQLite file is not compressed by us (unless we add gzip)
        encrypted: true,
        uploadStatus: 'PENDING',
        createdBy: userId,
      },
    });

    console.log('✅ Backup created successfully');
    console.log(`⏱️  Total time: ${((Date.now() - startTime) / 1000).toFixed(1)}s`);
    console.log(`📁 Location: ${encPath}`);

    // Cleanup intermediate file (unencrypted)
    await unlink(backupPath);

    return backupLog;

  } catch (error) {
    console.error('❌ Backup failed:', error);

    // Cleanup on error
    try { await unlink(backupPath); } catch { }
    try { await unlink(encPath); } catch { }

    throw error;
  }
}

/**
 * Validate backup file integrity
 */
export async function validateBackup(backupId: string): Promise<boolean> {
  const backup = await prisma.backupLog.findUnique({
    where: { id: backupId },
  });

  if (!backup) {
    throw new Error('Backup not found');
  }

  try {
    const currentChecksum = await calculateChecksum(backup.filePath);
    if (currentChecksum !== backup.checksum) {
      console.error(`❌ Checksum mismatch for ${backup.filename}`);
      return false;
    }
    return true;
  } catch (error) {
    console.error(`❌ Validation failed for ${backup.filename}:`, error);
    return false;
  }
}

/**
 * List all backups
 */
export async function listBackups() {
  return await prisma.backupLog.findMany({
    orderBy: { createdAt: 'desc' },
  });
}

/**
 * Delete backup file and database record
 */
export async function deleteBackup(backupId: string) {
  const backup = await prisma.backupLog.findUnique({
    where: { id: backupId },
  });

  if (!backup) {
    throw new Error('Backup not found');
  }

  try {
    await unlink(backup.filePath);
  } catch (error) {
    console.warn(`Could not delete file ${backup.filePath}:`, error);
  }

  await prisma.backupLog.delete({
    where: { id: backupId },
  });
}
