'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { activateLicense, activateByCloudLogin } from './actions';
import { WifiOff, ShieldCheck, Loader2, AlertTriangle, Cloud, KeyRound, ArrowRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { CloudConfigManager } from '@/utils/cloudConfigManager';
import { toast } from 'sonner';

const ERROR_MESSAGES: Record<string, string> = {
    INVALID_CODE:   'رمز التفعيل غير صحيح أو تم استخدامه مسبقاً',
    INVALID_FORMAT: 'صيغة الرمز غير صحيحة. التنسيق المطلوب: CASPER-XXXX-XXXX-XXXX',
    RATE_LIMITED:   'محاولات كثيرة جداً. يُرجى الانتظار 15 دقيقة والمحاولة مرة أخرى',
    SCHEMA_ERROR:   'خطأ في إعداد الخادم. تواصل مع الدعم الفني',
    default:        'فشل التفعيل. يُرجى المحاولة مجدداً أو التواصل مع الدعم',
};

export default function ActivateForm() {
    const router = useRouter();
    const [mode, setMode] = useState<'cloud_login' | 'key'>('cloud_login');
    const [code, setCode] = useState('');

    // Cloud login state
    const [cloudUrl, setCloudUrl] = useState('https://ozza.casper-erp.com');
    const [username, setUsername] = useState('');
    const [password, setPassword] = useState('');

    const [isOnline, setIsOnline] = useState(true);
    
    // 0 = idle, 1 = جاري التحقق, 2 = جاري ربط الجهاز, 3 = تم التفعيل
    const [loadingPhase, setLoadingPhase] = useState<0 | 1 | 2 | 3>(0);
    const [error, setError] = useState<string | null>(null);

    // 🛡️ Fetch machine ID
    const [machineId, setMachineId] = useState<string | null>(null);
    const [machineIdError, setMachineIdError] = useState<string | null>(null);

    useEffect(() => {
        setIsOnline(navigator.onLine);
        const handleOnline = () => setIsOnline(true);
        const handleOffline = () => setIsOnline(false);

        window.addEventListener('online', handleOnline);
        window.addEventListener('offline', handleOffline);

        if (window.electronAPI?.license?.getMachineId) {
            window.electronAPI.license.getMachineId()
                .then((id) => setMachineId(id))
                .catch(() => setMachineIdError('فشل قراءة معرف الهاردوير المحلي.'));
        } else {
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
        if (val.length >= 6 && !val.startsWith('CASPER-') && !val.includes('-')) {
            val = `CASPER-${val}`;
        }
        setCode(val);
    };

    const handleCloudSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!username || !password || !cloudUrl || !machineId) return;

        setLoadingPhase(1);
        setError(null);

        const result = await activateByCloudLogin(cloudUrl, username, password, machineId);

        if (result.success && result.branchId && result.syncSecret && result.cloudUrl) {
            setLoadingPhase(2);
            await new Promise(resolve => setTimeout(resolve, 500));
            setLoadingPhase(3);
            await new Promise(resolve => setTimeout(resolve, 400));
            router.push('/');
            router.refresh();
        } else {
            setError(result.error || ERROR_MESSAGES.default);
            setLoadingPhase(0);
        }
    };

    const handleKeySubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!code || !machineId) return;

        setLoadingPhase(1);
        setError(null);

        const result = await activateLicense(code, machineId);
        
        if (result.success && result.branchId && result.syncSecret && result.cloudUrl) {
            setLoadingPhase(2);
            
            const configSaved = await CloudConfigManager.saveCloudConfig({
                enabled: true,
                cloudUrl: result.cloudUrl,
                branchId: result.branchId,
                syncSecret: result.syncSecret
            });

            if (!configSaved.success) {
                toast.warning('تحذير: تعذّر حفظ إعدادات المزامنة.');
            }

            await new Promise(resolve => setTimeout(resolve, 500));
            setLoadingPhase(3);
            await new Promise(resolve => setTimeout(resolve, 400));

            router.push('/');
            router.refresh();
        } else {
            const errStr = result.error || 'default';
            const friendlyError = ERROR_MESSAGES[errStr] || errStr || ERROR_MESSAGES.default;
            setError(friendlyError);
            setLoadingPhase(0);
        }
    };

    const isLoading = loadingPhase > 0;

    const getLoadingLabel = () => {
        switch (loadingPhase) {
            case 1: return 'جاري التحقق والتراخيص...';
            case 2: return 'جاري ربط الفرع وقاعدة البيانات...';
            case 3: return 'تم التفعيل بنجاح ✓';
            default: return 'جاري التفعيل...';
        }
    };

    return (
        <div className="flex flex-col gap-6 w-full max-w-lg mx-auto p-6 md:p-8 bg-card rounded-2xl border shadow-2xl mt-12 font-cairo" dir="rtl">
            <div className="flex flex-col items-center justify-center text-center gap-2">
                <div className="p-3 bg-primary/10 rounded-2xl text-primary mb-1">
                    <ShieldCheck className="w-10 h-10" />
                </div>
                <h1 className="text-2xl font-black text-foreground">تفعيل ترخيص Casper POS</h1>
                <p className="text-muted-foreground text-xs font-bold">ربط الجهاز المحلي بحسابك التجاري وتفعيل البيع والمزامنة</p>
            </div>

            {/* Tabs for Activation Mode */}
            <div className="grid grid-cols-2 gap-2 bg-muted p-1 rounded-xl">
                <button
                    type="button"
                    onClick={() => setMode('cloud_login')}
                    className={`py-2 px-3 rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-2 ${
                        mode === 'cloud_login' 
                            ? 'bg-background text-foreground shadow-sm' 
                            : 'text-muted-foreground hover:text-foreground'
                    }`}
                >
                    <Cloud className="w-4 h-4" />
                    <span>التفعيل بحساب الكلاود</span>
                </button>
                <button
                    type="button"
                    onClick={() => setMode('key')}
                    className={`py-2 px-3 rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-2 ${
                        mode === 'key' 
                            ? 'bg-background text-foreground shadow-sm' 
                            : 'text-muted-foreground hover:text-foreground'
                    }`}
                >
                    <KeyRound className="w-4 h-4" />
                    <span>كود التفعيل (CASPER-XXXX)</span>
                </button>
            </div>

            {!isOnline && (
                <Alert variant="destructive">
                    <WifiOff className="h-4 w-4" />
                    <AlertTitle>لا يوجد اتصال بالإنترنت</AlertTitle>
                    <AlertDescription>يتطلب التفعيل الاتصال بالشبكة لربط الترخيص بالم ختزن المحلي.</AlertDescription>
                </Alert>
            )}

            {machineIdError && (
                <Alert variant="destructive">
                    <AlertTriangle className="h-4 w-4" />
                    <AlertTitle>خطأ في معرف الهاردوير</AlertTitle>
                    <AlertDescription>{machineIdError}</AlertDescription>
                </Alert>
            )}

            {error && (
                <Alert variant="destructive">
                    <AlertDescription>{error}</AlertDescription>
                </Alert>
            )}

            {/* Cloud Login Tab Form */}
            {mode === 'cloud_login' ? (
                <form onSubmit={handleCloudSubmit} className="flex flex-col gap-4">
                    <div className="flex flex-col gap-1.5">
                        <label className="text-xs font-bold text-muted-foreground">رابط سيرفر الكلاود (Cloud Domain)</label>
                        <Input 
                            value={cloudUrl} 
                            onChange={(e) => setCloudUrl(e.target.value)} 
                            placeholder="https://ozza.casper-erp.com"
                            disabled={isLoading || !isOnline}
                            className="font-mono text-sm"
                            required
                        />
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        <div className="flex flex-col gap-1.5">
                            <label className="text-xs font-bold text-muted-foreground">اسم المستخدم</label>
                            <Input 
                                value={username} 
                                onChange={(e) => setUsername(e.target.value)} 
                                placeholder="admin"
                                disabled={isLoading || !isOnline}
                                required
                            />
                        </div>

                        <div className="flex flex-col gap-1.5">
                            <label className="text-xs font-bold text-muted-foreground">كلمة المرور</label>
                            <Input 
                                type="password"
                                value={password} 
                                onChange={(e) => setPassword(e.target.value)} 
                                placeholder="••••••••"
                                disabled={isLoading || !isOnline}
                                required
                            />
                        </div>
                    </div>

                    <Button type="submit" disabled={isLoading || !isOnline || !username || !password} className="w-full mt-2 font-black py-6">
                        {isLoading ? <Loader2 className="w-4 h-4 ml-2 animate-spin" /> : <ArrowRight className="w-4 h-4 ml-2" />}
                        {isLoading ? getLoadingLabel() : 'تفعيل وتدشين الديسك توب فوراً'}
                    </Button>
                </form>
            ) : (
                /* Key Code Tab Form */
                <form onSubmit={handleKeySubmit} className="flex flex-col gap-4">
                    <div className="flex flex-col gap-1.5">
                        <label className="text-xs font-bold text-muted-foreground">رمز التفعيل (Activation Code)</label>
                        <Input 
                            value={code} 
                            onChange={handleCodeChange} 
                            placeholder="CASPER-XXXX-XXXX-XXXX"
                            maxLength={64}
                            disabled={isLoading || !isOnline || !!machineIdError}
                            className="text-center font-mono text-lg tracking-widest uppercase dir-ltr"
                            required
                        />
                    </div>

                    <Button type="submit" disabled={isLoading || !isOnline || !code} className="w-full mt-2 font-black py-6">
                        {isLoading ? <Loader2 className="w-4 h-4 ml-2 animate-spin" /> : null}
                        {isLoading ? getLoadingLabel() : 'تفعيل الرمز الآن'}
                    </Button>
                </form>
            )}
        </div>
    );
}
