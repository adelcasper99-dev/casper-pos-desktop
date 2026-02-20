'use client';

import { createContext, useContext, useEffect, useState, useCallback } from 'react';

interface CSRFContextValue {
    token: string | null;
    isLoading: boolean;
    refresh: () => Promise<void>;
    error: string | null;
}

const CSRFContext = createContext<CSRFContextValue | null>(null);

export function CSRFProvider({
    children,
    initialToken
}: {
    children: React.ReactNode;
    initialToken: string | null;
}) {
    const [token, setToken] = useState<string | null>(initialToken);
    const [isLoading, setIsLoading] = useState(!initialToken);
    const [error, setError] = useState<string | null>(null);

    const refresh = useCallback(async () => {
        try {
            setIsLoading(true);
            setError(null);

            const response = await fetch('/api/csrf/generate', {
                method: 'POST',
                credentials: 'same-origin', // IMPORTANT: Include cookies
                headers: {
                    'Content-Type': 'application/json'
                }
            });

            if (!response.ok) {
                throw new Error(`Failed to generate CSRF token: ${response.status}`);
            }

            const data = await response.json();

            if (!data.token) {
                throw new Error('No token received from server');
            }

            setToken(data.token);

            if (process.env.NODE_ENV === 'development') {
                console.log('✅ CSRF token generated:', data.token.substring(0, 10) + '...');
            }
        } catch (err) {
            const errorMessage = err instanceof Error ? err.message : 'Unknown error';
            console.error('❌ CSRF token generation failed:', errorMessage);
            setError(errorMessage);
            setToken(null);
        } finally {
            setIsLoading(false);
        }
    }, []);

    useEffect(() => {
        // Token should come from middleware via server-side initialToken
        if (token) {
            if (process.env.NODE_ENV === 'development') {
                console.log('✅ CSRF Context initialized with middleware token:', token.substring(0, 10) + '...');
            }
            setIsLoading(false);
        } else if (!isLoading) {
            // If no initial token, try to generate one via API (fallback)
            console.warn('⚠️ No CSRF token from middleware, falling back to API generation...');
            refresh();
        }
    }, [token, isLoading, refresh]);

    // ✅ PHASE 2: Proactive token rotation every 23 hours (before 24h expiry)
    useEffect(() => {
        if (!token) return;

        const rotateInterval = setInterval(async () => {
            if (process.env.NODE_ENV === 'development') {
                console.log('[CSRF] Proactive token rotation (23h timer)');
            }
            await refresh();
        }, 23 * 60 * 60 * 1000); // 23 hours

        return () => clearInterval(rotateInterval);
    }, [token, refresh]);

    const value: CSRFContextValue = {
        token,
        isLoading,
        refresh,
        error
    };

    return (
        <CSRFContext.Provider value={value}>
            {children}
        </CSRFContext.Provider>
    );
}

/**
 * Hook to access CSRF token throughout the application
 * 
 * Usage:
 * ```tsx
 * const { token, isLoading, refresh } = useCSRF();
 * 
 * if (isLoading) return <Spinner />;
 * 
 * formData.append('csrfToken', token!);
 * ```
 */
export function useCSRF() {
    const context = useContext(CSRFContext);

    if (!context) {
        throw new Error('useCSRF must be used within CSRFProvider. Did you forget to wrap your app?');
    }

    return context;
}
