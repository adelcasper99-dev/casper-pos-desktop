"use client";

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { CloudConfigManager } from '@/utils/cloudConfigManager';
import { offlineDB } from '@/lib/offline-db';
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

export default function LicenseActivationScreen() {
    const [cloudUrl, setCloudUrl] = useState(process.env.NEXT_PUBLIC_CLOUD_URL || 'https://cloud.casper-pos.com');
    const [licenseKey, setLicenseKey] = useState('');
    const [syncSecret, setSyncSecret] = useState('');
    const [branchId, setBranchId] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const router = useRouter();

    const handleActivate = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsLoading(true);

        try {
            // Get MAC address from Electron if available, else generate a random hardware ID
            let macAddress = 'web-client-id';
            if (typeof window !== 'undefined' && window.electronAPI?.config) {
                // In a real app we'd get the actual MAC. Using a placeholder for now.
                macAddress = 'electron-device-id'; 
            }

            // 1. Call Cloud API to activate license
            const response = await fetch(`${cloudUrl}/api/auth/activate`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ licenseKey, macAddress })
            });

            if (!response.ok) {
                const err = await response.json();
                throw new Error(err.error || 'Activation failed');
            }

            const data = await response.json();
            const jwt = data.token;

            // 2. Encrypt JWT via safeStorage if available
            let finalJwt = jwt;
            if (typeof window !== 'undefined' && window.electronAPI?.safeStorage) {
                const response = await window.electronAPI.safeStorage.encryptString(jwt);
                if (!response.success) {
                    toast.error(`Activation failed: System encryption error (${response.error}). Please contact IT.`);
                    setIsLoading(false);
                    return;
                }
                if (!response.encrypted) {
                    toast.warning("Note: License stored without system encryption.");
                }
                finalJwt = response.data;
            }

            // 3. Save to Cloud Config and IndexedDB settings
            await CloudConfigManager.saveCloudConfig({
                enabled: true,
                cloudUrl,
                branchId,
                syncSecret
            });

            // Store the encrypted JWT in offlineDB (avoid localStorage to prevent XSS)
            if (typeof window !== 'undefined') {
                try {
                    const existingSettings = await offlineDB.storeSettings.get('settings');
                    await offlineDB.storeSettings.put({ ...existingSettings, id: 'settings', licenseJwt: finalJwt });
                } catch (dbErr) {
                    console.error('Failed to save to offlineDB', dbErr);
                }
            }

            toast.success('تم تفعيل النسخة بنجاح');
            
            // Redirect to home/dashboard
            router.push('/');
            router.refresh();

        } catch (error: any) {
            toast.error(`خطأ: ${error.message}`);
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div className="flex items-center justify-center min-h-screen bg-gray-50 p-4">
            <Card className="w-full max-w-lg shadow-xl">
                <CardHeader className="text-center">
                    <CardTitle className="text-2xl font-bold text-gray-800">تفعيل كاسبر للحوسبة السحابية</CardTitle>
                    <CardDescription>الرجاء إدخال بيانات التفعيل لربط نقطة البيع بالسحابة</CardDescription>
                </CardHeader>
                <form onSubmit={handleActivate}>
                    <CardContent className="space-y-4">
                        <div className="space-y-2">
                            <Label htmlFor="cloudUrl">رابط السحابة (Cloud URL)</Label>
                            <Input 
                                id="cloudUrl" 
                                value={cloudUrl} 
                                onChange={(e) => setCloudUrl(e.target.value)} 
                                required 
                                dir="ltr"
                            />
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="licenseKey">مفتاح الترخيص (License Key)</Label>
                            <Input 
                                id="licenseKey" 
                                value={licenseKey} 
                                onChange={(e) => setLicenseKey(e.target.value)} 
                                required 
                                dir="ltr"
                                placeholder="XXXX-XXXX-XXXX-XXXX"
                            />
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="branchId">رقم الفرع (Branch ID)</Label>
                            <Input 
                                id="branchId" 
                                value={branchId} 
                                onChange={(e) => setBranchId(e.target.value)} 
                                required 
                                dir="ltr"
                            />
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="syncSecret">كلمة سر المزامنة (Sync Secret)</Label>
                            <Input 
                                id="syncSecret" 
                                type="password"
                                value={syncSecret} 
                                onChange={(e) => setSyncSecret(e.target.value)} 
                                required 
                                dir="ltr"
                            />
                        </div>
                    </CardContent>
                    <CardFooter>
                        <Button type="submit" className="w-full text-lg h-12" disabled={isLoading}>
                            {isLoading ? 'جاري التفعيل...' : 'تفعيل'}
                        </Button>
                    </CardFooter>
                </form>
            </Card>
        </div>
    );
}
