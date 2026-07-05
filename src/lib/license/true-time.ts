import { prisma } from '@/lib/prisma';
import { logger } from '@/lib/logger';

export class TrueTime {
    private static memoryServerNow: number | null = null;
    private static memoryLocalTicks: number | null = null;

    /**
     * Initializes the TrueTime module by attempting to sync with an NTP/WorldTime API.
     * If offline, it falls back to the database's last known server time.
     */
    static async initialize(): Promise<void> {
        try {
            // Attempt to fetch real time from a public NTP-like JSON API
            const res = await fetch('https://worldtimeapi.org/api/timezone/Etc/UTC', { signal: AbortSignal.timeout(3000) });
            if (res.ok) {
                const data = await res.json();
                const realTimeMs = new Date(data.utc_datetime).getTime();
                
                await this.updateServerTime(realTimeMs);
                logger.info(`[TrueTime] Initialized from WorldTimeAPI: ${new Date(realTimeMs).toISOString()}`);
                return;
            }
        } catch (error) {
            logger.warn('[TrueTime] Offline or WorldTimeAPI failed, falling back to DB time.');
        }

        // Fallback to database (Prisma)
        const settings = await prisma.storeSettings.findUnique({
            where: { id: 'settings' }
        });
        if (settings && settings.lastServerNow) {
            this.memoryServerNow = settings.lastServerNow;
            this.memoryLocalTicks = performance.now();
            
            // Re-sync local ticks in DB for this session
            await prisma.storeSettings.update({
                where: { id: 'settings' },
                data: {
                    localUptimeTicks: this.memoryLocalTicks
                }
            });
            logger.info(`[TrueTime] Initialized from local DB: ${this.memoryServerNow ? new Date(this.memoryServerNow).toISOString() : 'Unknown'}`);
        } else {
            logger.warn('[TrueTime] No server time found in DB. True Time cannot be guaranteed.');
        }
    }

    /**
     * Updates the secure baseline time (e.g. called when syncing with Cloud Backend)
     */
    static async updateServerTime(serverNowMs: number): Promise<void> {
        const currentTicks = performance.now();
        this.memoryServerNow = serverNowMs;
        this.memoryLocalTicks = currentTicks;

        let settings = await prisma.storeSettings.findUnique({
            where: { id: 'settings' }
        });
        if (!settings) {
            await prisma.storeSettings.create({
                data: {
                    id: 'settings',
                    name: 'Casper Store',
                    blindCloseEnabled: true,
                    taxRate: 0,
                    currency: 'USD',
                    receiptFooter: ''
                }
            });
        }

        await prisma.storeSettings.update({
            where: { id: 'settings' },
            data: {
                lastServerNow: serverNowMs,
                localUptimeTicks: currentTicks
            }
        });
    }

    /**
     * Calculates the True Time ignoring the OS clock.
     * Calculate True Time = last_server_now + (performance.now() - local_uptime_ticks_at_sync).
     */
    static async getNow(): Promise<number> {
        if (this.memoryServerNow !== null && this.memoryLocalTicks !== null) {
            const elapsed = Math.max(0, performance.now() - this.memoryLocalTicks);
            return this.memoryServerNow + elapsed;
        }

        // Fallback to DB if memory was cleared
        const settings = await prisma.storeSettings.findUnique({
            where: { id: 'settings' }
        });
        if (settings && settings.lastServerNow && settings.localUptimeTicks !== undefined && settings.localUptimeTicks !== null) {
            const elapsed = Math.max(0, performance.now() - settings.localUptimeTicks);
            return settings.lastServerNow + elapsed;
        }

        // Ultimate fallback (vulnerable to spoofing, but prevents crashing if uninitialized)
        throw new Error('Secure time baseline is missing. Please connect to the internet to sync time.');
    }
}
