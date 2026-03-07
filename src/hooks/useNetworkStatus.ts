import { useState, useEffect, useCallback, useRef } from 'react';
import { logger } from '@/lib/logger';

export interface NetworkStatus {
    isOnline: boolean;
    wasOffline: boolean;
}

/**
 * Checks reachability of the LOCAL Next.js server, not the internet.
 * In Electron, the server runs on 127.0.0.1 — WAN internet state is irrelevant.
 * isOnline = true  → local server is responding normally
 * isOnline = false → local server process has crashed or is unreachable
 */
export function useNetworkStatus() {
    const [status, setStatus] = useState<NetworkStatus>({
        isOnline: true, // Optimistic default — server is local, assume reachable
        wasOffline: false,
    });
    const wasOfflineRef = useRef(false);

    const acknowledgeReconnection = useCallback(() => {
        setStatus(prev => ({ ...prev, wasOffline: false }));
        wasOfflineRef.current = false;
    }, []);

    const checkLocalServer = useCallback(async (): Promise<boolean> => {
        try {
            const res = await fetch('/api/health?t=' + Date.now(), {
                method: 'HEAD',
                cache: 'no-store',
            });
            return res.ok;
        } catch {
            return false;
        }
    }, []);

    useEffect(() => {
        let mounted = true;

        const poll = async () => {
            if (!mounted) return;
            const serverUp = await checkLocalServer();

            if (!mounted) return;

            if (!serverUp && status.isOnline) {
                logger.warn('🔴 Local server unreachable');
                wasOfflineRef.current = true;
                setStatus({ isOnline: false, wasOffline: false });
            } else if (serverUp && !status.isOnline) {
                logger.info('🟢 Local server back online');
                setStatus({ isOnline: true, wasOffline: true });
                wasOfflineRef.current = false;
            }
        };

        // Initial check
        poll();

        // Poll every 15 seconds — server is local so this is very cheap
        const intervalId = setInterval(poll, 15000);

        return () => {
            mounted = false;
            clearInterval(intervalId);
        };
    }, [checkLocalServer, status.isOnline]);

    return { ...status, acknowledgeReconnection };
}
