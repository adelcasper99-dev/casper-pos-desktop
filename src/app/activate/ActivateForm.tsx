'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { activateLicense } from './actions';
import { WifiOff, ShieldCheck, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';

export default function ActivateForm() {
    const router = useRouter();
    const [code, setCode] = useState('');
    const [isOnline, setIsOnline] = useState(true);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        setIsOnline(navigator.onLine);
        const handleOnline = () => setIsOnline(true);
        const handleOffline = () => setIsOnline(false);

        window.addEventListener('online', handleOnline);
        window.addEventListener('offline', handleOffline);

        return () => {
            window.removeEventListener('online', handleOnline);
            window.removeEventListener('offline', handleOffline);
        };
    }, []);

    const handleCodeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        let val = e.target.value.toUpperCase().replace(/[^A-Z0-9-]/g, '');
        // Auto-dash format: CASPER-XXXXXX
        if (val.length > 6 && !val.includes('-')) {
            val = val.substring(0, 6) + '-' + val.substring(6);
        }
        setCode(val);
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!code) return;

        setLoading(true);
        setError(null);

        const result = await activateLicense(code);
        
        if (result.success) {
            router.push('/');
        } else {
            setError(result.error || 'Activation failed');
            setLoading(false);
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
                        disabled={loading || !isOnline}
                        className="text-center font-mono text-lg tracking-widest uppercase"
                    />
                </div>

                <Button type="submit" disabled={!code || loading || !isOnline} className="w-full">
                    {loading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
                    {loading ? 'Activating...' : 'Activate Now'}
                </Button>
            </form>
        </div>
    );
}
