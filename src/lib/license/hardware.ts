import { exec } from 'child_process';
import os from 'os';

export class Hardware {
    /**
     * Gets a strict, unique hardware identifier (Motherboard UUID)
     * avoiding MAC addresses which can change via network interfaces.
     */
    static getMachineId(): Promise<string> {
        return new Promise((resolve, reject) => {
            const platform = os.platform();

            if (platform === 'win32') {
                exec('wmic csproduct get uuid', (error, stdout) => {
                    if (error) {
                        return reject(new Error('Failed to fetch hardware UUID on Windows'));
                    }
                    const lines = stdout.split('\n');
                    const uuid = lines[1]?.trim();
                    if (!uuid) return reject(new Error('Empty UUID on Windows'));
                    resolve(uuid);
                });
            } else if (platform === 'darwin') {
                exec('ioreg -d2 -c IOPlatformExpertDevice | awk -F\\" \'/IOPlatformUUID/{print $(NF-1)}\'', (error, stdout) => {
                    if (error) {
                        return reject(new Error('Failed to fetch hardware UUID on Mac'));
                    }
                    const uuid = stdout.trim();
                    if (!uuid) return reject(new Error('Empty UUID on Mac'));
                    resolve(uuid);
                });
            } else if (platform === 'linux') {
                // Common paths for machine-id on Linux
                exec('cat /var/lib/dbus/machine-id || cat /etc/machine-id', (error, stdout) => {
                    if (error) {
                        return reject(new Error('Failed to fetch hardware UUID on Linux'));
                    }
                    const uuid = stdout.trim();
                    if (!uuid) return reject(new Error('Empty UUID on Linux'));
                    resolve(uuid);
                });
            } else {
                reject(new Error(`Unsupported platform: ${platform}`));
            }
        });
    }
}
