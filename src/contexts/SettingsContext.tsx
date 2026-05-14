"use client";

import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { formatCurrency } from '@/lib/utils';
import { getStoreSettings } from '@/actions/settings';

interface SettingsContextType {
    currency: string;
    taxRate: number;
    settings: any;
    isLoading: boolean;
    formatPrice: (amount: number | string) => string;
    refreshSettings: () => Promise<void>;
}

const SettingsContext = createContext<SettingsContextType>({
    currency: 'EGP',
    taxRate: 0,
    settings: {},
    isLoading: true,
    formatPrice: (amount) => formatCurrency(amount, 'EGP'),
    refreshSettings: async () => {},
});

export function SettingsProvider({
    children,
    initialSettings
}: {
    children: React.ReactNode,
    initialSettings?: any
}) {
    const [settings, setSettings] = useState(initialSettings || {});
    const [isLoading, setIsLoading] = useState(!initialSettings);

    const refreshSettings = useCallback(async () => {
        setIsLoading(true);
        try {
            const res = await getStoreSettings();
            if (res?.success && res.data) {
                setSettings(res.data);
            }
        } finally {
            setIsLoading(false);
        }
    }, []);

    useEffect(() => {
        if (!initialSettings) {
            refreshSettings();
        }
    }, [initialSettings, refreshSettings]);

    const currency = settings.currency || 'EGP';
    const taxRate = Number(settings.taxRate) || 0;

    const formatPrice = (amount: number | string) => {
        return formatCurrency(amount, currency);
    };

    return (
        <SettingsContext.Provider value={{
            currency,
            taxRate,
            settings,
            isLoading,
            formatPrice,
            refreshSettings
        }}>
            {children}
        </SettingsContext.Provider>
    );
}

export const useSettings = () => useContext(SettingsContext);

export const useFormatCurrency = () => {
    const { formatPrice } = useSettings();
    return formatPrice;
};
