"use server";

import { secureAction } from "@/lib/safe-action";
import { PERMISSIONS } from "@/lib/permissions/registry";
import { z } from "zod";
import { prisma } from "@/lib/prisma";

// Schedule configuration schema
const scheduleSchema = z.object({
  enabled: z.boolean(),
  frequency: z.enum(['15min', '1hour', '6hours', 'daily']),
});

// StoreSettings features key for backup schedule
const BACKUP_FEATURES_KEY = 'backupSchedule';

/**
 * Get current backup schedule configuration
 * Reads from StoreSettings.features JSON or returns defaults
 */
export const getBackupSchedule = secureAction(
  async () => {
    const settings = await prisma.storeSettings.findUnique({
      where: { id: "settings" },
      select: { features: true }
    });
    
    // Parse stored config or return defaults
    let config = {
      enabled: false,
      frequency: '6hours' as const,
      nextRun: null as string | null,
    };
    
    if (settings?.features) {
      try {
        const allFeatures = JSON.parse(settings.features);
        if (allFeatures.backupSchedule) {
          config = { ...config, ...allFeatures.backupSchedule };
        }
      } catch (e) {
        console.warn('[BackupSchedule] Failed to parse stored config, using defaults');
      }
    }
    
    return {
      success: true,
      schedule: config,
    };
  },
  { permission: PERMISSIONS.BACKUP_VIEW }
);

/**
 * Update backup schedule configuration
 * Persists to StoreSettings.features JSON
 */
export const updateBackupSchedule = secureAction(
  async (data: { enabled: boolean; frequency: '15min' | '1hour' | '6hours' | 'daily' }) => {
    const validated = scheduleSchema.parse(data);
    
    // Calculate next run time
    const now = new Date();
    const nextRun = calculateNextRun(now, validated.frequency);
    
    const backupConfig = {
      enabled: validated.enabled,
      frequency: validated.frequency,
      nextRun: nextRun.toISOString(),
      updatedAt: now.toISOString(),
    };
    
    // Fetch current features, update backup schedule, persist back
    const settings = await prisma.storeSettings.findUnique({
      where: { id: "settings" },
      select: { features: true }
    });
    
    let allFeatures: Record<string, unknown> = {};
    if (settings?.features) {
      try {
        allFeatures = JSON.parse(settings.features);
      } catch (e) {
        console.warn('[BackupSchedule] Failed to parse existing features');
      }
    }
    
    allFeatures[BACKUP_FEATURES_KEY] = backupConfig;
    
    await prisma.storeSettings.update({
      where: { id: "settings" },
      data: { features: JSON.stringify(allFeatures) }
    });
    
    console.log('📅 Backup schedule persisted:', backupConfig);
    
    return {
      success: true,
      schedule: backupConfig,
      message: `Backup schedule ${validated.enabled ? 'enabled' : 'disabled'}`,
    };
  },
  { permission: PERMISSIONS.BACKUP_MANAGE_DRIVE }
);

/**
 * Calculate next backup run time based on frequency
 */
function calculateNextRun(from: Date, frequency: string): Date {
  const next = new Date(from);
  
  switch (frequency) {
    case '15min':
      next.setMinutes(next.getMinutes() + 15);
      break;
    case '1hour':
      next.setHours(next.getHours() + 1);
      break;
    case '6hours':
      next.setHours(next.getHours() + 6);
      break;
    case 'daily':
      next.setDate(next.getDate() + 1);
      next.setHours(2, 0, 0, 0); // 2 AM next day
      break;
  }
  
  return next;
}

/**
 * Get backup scheduler status
 * Reads from StoreSettings.features for backup info
 */
export const getSchedulerStatus = secureAction(
  async () => {
    // Fetch next scheduled run from StoreSettings.features
    const settings = await prisma.storeSettings.findUnique({
      where: { id: "settings" },
      select: { features: true }
    });
    
    let nextBackup: string | null = null;
    let workerRunning = false;
    let lastBackup: string | null = null;
    
    if (settings?.features) {
      try {
        const allFeatures = JSON.parse(settings.features);
        const backupConfig = allFeatures.backupSchedule as { nextRun?: string; enabled?: boolean; lastBackup?: string } | undefined;
        if (backupConfig) {
          nextBackup = backupConfig.nextRun || null;
          workerRunning = backupConfig.enabled || false;
          lastBackup = backupConfig.lastBackup || null;
        }
      } catch (e) {
        console.warn('[BackupSchedule] Failed to parse schedule config');
      }
    }
    
    return {
      success: true,
      status: {
        workerRunning,
        lastBackup,
        nextBackup,
        failedAttempts: 0,
      },
    };
  },
  { permission: PERMISSIONS.BACKUP_VIEW }
);

/**
 * Log a successful or failed backup operation
 * Updates StoreSettings.features with last backup info
 */
export async function logBackupResult(data: {
  success: boolean;
  errorMessage?: string;
  filesBackedUp?: number;
}): Promise<void> {
  const now = new Date();
  
  try {
    // Fetch current features
    const settings = await prisma.storeSettings.findUnique({
      where: { id: "settings" },
      select: { features: true }
    });
    
    let allFeatures: Record<string, unknown> = {};
    if (settings?.features) {
      try {
        allFeatures = JSON.parse(settings.features);
      } catch (e) {
        // Ignore
      }
    }
    
    // Update backup schedule with last backup info
    const backupConfig = (allFeatures[BACKUP_FEATURES_KEY] as Record<string, unknown>) || {};
    allFeatures[BACKUP_FEATURES_KEY] = {
      ...backupConfig,
      lastBackup: now.toISOString(),
      lastBackupSuccess: data.success,
      lastBackupError: data.errorMessage,
      lastFilesBackedUp: data.filesBackedUp,
    };
    
    await prisma.storeSettings.update({
      where: { id: "settings" },
      data: { features: JSON.stringify(allFeatures) }
    });
    
    console.log(`📦 Backup logged: ${data.success ? 'SUCCESS' : 'FAILED'} - ${data.filesBackedUp || 0} files`);
  } catch (e) {
    console.warn('[BackupSchedule] Could not log backup result:', e);
  }
}
