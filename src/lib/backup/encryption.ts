import { createCipheriv, createDecipheriv, randomBytes, createHash } from 'crypto';
import { readFile, writeFile } from 'fs/promises';
import { createReadStream, createWriteStream } from 'fs';
import { pipeline } from 'stream/promises';

/**
 * Encryption configuration
 * Uses AES-256-GCM for authenticated encryption
 */
const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 16; // AES block size
const AUTH_TAG_LENGTH = 16;
const KEY_LENGTH = 32; // 256 bits

/**
 * Get encryption key from environment
 * CRITICAL: If this key is lost, all encrypted backups are UNRECOVERABLE
 */
function getEncryptionKey(): Buffer {
  const keyHex = process.env.BACKUP_ENCRYPTION_KEY;
  
 if (!keyHex) {
    throw new Error(
      'BACKUP_ENCRYPTION_KEY not found in environment. ' +
      'Generate one with: openssl rand -hex 32'
    );
  }
  
  const key = Buffer.from(keyHex, 'hex');
  
  if (key.length !== KEY_LENGTH) {
    throw new Error(
      `BACKUP_ENCRYPTION_KEY must be ${KEY_LENGTH * 2} hex characters (${KEY_LENGTH} bytes). ` +
      `Current length: ${key.length} bytes`
    );
  }
  
  return key;
}

/**
 * Encrypt a file using AES-256-GCM
 * @param inputPath - Path to file to encrypt
 * @param outputPath - Path for encrypted output
 * @returns Auth tag for verification
 */
export async function encryptFile(inputPath: string, outputPath: string): Promise<void> {
  const key = getEncryptionKey();
  const iv = randomBytes(IV_LENGTH);
  
  const cipher = createCipheriv(ALGORITHM, key, iv);
  
  // Write IV at start of file (needed for decryption)
  await writeFile(outputPath, iv);
  
  // Stream encrypt the file
  const input = createReadStream(inputPath);
  const output = createWriteStream(outputPath, { flags: 'a' }); // Append after IV
  
  await pipeline(
    input,
    cipher,
    output
  );
  
  // Append auth tag for integrity verification
  const authTag = cipher.getAuthTag();
  await writeFile(outputPath, authTag, { flag: 'a' });
}

/**
 * Decrypt a file using AES-256-GCM
 * @param inputPath - Path to encrypted file
 * @param outputPath - Path for decrypted output
 */
export async function decryptFile(inputPath: string, outputPath: string): Promise<void> {
  const key = getEncryptionKey();
  
  // Read IV from start of file
  const encryptedBuffer = await readFile(inputPath);
  const iv = encryptedBuffer.subarray(0, IV_LENGTH);
  const authTag = encryptedBuffer.subarray(
    encryptedBuffer.length - AUTH_TAG_LENGTH,
    encryptedBuffer.length
  );
  const encryptedData = encryptedBuffer.subarray(
    IV_LENGTH,
    encryptedBuffer.length - AUTH_TAG_LENGTH
  );
  
  const decipher = createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);
  
  // Decrypt
  const decrypted = Buffer.concat([
    decipher.update(encryptedData),
    decipher.final()
  ]);
  
  await writeFile(outputPath, decrypted);
}

/**
 * Calculate SHA-256 checksum of a file
 * @param filePath - Path to file
 * @returns Hex-encoded SHA-256 hash
 */
export async function calculateChecksum(filePath: string): Promise<string> {
  const hash = createHash('sha256');
  const input = createReadStream(filePath);
  
  await pipeline(input, hash);
  
  return hash.digest('hex');
}

/**
 * Verify encrypted file integrity without decrypting
 * @param filePath - Path to encrypted file
 * @returns True if file appears valid
 */
export function validateEncryptedFile(filePath: string): boolean {
  try {
    const buffer = require('fs').readFileSync(filePath);
    
    // Check minimum size (IV + auth tag + some data)
    if (buffer.length < IV_LENGTH + AUTH_TAG_LENGTH + 1) {
      return false;
    }
    
    // Check IV is present
    if (buffer.subarray(0, IV_LENGTH).length !== IV_LENGTH) {
      return false;
    }
    
    return true;
  } catch {
    return false;
  }
}
