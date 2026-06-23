"use client";

import React, { useState } from 'react';
import { useSyncStatus } from '@/hooks/useSyncStatus';
import { Cloud, CloudOff, RefreshCw, AlertTriangle } from 'lucide-react';
import { cn } from '@/lib/utils'; // Assuming this exists in standard setup
import { SyncService } from '@/lib/sync-service';
import { toast } from 'sonner';

export default function SyncStatusBar() {
    const { status, pendingCount, errorCount } = useSyncStatus();
    const [isManualSyncing, setIsManualSyncing] = useState(false);

    // Node Role Check - Only show this bar if we are on a MASTER node
    const isMaster = process.env.NEXT_PUBLIC_NODE_ROLE === 'MASTER' || !process.env.NEXT_PUBLIC_NODE_ROLE;
    
    if (!isMaster) return null;

    const handleManualSync = async () => {
        if (isManualSyncing || status === 'OFFLINE') return;

        setIsManualSyncing(true);
        toast.info('جاري محاولة المزامنة والإصلاح...', { duration: 2000 });

        try {
            const result = await SyncService.manualSync();
            
            if (result.success) {
                toast.success('تم الإصلاح والمزامنة بنجاح.');
            } else {
                toast.error('تعذر إصلاح بعض الفواتير، راجع الدعم الفني.');
            }
        } catch (error) {
            console.error('[SyncStatusBar] Manual sync failed:', error);
            toast.error('حدث خطأ غير متوقع أثناء المزامنة.');
        } finally {
            setIsManualSyncing(false);
        }
    };

    // Helper to determine styling and content
    const getConfig = () => {
        if (isManualSyncing) {
            return {
                color: 'text-blue-500 bg-blue-50 border-blue-200 dark:bg-blue-500/10 dark:border-blue-500/20',
                icon: <RefreshCw className="w-4 h-4 animate-spin" />,
                text: 'جاري الإصلاح...'
            };
        }

        switch (status) {
            case 'ONLINE_SYNCED':
                return {
                    color: 'text-emerald-500 bg-emerald-50 border-emerald-200 dark:bg-emerald-500/10 dark:border-emerald-500/20 hover:bg-emerald-100',
                    icon: <Cloud className="w-4 h-4" />,
                    text: 'متصل ومُزامن'
                };
            case 'SYNCING':
                return {
                    color: 'text-blue-500 bg-blue-50 border-blue-200 dark:bg-blue-500/10 dark:border-blue-500/20 hover:bg-blue-100',
                    icon: <RefreshCw className="w-4 h-4 animate-spin" />,
                    text: `جاري المزامنة (${pendingCount})`
                };
            case 'OFFLINE':
                return {
                    color: 'text-rose-500 bg-rose-50 border-rose-200 dark:bg-rose-500/10 dark:border-rose-500/20 opacity-70 cursor-not-allowed',
                    icon: <CloudOff className="w-4 h-4" />,
                    text: 'غير متصل (Offline)'
                };
            case 'ERROR':
                return {
                    color: 'text-amber-600 bg-amber-50 border-amber-200 dark:text-amber-500 dark:bg-amber-500/10 dark:border-amber-500/20 hover:bg-amber-100',
                    icon: <AlertTriangle className="w-4 h-4" />,
                    text: `خطأ في المزامنة (${errorCount})`
                };
            default:
                return {
                    color: 'text-slate-500 bg-slate-50 border-slate-200',
                    icon: <Cloud className="w-4 h-4" />,
                    text: '...'
                };
        }
    };

    const config = getConfig();
    const isDisabled = isManualSyncing || status === 'OFFLINE';

    return (
        <button 
            onClick={handleManualSync}
            disabled={isDisabled}
            className={cn(
                "flex items-center gap-2 px-3 py-1.5 rounded-full border text-xs font-medium transition-all duration-300 shadow-sm",
                isDisabled ? "" : "cursor-pointer active:scale-95",
                config.color
            )}
            title={isDisabled ? "" : "اضغط للمزامنة اليدوية وإصلاح الأخطاء"}
        >
            {config.icon}
            <span>{config.text}</span>
        </button>
    );
}
