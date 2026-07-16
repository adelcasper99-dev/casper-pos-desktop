import { useState, useEffect, useRef } from 'react';
import { PRINTER_REGISTRY_KEY, type PrinterRegistry } from '@/types/printer-config';

export type BridgeConnectionState = 'checking' | 'no_ip' | 'offline' | 'online';

export interface BridgeStatus {
  state: BridgeConnectionState;
  version?: string;
  printerConfigured?: boolean;
}

export function useBridgeStatus() {
  const [status, setStatus] = useState<BridgeStatus>({ state: 'checking' });
  const [mounted, setMounted] = useState(false);
  const activeControllerRef = useRef<AbortController | null>(null);

  // Helper to extract IP address from local storage
  const getBridgeIp = (): string | null => {
    if (typeof window === 'undefined') return null;
    const stored = localStorage.getItem(PRINTER_REGISTRY_KEY);
    if (!stored) return null;
    try {
      const registry = JSON.parse(stored) as PrinterRegistry;
      return registry.bridgeIpAddress?.trim() || null;
    } catch {
      return null;
    }
  };

  // Helper to build bridge URL with correct protocol and port
  const getBridgeUrl = (ipAddress: string): string => {
    let ip = ipAddress.trim().replace(/\/$/, '');
    if (!ip.startsWith('http')) ip = `http://${ip}`;
    if ((ip.match(/:/g) || []).length === 1) {
      ip = `${ip}:4040`;
    }
    return ip;
  };

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!mounted) return;

    const checkStatus = async (ip: string) => {
      // Abort active fetches to prevent overlapping/stale responses
      if (activeControllerRef.current) {
        activeControllerRef.current.abort();
      }

      const controller = new AbortController();
      activeControllerRef.current = controller;

      const url = getBridgeUrl(ip);
      const timeoutId = setTimeout(() => controller.abort(), 3000);

      try {
        const res = await fetch(`${url}/api/status`, {
          signal: controller.signal,
          cache: 'no-store'
        });
        clearTimeout(timeoutId);

        if (res.ok) {
          const data = await res.json();
          setStatus({
            state: 'online',
            version: data.version || '1.0',
            printerConfigured: data.printerConfigured ?? false
          });
        } else {
          setStatus({ state: 'offline' });
        }
      } catch (err: any) {
        clearTimeout(timeoutId);
        if (err.name !== 'AbortError') {
          setStatus({ state: 'offline' });
        }
      }
    };

    const runCheck = () => {
      // If page is hidden, pause polling
      if (document.visibilityState === 'hidden') return;

      const ip = getBridgeIp();
      if (!ip) {
        setStatus({ state: 'no_ip' });
        return;
      }

      checkStatus(ip);
    };

    // Initial immediate check
    runCheck();

    // Set up polling (every 30 seconds to align with SyncWorker)
    const intervalId = setInterval(runCheck, 30000);

    // Visibility API listener
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        runCheck();
      }
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);

    // Watch local storage changes (if user updates IP in another tab/component)
    const handleStorageChange = (e: StorageEvent) => {
      if (e.key === PRINTER_REGISTRY_KEY) {
        runCheck();
      }
    };
    window.addEventListener('storage', handleStorageChange);

    // snappiness: ping when window gains focus
    window.addEventListener('focus', runCheck);

    return () => {
      clearInterval(intervalId);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('storage', handleStorageChange);
      window.removeEventListener('focus', runCheck);
      if (activeControllerRef.current) {
        activeControllerRef.current.abort();
      }
    };
  }, [mounted]);

  // Expose manual recheck method that returns status details
  const recheck = async (): Promise<BridgeStatus> => {
    const ip = getBridgeIp();
    if (!ip) {
      const nextStatus: BridgeStatus = { state: 'no_ip' };
      setStatus(nextStatus);
      return nextStatus;
    }

    setStatus(prev => ({ ...prev, state: 'checking' }));

    if (activeControllerRef.current) {
      activeControllerRef.current.abort();
    }

    const controller = new AbortController();
    activeControllerRef.current = controller;
    const url = getBridgeUrl(ip);
    const timeoutId = setTimeout(() => controller.abort(), 3000);

    try {
      const res = await fetch(`${url}/api/status`, {
        signal: controller.signal,
        cache: 'no-store'
      });
      clearTimeout(timeoutId);

      if (res.ok) {
        const data = await res.json();
        const nextStatus: BridgeStatus = {
          state: 'online',
          version: data.version || '1.0',
          printerConfigured: data.printerConfigured ?? false
        };
        setStatus(nextStatus);
        return nextStatus;
      } else {
        const nextStatus: BridgeStatus = { state: 'offline' };
        setStatus(nextStatus);
        return nextStatus;
      }
    } catch (err: any) {
      clearTimeout(timeoutId);
      const nextStatus: BridgeStatus = { state: 'offline' };
      setStatus(nextStatus);
      return nextStatus;
    }
  };

  return {
    ...status,
    recheck,
    isMounted: mounted
  };
}
