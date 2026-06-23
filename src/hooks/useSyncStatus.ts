import { useState, useEffect } from 'react';
import { SyncService } from '@/lib/sync-service';

export type SyncStatusState = 'ONLINE_SYNCED' | 'SYNCING' | 'OFFLINE' | 'ERROR';

export function useSyncStatus() {
    const [status, setStatus] = useState<SyncStatusState>('ONLINE_SYNCED');
    const [pendingCount, setPendingCount] = useState(0);
    const [errorCount, setErrorCount] = useState(0);

    useEffect(() => {
        let isMounted = true;

        const checkStatus = async () => {
            if (!isMounted) return;

            // 1. Check network connectivity
            if (!navigator.onLine) {
                setStatus('OFFLINE');
                return;
            }

            try {
                // 2. Fetch queue status from local IndexedDB
                const queue = await SyncService.getQueueStatus();
                
                if (!isMounted) return;

                setPendingCount(queue.total);
                setErrorCount(queue.errorCount || 0);

                if (queue.errorCount > 0) {
                    setStatus('ERROR');
                } else if (queue.total > 0) {
                    setStatus('SYNCING');
                } else {
                    setStatus('ONLINE_SYNCED');
                }
            } catch (error) {
                console.error('[useSyncStatus] Failed to check queue status', error);
                // Don't change status to error immediately on a read fail, just log it.
            }
        };

        // Initial check
        checkStatus();

        // Listen for online/offline events
        window.addEventListener('online', checkStatus);
        window.addEventListener('offline', checkStatus);

        // Poll the IndexedDB every 5 seconds
        const interval = setInterval(checkStatus, 5000);

        return () => {
            isMounted = false;
            window.removeEventListener('online', checkStatus);
            window.removeEventListener('offline', checkStatus);
            clearInterval(interval);
        };
    }, []);

    return { status, pendingCount, errorCount };
}
