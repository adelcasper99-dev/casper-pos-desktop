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

/**
 * Get current backup schedule configuration
 */
export const getBackupSchedule = secureAction(
  async () => {
    // Try to get from database or system
    // For now, return default
    return {
      success: true,
      schedule: {
        enabled: false,
        frequency: '6hours' as const,
        nextRun: null,
      },
    };
  },
  { permission: PERMISSIONS.BACKUP_VIEW }
);

/**
 * Update backup schedule configuration
 */
export const updateBackupSchedule = secureAction(
  async (data: { enabled: boolean; frequency: '15min' | '1hour' | '6hours' | 'daily' }) => {
    const validated = scheduleSchema.parse(data);
    
    // TODO: Save to database
    // TODO: Update cron job configuration
    
    console.log('📅 Backup schedule updated:', validated);
    
    // Calculate next run time
    const now = new Date();
    const nextRun = calculateNextRun(now, validated.frequency);
    
    return {
      success: true,
      schedule: {
        ...validated,
        nextRun,
      },
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
 */
export const getSchedulerStatus = secureAction(
  async () => {
    // TODO: Check if cron worker is running
    // TODO: Get last successful backup time
    
    return {
      success: true,
      status: {
        workerRunning: false, // TODO: Check actual status
        lastBackup: null,
        nextBackup: null,
        failedAttempts: 0,
      },
    };
  },
  { permission: PERMISSIONS.BACKUP_VIEW }
);
