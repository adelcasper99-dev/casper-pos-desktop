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
        // Initial check
        setStatus(prev => ({
            ...prev,
            isOnline: typeof window !== 'undefined' ? navigator.onLine : true,
        }));

        // 🎨 VISUAL CLARITY: Get network quality info
        const updateConnectionInfo = () => {
            const connection = (navigator as any).connection;
            if (connection) {
                setStatus(prev => ({
                    ...prev,
                    effectiveType: connection.effectiveType,
                    downlink: connection.downlink,
                    rtt: connection.rtt,
                }));
            }
        };

        const handleOnline = () => {
            console.log('🟢 Network: ONLINE (Browser Event)');
            setStatus(prev => ({
                ...prev,
                isOnline: true,
                wasOffline: true, // Flag for showing reconnection message
            }));
            updateConnectionInfo();

            // ⚡ SPEED: Trigger background sync immediately
            if ('serviceWorker' in navigator && 'sync' in ServiceWorkerRegistration.prototype) {
                navigator.serviceWorker.ready.then(registration => {
                    (registration as any).sync.register('sync-offline-data');
                }).catch(console.error);
            }
        };

        const handleOffline = () => {
            console.log('🔴 Network: OFFLINE (Browser Event)');
            // Don't immediately trust offline event - verify with ping
            checkConnection().then(isActuallyOnline => {
                if (isActuallyOnline) {
                    console.log('🟢 Network: False Alarm (Ping succeeded)');
                    setStatus(prev => ({ ...prev, isOnline: true }));
                } else {
                    setStatus(prev => ({ ...prev, isOnline: false }));
                }
            });
        };

        const handleConnectionChange = () => {
            updateConnectionInfo();
        };

        window.addEventListener('online', handleOnline);
        window.addEventListener('offline', handleOffline);

        const connection = (navigator as any).connection;
        if (connection) {
            connection.addEventListener('change', handleConnectionChange);
        }

        // 🛡️ POLLING: If browser says offline, verify periodically
        let intervalId: NodeJS.Timeout;
        if (!status.isOnline) {
            intervalId = setInterval(async () => {
                const isActuallyOnline = await checkConnection();
                if (isActuallyOnline) {
                    console.log('🟢 Network: Recovered (Ping succeeded)');
                    setStatus(prev => ({
                        ...prev,
                        isOnline: true,
                        wasOffline: true
                    }));
                }
            }, 5000);
        }

        // Initial connection info
        updateConnectionInfo();

        // Double check initial state if it says offline
        if (!navigator.onLine) {
            checkConnection().then(online => {
                if (online) {
                    setStatus(prev => ({ ...prev, isOnline: true }));
                }
            });
        }

        return () => {
            window.removeEventListener('online', handleOnline);
            window.removeEventListener('offline', handleOffline);
            if (connection) {
                connection.removeEventListener('change', handleConnectionChange);
            }
            if (intervalId) clearInterval(intervalId);
        };
    }, [status.isOnline, checkConnection]);

    return { ...status, acknowledgeReconnection };
}
