'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';

const SESSION_DURATION = 365 * 24 * 60 * 60 * 1000; // 365 days
const EXTENDED_SESSION = 365 * 24 * 60 * 60 * 1000; // 365 days
const WARNING_BEFORE_EXPIRY = 2 * 60 * 1000; // 2 minutes

// Safe localStorage wrapper with error handling
const safeLocalStorage = {
  getItem: (key: string): string | null => {
    try {
      return localStorage.getItem(key);
    } catch (error) {
      console.warn('localStorage.getItem failed:', error);
      return null;
    }
  },
  setItem: (key: string, value: string): boolean => {
    try {
      localStorage.setItem(key, value);
      return true;
    } catch (error) {
      console.warn('localStorage.setItem failed:', error);
      return false;
    }
  },
  removeItem: (key: string): boolean => {
    try {
      localStorage.removeItem(key);
      return true;
    } catch (error) {
      console.warn('localStorage.removeItem failed:', error);
      return false;
    }
  }
};

export function useSessionMonitor() {
  const [showWarning, setShowWarning] = useState(false);
  const [timeRemaining, setTimeRemaining] = useState<number>(0);
  const router = useRouter();

  const extendSession = useCallback(async () => {
    try {
      const response = await fetch('/api/session/extend', { method: 'POST' });
      
      if (!response.ok) {
        throw new Error('Session extension failed');
      }
      
      // Reset session start time
      safeLocalStorage.setItem('sessionStart', Date.now().toString());
      setShowWarning(false);
      setTimeRemaining(0);
    } catch (error) {
      console.error('Failed to extend session:', error);
      // Session likely expired, redirect to login
      router.push('/login?reason=expired');
    }
  }, [router]);

  const dismissWarning = useCallback(() => {
    setShowWarning(false);
  }, []);

  useEffect(() => {
    // Initialize session start time
    const sessionStart = safeLocalStorage.getItem('sessionStart');
    const rememberMe = safeLocalStorage.getItem('rememberMe') === 'true';
    
    if (!sessionStart) {
      safeLocalStorage.setItem('sessionStart', Date.now().toString());
      return;
    }

    // Check every 30 seconds
    const interval = setInterval(async () => {
      try {
        // Get server-provided expiry time from session API
        const response = await fetch('/api/session/info', { 
          method: 'GET',
          cache: 'no-store'
        });
        
        if (!response.ok) {
          // Session invalid on server
          safeLocalStorage.removeItem('sessionStart');
          router.push('/login?reason=expired');
          return;
        }
        
        const data = await response.json();
        const expiresAt = data.expiresAt;
        
        // Server provides expiry (works for new and old sessions)
        if (expiresAt) {
          const remaining = new Date(expiresAt).getTime() - Date.now();
          setTimeRemaining(remaining);
          
          if (remaining <= WARNING_BEFORE_EXPIRY && remaining > 0) {
            setShowWarning(true);
          } else if (remaining <= 0) {
            safeLocalStorage.removeItem('sessionStart');
            router.push('/login?reason=expired');
          }
        } else {
          // Extreme fallback (should not happen with updated API)
          const duration = rememberMe ? EXTENDED_SESSION : SESSION_DURATION;
          const start = safeLocalStorage.getItem('sessionStart');
          if (!start) return;
          
          const elapsed = Date.now() - parseInt(start);
          const remaining = duration - elapsed;
          setTimeRemaining(remaining);
          
          if (remaining <= WARNING_BEFORE_EXPIRY && remaining > 0) {
            setShowWarning(true);
          } else if (remaining <= 0) {
            safeLocalStorage.removeItem('sessionStart');
            router.push('/login?reason=expired');
          }
        }
      } catch (error) {
        // Only log non-network errors to avoid console spam when server is restarting or client is offline
        if (error instanceof Error && error.message === 'Failed to fetch') {
           // Network error / server down - ignore and retry next interval
           return;
        }
        console.warn('Failed to check session expiry:', error);
      }
    }, 30000);

    return () => clearInterval(interval);
  }, [router]);

  return {
    showWarning,
    timeRemaining,
    extendSession,
    dismissWarning,
  };
}
