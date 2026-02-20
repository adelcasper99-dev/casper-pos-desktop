'use server';

import fs from 'fs';
import path from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

// The certificate content (same as in qz-certs.ts)
const QZ_CERTIFICATE = `-----BEGIN CERTIFICATE-----
MIIECzCCAvOgAwIBAgIGAZxTe/O5MA0GCSqGSIb3DQEBCwUAMIGiMQswCQYDVQQG
EwJVUzELMAkGA1UECAwCTlkxEjAQBgNVBAcMCUNhbmFzdG90YTEbMBkGA1UECgwS
UVogSW5kdXN0cmllcywgTExDMRswGQYDVQQLDBJRWiBJbmR1c3RyaWVzLCBMTEMx
HDAaBgkqhkiG9w0BCQEWDXN1cHBvcnRAcXouaW8xGjAYBgNVBAMMEVFaIFRyYXkg
RGVtbyBDZXJ0MB4XDTI2MDIxMTIwMTIzOFoXDTQ2MDIxMTIwMTIzOFowgaIxCzAJ
BgNVBAYTAlVTMQswCQYDVQQIDAJOWTESMBAGA1UEBwwJQ2FuYXN0b3RhMRswGQYD
VQQKDBJRWiBJbmR1c3RyaWVzLCBMTEMxGzAZBgNVBAsMElFaIEluZHVzdHJpZXMs
IExMQzEcMBoGCSqGSIb3DQEJARYNc3VwcG9ydEBxei5pbzEaMBgGA1UEAwwRUVog
VHJheSBEZW1vIENlcnQwggEiMA0GCSqGSIb3DQEBAQUAA4IBDwAwggEKAoIBAQCc
jZdnnhntXEd+xyYeyLLmzwXEANpyx5thF1i2wyMwrsEN79+PvFc7Gsxw1jrwpJwK
XamjFbJp6jkReQVz5U3aZMJymsJfThWDpWNOGgJtZ3kHzOuuhoMDwB+AIbtFpVUl
9gl5tUoZLAbmi2uJUAXkyicZ3MEeDMPwxndaVVAqhJXwL2fNAF2L3DnbPblYuboK
Lc8yb8ECsJrvK+ZCKJ9sVPCxXUgT5BXsRrBDtJS9tW+YiLbYcelxVl5N647hsUxz
g3AsVixCaIY+rU1YgbW+gqLdHT96z4h/3RRqxTzcshpyiTiIfFoLmczO/PJtebjA
n8K+SUu9I7zXUJsDDJMvAgMBAAGjRTBDMBIGA1UdEwEB/wQIMAYBAf8CAQEwDgYD
VR0PAQH/BAQDAgEGMB0GA1UdDgQWBBRz3FbXRACtR3e+AabgXuoTY5YT+jANBgkq
hkiG9w0BAQsFAAOCAQEAV8UUyedRt85vhJ4hgSARIOIcPqxs6pnUKMsaLqonqC4w
bMOHOkccGq+DTh9yszJgegait/WwAxVKtgCEkWmAuUuLINHOAKLM/iXcEAuOaq6u
SPfW/Be6C74COfd8wx0uxc4WhX4AQKhErwH6XUgQqitgIU7yOwg46wRvtS17Arx0
Tl8lZ2JLgQSAq/yu0KNBwUVnVm+SlIxmzEZDB1uzhH7RVBHM1kgcmI5P0PdlH2iO
MFzejMcEB9Ji8gUoCOA4tJbRsvShE9eaSwWlA//7aepbjlpQCLy6osw76bif1cgd
+iHW1pogSVv+eonIW11un1y7hxbiVdTnLjmTHJ6iSA==
-----END CERTIFICATE-----`;

const QZ_TRAY_PATH = 'C:\\Program Files\\QZ Tray';
const OVERRIDE_CRT_PATH = path.join(QZ_TRAY_PATH, 'override.crt');

/**
 * Check if QZ Tray is installed
 */
export async function checkQZTrayInstalled(): Promise<{ installed: boolean; path: string }> {
    try {
        const exists = fs.existsSync(QZ_TRAY_PATH);
        return { installed: exists, path: QZ_TRAY_PATH };
    } catch {
        return { installed: false, path: QZ_TRAY_PATH };
    }
}

/**
 * Check if the correct certificate is already installed
 */
export async function checkQZCertificateStatus(): Promise<{
    installed: boolean;
    matched: boolean;
    qzInstalled: boolean;
}> {
    try {
        const qzInstalled = fs.existsSync(QZ_TRAY_PATH);
        if (!qzInstalled) {
            return { installed: false, matched: false, qzInstalled: false };
        }

        const certExists = fs.existsSync(OVERRIDE_CRT_PATH);
        if (!certExists) {
            return { installed: false, matched: false, qzInstalled: true };
        }

        const currentCert = fs.readFileSync(OVERRIDE_CRT_PATH, 'utf-8').trim();
        const expectedCert = QZ_CERTIFICATE.trim();
        const matched = currentCert === expectedCert;

        return { installed: true, matched, qzInstalled: true };
    } catch {
        return { installed: false, matched: false, qzInstalled: false };
    }
}

/**
 * Install the QZ Tray certificate to override.crt
 * Returns success/failure with reason
 */
export async function installQZCertificate(): Promise<{
    success: boolean;
    message: string;
    needsManual: boolean;
}> {
    try {
        // Check QZ Tray is installed
        const qzExists = fs.existsSync(QZ_TRAY_PATH);
        if (!qzExists) {
            return {
                success: false,
                message: 'QZ Tray is not installed. Please install QZ Tray first.',
                needsManual: false,
            };
        }

        // Try to write the certificate
        fs.writeFileSync(OVERRIDE_CRT_PATH, QZ_CERTIFICATE, 'utf-8');

        // Verify it was written correctly
        const written = fs.readFileSync(OVERRIDE_CRT_PATH, 'utf-8').trim();
        if (written !== QZ_CERTIFICATE.trim()) {
            return {
                success: false,
                message: 'Certificate was written but verification failed.',
                needsManual: true,
            };
        }

        // Try to restart QZ Tray
        try {
            await execAsync('taskkill /F /IM "qz-tray.exe" 2>nul');
            // Wait a moment then restart
            await new Promise(resolve => setTimeout(resolve, 1000));
            await execAsync(`start "" "${path.join(QZ_TRAY_PATH, 'qz-tray.exe')}"`);
        } catch {
            // QZ Tray restart failed — user may need to restart manually
            return {
                success: true,
                message: 'Certificate installed! Please restart QZ Tray manually (right-click tray icon → Exit → relaunch).',
                needsManual: false,
            };
        }

        return {
            success: true,
            message: 'Certificate installed and QZ Tray restarted successfully!',
            needsManual: false,
        };
    } catch (error: any) {
        // Permission denied — fallback to manual install
        if (error.code === 'EPERM' || error.code === 'EACCES') {
            return {
                success: false,
                message: 'Permission denied. Please download and run the setup script as Administrator.',
                needsManual: true,
            };
        }

        return {
            success: false,
            message: `Installation failed: ${error.message}`,
            needsManual: true,
        };
    }
}
