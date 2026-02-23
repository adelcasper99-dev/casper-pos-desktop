'use client';

import { useState, useEffect, useCallback } from 'react';

export interface NetworkStatus {
    isOnline: boolean;
    wasOffline: boolean;
    effectiveType?: string; // '4g', '3g', '2g', 'slow-2g'
    downlink?: number; // Mbps
    rtt?: number; // Round-trip time in ms
}

export function useNetworkStatus() {
    const [status, setStatus] = useState<NetworkStatus>({
        isOnline: typeof window !== 'undefined' ? navigator.onLine : true,
        wasOffline: false,
    });

    // 👤 USABILITY: Reset "wasOffline" flag after user acknowledges
    const acknowledgeReconnection = useCallback(() => {
        setStatus(prev => ({ ...prev, wasOffline: false }));
    }, []);

    // 🛡️ RELIABILITY: Ping check to verify actual connection (overcoming navigator.onLine false negatives)
    const checkConnection = useCallback(async () => {
        try {
            // Use a lightweight endpoint or a known reliable resource
            // Adding timestamp to prevent caching
            const res = await fetch('/api/health?t=' + Date.now(), { method: 'HEAD', cache: 'no-store' });
            if (res.ok) {
                return true;
            }
        } catch (e) {
            // Still offline
        }
        return false;
    }, []);

    useEffect(() => {
        // Initial setup
        const connection = (navigator as any).connection;

        const updateStatus = () => {
            setStatus(prev => ({
                ...prev,
                isOnline: navigator.onLine,
                effectiveType: connection?.effectiveType,
                downlink: connection?.downlink,
                rtt: connection?.rtt,
            }));
        };

        const handleOnline = () => {
            console.log('🟢 Network: ONLINE');
            setStatus(prev => ({ ...prev, isOnline: true, wasOffline: true }));
            updateStatus();
        };

        const handleOffline = () => {
            console.log('🔴 Network: OFFLINE');
            // Verify with ping before committing to offline state
            checkConnection().then(isActuallyOnline => {
                setStatus(prev => ({ ...prev, isOnline: isActuallyOnline }));
            });
        };

        window.addEventListener('online', handleOnline);
        window.addEventListener('offline', handleOffline);
        connection?.addEventListener('change', updateStatus);

        // 🛡️ POLLING: Less aggressive polling
        const intervalId = setInterval(async () => {
            if (!navigator.onLine || !status.isOnline) {
                const isActuallyOnline = await checkConnection();
                if (isActuallyOnline && !status.isOnline) {
                    setStatus(prev => ({ ...prev, isOnline: true, wasOffline: true }));
                }
            }
        }, 10000); // 10 seconds (less aggressive)

        return () => {
            window.removeEventListener('online', handleOnline);
            window.removeEventListener('offline', handleOffline);
            connection?.removeEventListener('change', updateStatus);
            clearInterval(intervalId);
        };
    }, [checkConnection]); // Removed [status.isOnline] which caused unnecessary effect resets

    return { ...status, acknowledgeReconnection };
}
