'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { activateLicense } from './actions';
import { WifiOff, ShieldCheck, Loader2, AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { CloudConfigManager } from '@/utils/cloudConfigManager';
import { toast } from 'sonner';

const ERROR_MESSAGES: Record<string, string> = {
    INVALID_CODE:   'رمز التفعيل غير صحيح أو تم استخدامه مسبقاً',
    INVALID_FORMAT: 'صيغة الرمز غير صحيحة. التنسيق المطلوب: CASPER-XXXXXX',
    RATE_LIMITED:   'محاولات كثيرة جداً. يُرجى الانتظار 15 دقيقة والمحاولة مرة أخرى',
    SCHEMA_ERROR:   'خطأ في إعداد الخادم. تواصل مع الدعم الفني',
    default:        'فشل التفعيل. يُرجى المحاولة مجدداً أو التواصل مع الدعم',
};

export default function ActivateForm() {
    const router = useRouter();
    const [code, setCode] = useState('');
    const [isOnline, setIsOnline] = useState(true);
    
    // 0 = idle, 1 = جاري التحقق, 2 = جاري ربط الجهاز, 3 = تم التفعيل
    const [loadingPhase, setLoadingPhase] = useState<0 | 1 | 2 | 3>(0);
    const [error, setError] = useState<string | null>(null);

    // 🛡️ P1-10: Fetch machine ID from Electron main process
    const [machineId, setMachineId] = useState<string | null>(null);
    const [machineIdError, setMachineIdError] = useState<string | null>(null);

    useEffect(() => {
        setIsOnline(navigator.onLine);
        const handleOnline = () => setIsOnline(true);
        const handleOffline = () => setIsOnline(false);

        window.addEventListener('online', handleOnline);
        window.addEventListener('offline', handleOffline);

        // Fetch hardware ID via Electron IPC bridge (desktop) or fall back to
        // a server-derived node ID for the cloud web deployment.
        if (window.electronAPI?.license?.getMachineId) {
            window.electronAPI.license.getMachineId()
                .then((id) => setMachineId(id))
                .catch(() => setMachineIdError('Failed to read hardware ID. Please ensure you are running the desktop app.'));
        } else {
            // Cloud/web mode: use the server's IP as a stable machine ID
            fetch('/api/network/ip')
                .then(r => r.json())
                .then((data: { ip?: string }) => {
                    setMachineId(`cloud-${data.ip || window.location.hostname}`);
                })
                .catch(() => {
                    setMachineId(`cloud-${window.location.hostname}`);
                });
        }

        return () => {
            window.removeEventListener('online', handleOnline);
            window.removeEventListener('offline', handleOffline);
        };
    }, []);

    const handleCodeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        let val = e.target.value.toUpperCase().replace(/[^A-Z0-9-]/g, '');
        // Auto-format: CASPER-XXXXXX
        if (val.length >= 7 && val[6] !== '-' && !val.substring(0, 6).includes('-')) {
            val = val.substring(0, 6) + '-' + val.substring(6);
        }
        setCode(val);
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!code || !machineId) return;

        setLoadingPhase(1); // Phase 1: جاري التحقق من الترخيص...
        setError(null);

        const result = await activateLicense(code, machineId);
        
        if (result.success && result.branchId && result.syncSecret && result.cloudUrl) {
            setLoadingPhase(2); // Phase 2: جاري ربط الجهاز...
            
            // Save cloud config
            const configSaved = await CloudConfigManager.saveCloudConfig({
                enabled: true,
                cloudUrl: result.cloudUrl,
                branchId: result.branchId,
                syncSecret: result.syncSecret
            });

            if (!configSaved.success) {
                toast.warning('تحذير: تعذّر حفظ إعدادات المزامنة. سيتم المحاولة عند إعادة التشغيل.');
            }

            // Small delay to show the nice step-by-step progress
            await new Promise(resolve => setTimeout(resolve, 600));
            setLoadingPhase(3); // Phase 3: تم التفعيل بنجاح ✓
            await new Promise(resolve => setTimeout(resolve, 400));

            router.push('/');
            router.refresh();
        } else {
            const errKey = result.error as keyof typeof ERROR_MESSAGES;
            const friendlyError = ERROR_MESSAGES[errKey] || ERROR_MESSAGES.default;
            setError(friendlyError);
            setLoadingPhase(0);
        }
    };

    const isLoading = loadingPhase > 0;
    const canSubmit = !!code && !!machineId && !isLoading && isOnline;

    const getLoadingLabel = () => {
        switch (loadingPhase) {
            case 1: return 'جاري التحقق من الترخيص...';
            case 2: return 'جاري ربط الجهاز...';
            case 3: return 'تم التفعيل بنجاح ✓';
            default: return 'Activating...';
        }
    };

    return (
        <div className="flex flex-col gap-6 w-full max-w-md mx-auto p-6 bg-card rounded-xl border shadow-lg mt-20">
            <div className="flex flex-col items-center justify-center text-center gap-2">
                <ShieldCheck className="w-12 h-12 text-primary" />
                <h1 className="text-2xl font-bold">Activate License</h1>
                <p className="text-muted-foreground text-sm">Enter your activation code to unlock Casper POS</p>
            </div>

            {!isOnline && (
                <Alert variant="destructive">
                    <WifiOff className="h-4 w-4" />
                    <AlertTitle>Offline</AlertTitle>
                    <AlertDescription>Internet connection required for activation.</AlertDescription>
                </Alert>
            )}

            {machineIdError && (
                <Alert variant="destructive">
                    <AlertTriangle className="h-4 w-4" />
                    <AlertTitle>Hardware ID Error</AlertTitle>
                    <AlertDescription>{machineIdError}</AlertDescription>
                </Alert>
            )}

            {error && (
                <Alert variant="destructive">
                    <AlertDescription>{error}</AlertDescription>
                </Alert>
            )}

            <form onSubmit={handleSubmit} className="flex flex-col gap-4">
                <div className="flex flex-col gap-2">
                    <label className="text-sm font-medium">Activation Code</label>
                    <Input 
                        value={code} 
                        onChange={handleCodeChange} 
                        placeholder="CASPER-XXXXXX"
                        maxLength={13}
                        disabled={isLoading || !isOnline || !!machineIdError}
                        className="text-center font-mono text-lg tracking-widest uppercase"
                    />
                </div>

                <Button type="submit" disabled={!canSubmit} className="w-full">
                    {isLoading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
                    {isLoading ? getLoadingLabel() : 'Activate Now'}
                </Button>
            </form>
        </div>
    );
}
