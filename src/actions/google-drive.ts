"use server";

import { existsSync } from "fs";
import { prisma } from "@/lib/prisma";

/**
 * Check if Google Drive folder is accessible
 */
export async function testGoogleDrive(testPath?: string) {
  let foundPath = null;

  if (testPath) {
    if (existsSync(testPath)) {
      foundPath = testPath;
    }
  } else {
    // Check DB for custom path
    const settings = await prisma.storeSettings.findFirst();
    if (settings?.googleDriveBackupPath && existsSync(settings.googleDriveBackupPath)) {
      foundPath = settings.googleDriveBackupPath;
    } else {
      // Fallback
      const possiblePaths = [
        'G:\\My Drive',
        'H:\\My Drive',
        'C:\\Users\\' + process.env.USERNAME + '\\Google Drive'
      ];
      
      for (const path of possiblePaths) {
        if (existsSync(path)) {
          foundPath = path;
          break;
        }
      }
    }
  }

  // Also check if the specific backup folder exists
  const backupFolderSync = foundPath ? existsSync(`${foundPath}\\POS Backups`) : false;

  return {
    success: !!foundPath,
    path: foundPath,
    backupFolderExists: backupFolderSync,
    message: foundPath
      ? `Connected to ${foundPath}`
      : "Google Drive Desktop not found or path is invalid"
  };
}

export async function uploadToDrive() {
  return { success: true, message: "Sync happens automatically via Google Drive Desktop" };
}
