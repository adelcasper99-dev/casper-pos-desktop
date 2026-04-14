import { useState, useEffect } from 'react';
import { SyncService } from '@/lib/sync-service';

export function useOfflineQueueStatus() {
    const [status, setStatus] = useState({
        salesCount: 0,
        ticketsCount: 0,
        treasuryCount: 0,
        inventoryCount: 0,
        returnsCount: 0,
        total: 0,
        hasDeadLetter: false
    });

    const updateStatus = async () => {
        try {
            const queueStatus = await SyncService.getQueueStatus();
            
            // For now, hasDeadLetter check is simple
            // We could expand SyncService.getQueueStatus to actually check for DEAD_LETTER error strings
            setStatus({
                ...queueStatus,
                hasDeadLetter: false // Placeholder
            });
        } catch (error) {
            console.error('Failed to update sync status', error);
        }
    };

    useEffect(() => {
        updateStatus();
        const interval = setInterval(updateStatus, 15000); // Update every 15s
        return () => clearInterval(interval);
    }, []);

    return {
        ...status,
        refresh: updateStatus,
        manualSync: async () => {
            const result = await SyncService.manualSync();
            await updateStatus();
            return result;
        }
    };
}
