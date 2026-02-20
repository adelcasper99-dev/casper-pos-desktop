"use server";

import { getBackups, removeBackup } from './backup';

interface RetentionStats {
    scanned: number;
    kept: number;
    deleted: number;
    spaceFreed: number;
    deletedFiles: string[];
}

export async function applyRetentionPolicy() {
    const stats: RetentionStats = {
        scanned: 0,
        kept: 0,
        deleted: 0,
        spaceFreed: 0,
        deletedFiles: []
    };

    try {
        // Get all backups from filesystem
        const backupsResult = await getBackups();

        if (!backupsResult.success || !backupsResult.backups) {
            throw new Error("Failed to load backups");
        }

        const allBackups = backupsResult.backups;
        stats.scanned = allBackups.length;

        const now = new Date();

        for (const backup of allBackups) {
            const backupDate = new Date(backup.createdAt);
            const ageInDays = Math.floor((now.getTime() - backupDate.getTime()) / (1000 * 60 * 60 * 24));
            const ageInWeeks = Math.floor(ageInDays / 7);
            const ageInMonths = Math.floor(ageInDays / 30);
            const ageInYears = Math.floor(ageInDays / 365);

            let shouldKeep = false;

            // RULE 1: Keep all backups from last 30 days
            if (ageInDays <= 30) {
                shouldKeep = true;
            }
            // RULE 2: Keep Sunday backups for last 30 weeks
            else if (ageInWeeks <= 30 && backupDate.getDay() === 0) {
                shouldKeep = true;
            }
            // RULE 3: Keep 1st-of-month backups for last 12 months
            else if (ageInMonths <= 12 && backupDate.getDate() === 1) {
                shouldKeep = true;
            }
            // RULE 4: Keep January 1st backups for 7 years
            else if (ageInYears <= 7 && backupDate.getMonth() === 0 && backupDate.getDate() === 1) {
                shouldKeep = true;
            }

            if (shouldKeep) {
                stats.kept++;
            } else {
                // Delete this backup
                stats.deleted++;
                stats.spaceFreed += backup.fileSize;
                stats.deletedFiles.push(backup.filename);

                // Delete using the removeBackup function
                await removeBackup({ backupId: backup.id });
            }
        }

        return {
            success: true,
            stats: {
                ...stats,
                spaceFreedinMB: (stats.spaceFreed / 1024 / 1024).toFixed(2)
            },
            message: `Retention policy applied: Kept ${stats.kept}, Deleted ${stats.deleted} backups. Freed ${(stats.spaceFreed / 1024 / 1024).toFixed(2)} MB`
        };

    } catch (error: any) {
        console.error('Retention policy failed:', error);
        return {
            success: false,
            error: error.message || "Failed to apply retention policy",
            stats
        };
    }
}

// Preview what would be deleted without actually deleting
export async function previewRetentionPolicy() {
    try {
        const backupsResult = await getBackups();

        if (!backupsResult.success || !backupsResult.backups) {
            throw new Error("Failed to load backups");
        }

        const allBackups = backupsResult.backups;
        const now = new Date();

        const preview = {
            toKeep: [] as any[],
            toDelete: [] as any[],
            stats: {
                total: allBackups.length,
                willKeep: 0,
                willDelete: 0,
                spaceToFree: 0
            }
        };

        for (const backup of allBackups) {
            const backupDate = new Date(backup.createdAt);
            const ageInDays = Math.floor((now.getTime() - backupDate.getTime()) / (1000 * 60 * 60 * 24));
            const ageInWeeks = Math.floor(ageInDays / 7);
            const ageInMonths = Math.floor(ageInDays / 30);
            const ageInYears = Math.floor(ageInDays / 365);

            let shouldKeep = false;
            let reason = '';

            if (ageInDays <= 30) {
                shouldKeep = true;
                reason = `Daily (${ageInDays}d old)`;
            } else if (ageInWeeks <= 30 && backupDate.getDay() === 0) {
                shouldKeep = true;
                reason = `Weekly (${ageInWeeks}w old)`;
            } else if (ageInMonths <= 12 && backupDate.getDate() === 1) {
                shouldKeep = true;
                reason = `Monthly (${ageInMonths}m old)`;
            } else if (ageInYears <= 7 && backupDate.getMonth() === 0 && backupDate.getDate() === 1) {
                shouldKeep = true;
                reason = `Yearly (${ageInYears}y old)`;
            } else {
                reason = `Expired (${ageInDays}d old)`;
            }

            const item = {
                filename: backup.filename,
                createdAt: backup.createdAt.toISOString(), // Convert Date to string
                size: backup.fileSize,
                age: `${ageInDays} days`,
                reason
            };

            if (shouldKeep) {
                preview.toKeep.push(item);
                preview.stats.willKeep++;
            } else {
                preview.toDelete.push(item);
                preview.stats.willDelete++;
                preview.stats.spaceToFree += backup.fileSize;
            }
        }

        return {
            success: true,
            preview,
            message: `Preview: ${preview.stats.willDelete} backups will be deleted, ${preview.stats.willKeep} will be kept. ${(preview.stats.spaceToFree / 1024 / 1024).toFixed(2)} MB will be freed.`
        };

    } catch (error: any) {
        return {
            success: false,
            error: error.message || "Failed to preview retention policy"
        };
    }
}
