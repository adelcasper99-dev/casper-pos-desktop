"use server";

import { existsSync } from "fs";

/**
 * Check if Google Drive folder is accessible
 */
export async function testGoogleDrive() {
  const possiblePaths = [
    'G:\\My Drive',
    'H:\\My Drive',
    'C:\\Users\\' + process.env.USERNAME + '\\Google Drive'
  ];

  let foundPath = null;
  // Check common paths
  for (const path of possiblePaths) {
    if (existsSync(path)) {
      foundPath = path;
      break;
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
      : "Google Drive Desktop not found"
  };
}

export async function uploadToDrive() {
  return { success: true, message: "Sync happens automatically via Google Drive Desktop" };
}
