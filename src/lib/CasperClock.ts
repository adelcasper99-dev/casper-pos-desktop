/**
 * CasperClock - Hybrid Delta Clock & Offline Clock Drift Protection
 * This utility ensures temporal integrity regardless of OS clock manipulation.
 */

class CasperClock {
    private static instance: CasperClock;
    private offsetDelta: number = 0;
    private anchorMonotonic: number = 0;
    private anchorWall: number = 0;
    private lastRecordedWall: number = 0;
    private isInitialised: boolean = false;
    private _isTimeSuspicious: boolean = false;

    private readonly DRIFT_THRESHOLD = 5000; // 5 seconds
    private readonly SANITY_YEAR = 2024;
    private readonly STORAGE_KEYS = {
        DELTA: 'casper_clock_offset_delta',
        LAST_SAFE_TIME: 'casper_clock_last_safe_time'
    };

    private constructor() {
        if (typeof window === 'undefined') return;
        this.initFromStorage();
        this.setAnchor();
    }

    public static getInstance(): CasperClock {
        if (!CasperClock.instance) {
            CasperClock.instance = new CasperClock();
        }
        return CasperClock.instance;
    }

    private initFromStorage() {
        try {
            const savedDelta = localStorage.getItem(this.STORAGE_KEYS.DELTA);
            const lastSafeTime = localStorage.getItem(this.STORAGE_KEYS.LAST_SAFE_TIME);

            if (savedDelta) {
                this.offsetDelta = parseInt(savedDelta, 10);
                this.isInitialised = true;
            } else {
                this._isTimeSuspicious = true; // No baseline
            }

            if (lastSafeTime) {
                this.lastRecordedWall = parseInt(lastSafeTime, 10);
                // If current wall clock is significantly behind last safe time, we are suspicious
                if (Date.now() < this.lastRecordedWall - 1000) {
                    this._isTimeSuspicious = true;
                }
            }
        } catch (e) {
            console.error('[CasperClock] Storage init failed', e);
        }
    }

    private setAnchor() {
        this.anchorMonotonic = performance.now();
        this.anchorWall = Date.now();
        this.updateLastSafeTime();
    }

    private updateLastSafeTime(time?: number) {
        const currentTime = time ?? (this.anchorWall + this.offsetDelta);
        localStorage.setItem(this.STORAGE_KEYS.LAST_SAFE_TIME, String(currentTime));
    }

    /**
     * Synchronize with server time to establish a baseline delta.
     */
    public async sync() {
        try {
            const startFetch = Date.now();
            const response = await fetch('/api/time', { cache: 'no-store' });
            const data = await response.json();
            const endFetch = Date.now();
            
            // Approximate latency subtraction
            const latency = (endFetch - startFetch) / 2;
            const serverTime = data.serverTime + latency;
            
            this.offsetDelta = serverTime - Date.now();
            this.isInitialised = true;
            this._isTimeSuspicious = false;

            localStorage.setItem(this.STORAGE_KEYS.DELTA, String(this.offsetDelta));
            this.setAnchor();
            
            console.log(`[CasperClock] Synced. Offset: ${this.offsetDelta}ms`);
            return true;
        } catch (error) {
            console.error('[CasperClock] Sync failed', error);
            return false;
        }
    }

    /**
     * Get the corrected absolute time.
     * Guaranteed forward-only within a session via monotonic anchor.
     */
    public now(): number {
        const currentWall = Date.now();
        const elapsedMonotonic = performance.now() - this.anchorMonotonic;
        
        // Expected current time based on anchor
        const expectedTime = this.anchorWall + this.offsetDelta + elapsedMonotonic;
        
        // Detect wall clock manipulation during session
        const wallClockJump = Math.abs(currentWall - this.anchorWall - elapsedMonotonic);
        
        if (wallClockJump > this.DRIFT_THRESHOLD) {
            // If the jump is massive, we stick to monotonic-derived time
            // to prevent backward timestamps
            this.updateLastSafeTime(expectedTime);
            return expectedTime;
        }

        // Final sanity check for year
        const finalTime = currentWall + this.offsetDelta;
        const year = new Date(finalTime).getFullYear();
        if (year < this.SANITY_YEAR) {
            this._isTimeSuspicious = true;
        }

        this.updateLastSafeTime(finalTime);
        return finalTime;
    }

    /**
     * Returns true if the current clock state is untrusted.
     */
    public isTimeSuspicious(): boolean {
        // Coarse check on year
        if (new Date(this.now()).getFullYear() < this.SANITY_YEAR) return true;
        return this._isTimeSuspicious;
    }

    /**
     * Helper to get a Date object with corrected time
     */
    public getDate(): Date {
        return new Date(this.now());
    }

    /**
     * Phase 1 Expansion: Expose clock drift status.
     * Returns true if the user's OS clock is drastically out of sync (offset > 5 minutes).
     */
    public isClockDrifting(): boolean {
        const DRIFT_THRESHOLD_MS = 300000; // 5 minutes
        return Math.abs(this.offsetDelta) > DRIFT_THRESHOLD_MS;
    }
}

export const casperClock = CasperClock.getInstance();
