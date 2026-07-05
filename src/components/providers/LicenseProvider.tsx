"use client";

import React, { createContext, useContext, useEffect, useState } from 'react';
import { clearLocalLicenseJwt } from '@/actions/settings';
import { ShieldAlert } from 'lucide-react';
import { CloudConfigManager } from '@/utils/cloudConfigManager';

interface LicenseContextType {
    isReadOnlyMode: boolean;
}

const LicenseContext = createContext<LicenseContextType>({
    isReadOnlyMode: false,
});

export function LicenseProvider({ children }: { children: React.ReactNode }) {
    const [isReadOnlyMode, setIsReadOnlyMode] = useState(false);

    useEffect(() => {
        let isMounted = true;

        const checkLicenseStatus = async () => {
            try {
                const cloudConfig = await CloudConfigManager.getCloudConfig();
                if (!cloudConfig.enabled || !cloudConfig.cloudUrl) {
                    return; // Can't ping if no cloud config
                }

                let machineId = '';
                const api = (window as any).electronAPI;
                if (api?.system?.getMachineId) {
                    machineId = await api.system.getMachineId();
                } else {
                    machineId = 'web-client'; 
                }

                // Call the Cloud Server's Ping Endpoint
                const endpoint = `${cloudConfig.cloudUrl}/api/license/ping`;
                const res = await fetch(endpoint, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ machineId, branchId: cloudConfig.branchId })
                });

                if (res.ok) {
                    const data = await res.json();
                    if (!data.valid) {
                        // License is Suspended/Revoked/Expired
                        console.warn("[LICENSE_ENFORCER] License check failed. Engaging Read-Only Mode.", data.reason);
                        if (isMounted) {
                            setIsReadOnlyMode(true);
                            await clearLocalLicenseJwt();
                        }
                    } else {
                        if (isMounted && isReadOnlyMode) {
                            setIsReadOnlyMode(false); // Restored
                        }
                    }
                }
            } catch (error) {
                console.error("[LICENSE_ENFORCER] Ping failed. Assuming offline, allowing local JWT to persist.");
            }
        };

        // Check on mount
        checkLicenseStatus();

        // Check every 6 hours (21600000 ms)
        const interval = setInterval(checkLicenseStatus, 21600000);

        return () => {
            isMounted = false;
            clearInterval(interval);
        };
    }, []);

    return (
        <LicenseContext.Provider value={{ isReadOnlyMode }}>
            {isReadOnlyMode && (
                <div className="fixed top-0 left-0 w-full bg-destructive text-destructive-foreground z-[9999] p-2 flex items-center justify-center gap-2 text-sm font-bold shadow-md animate-in slide-in-from-top">
                    <ShieldAlert className="w-5 h-5" />
                    LICENSE SUSPENDED. The application is in Read-Only Mode. Contact Administration.
                </div>
            )}
            {children}
        </LicenseContext.Provider>
    );
}

export const useLicense = () => useContext(LicenseContext);
