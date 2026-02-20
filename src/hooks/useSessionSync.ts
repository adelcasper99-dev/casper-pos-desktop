'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

// Safe localStorage wrapper
const safeLocalStorage = {
  getItem: (key: string): string | null => {
    try {
      return localStorage.getItem(key);
    } catch { return null; }
  },
  setItem: (key: string, value: string): boolean => {
    try {
      localStorage.setItem(key, value);
      return true;
    } catch { return false; }
  },
  removeItem: (key: string): boolean => {
    try {
      localStorage.removeItem(key);
      return true;
    } catch { return false; }
  }
};

export function useSessionSync() {
  const router = useRouter();

  useEffect(() => {
    // Storage event listener (cross-tab communication)
    const handleStorageChange = (e: StorageEvent) => {
      if (e.key === 'sessionInvalidated' && e.newValue === 'true') {
        // Another tab logged out
        safeLocalStorage.removeItem('sessionStart');
        safeLocalStorage.removeItem('lastActivity');
        router.push('/login?reason=logout');
        router.refresh();
      }
    };

    window.addEventListener('storage', handleStorageChange);

    // BroadcastChannel (same-tab communication, faster)
    let channel: BroadcastChannel | null = null;
    
    try {
      channel = new BroadcastChannel('session_sync');
      channel.onmessage = (event) => {
        if (event.data.type === 'logout') {
          safeLocalStorage.removeItem('sessionStart');
          safeLocalStorage.removeItem('lastActivity');
          router.push('/login?reason=logout');
          router.refresh();
        }
      };
    } catch (error) {
      // BroadcastChannel not supported (older browsers)
      console.warn('BroadcastChannel not supported:', error);
    }

    return () => {
      window.removeEventListener('storage', handleStorageChange);
      if (channel) {
        try {
          channel.close();
        } catch (error) {
          console.warn('Failed to close BroadcastChannel:', error);
        }
      }
    };
  }, [router]);
}
