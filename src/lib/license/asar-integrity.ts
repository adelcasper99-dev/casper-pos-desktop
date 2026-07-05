import fs from 'fs';
import pathModule from 'path';
import crypto from 'crypto';

export class AsarIntegrity {
    /**
     * Checks if the app.asar file has been tampered with.
     * Compares its SHA-256 hash against a build-time injected hash.
     * Returns true if valid or if not running from an asar package.
     */
    static async checkIntegrity(): Promise<boolean> {
        // Only run integrity check in production (Electron packaged app)
        const isPackaged = (process as any).defaultApp !== true && __dirname.indexOf('app.asar') !== -1;
        if (!isPackaged) {
            return true;
        }

        const expectedHash = process.env.VITE_ASAR_HASH;
        if (!expectedHash) {
            console.error('[ASAR_INTEGRITY] Expected ASAR hash not found in environment');
            return false;
        }

        // Assuming this code runs inside the ASAR, process.resourcesPath points to the resources folder
        // The app.asar file is located at process.resourcesPath + '/app.asar'
        // In some setups, we might just look up the tree
        const resourcesPath = (process as any).resourcesPath;
        if (!resourcesPath) {
            console.error('[ASAR_INTEGRITY] Resources path not found');
            return false;
        }

        const asarPath = pathModule.join(resourcesPath, 'app.asar');
        
        try {
            if (!fs.existsSync(asarPath)) {
                console.error(`[ASAR_INTEGRITY] app.asar not found at ${asarPath}`);
                return false;
            }

            const hash = crypto.createHash('sha256');
            const stream = fs.createReadStream(asarPath);

            return new Promise((resolve) => {
                stream.on('data', (data) => {
                    hash.update(data);
                });

                stream.on('end', () => {
                    const actualHash = hash.digest('hex');
                    if (actualHash !== expectedHash) {
                        console.error(`[ASAR_INTEGRITY] Hash mismatch! Expected: ${expectedHash}, Actual: ${actualHash}`);
                        resolve(false);
                    } else {
                        resolve(true);
                    }
                });

                stream.on('error', (err) => {
                    console.error('[ASAR_INTEGRITY] Error reading ASAR file:', err);
                    resolve(false);
                });
            });
        } catch (error) {
            console.error('[ASAR_INTEGRITY] Integrity check failed:', error);
            return false;
        }
    }
}
