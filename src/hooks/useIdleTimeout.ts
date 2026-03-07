'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';

const IDLE_TIMEOUT = 15 * 60 * 1000; // 15 minutes (PCI-DSS compliant)
const WARNING_THRESHOLD = 12 * 60 * 1000; // 12 minutes - warn 3 min before logout
const CHECK_INTERVAL = 60 * 1000; // Check every minute
const DEBOUNCE_DELAY = 2000; // Update activity max once per 2 seconds

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
};

export function useIdleTimeout() {
  const router = useRouter();
  const lastActivityRef = useRef(Date.now());
  const debounceTimerRef = useRef<NodeJS.Timeout | null>(null);
  const [showWarning, setShowWarning] = useState(false);
  const [timeRemaining, setTimeRemaining] = useState(0);

  const extendSession = () => {
    const now = Date.now();
    lastActivityRef.current = now;
    safeLocalStorage.setItem('lastActivity', now.toString());
    setShowWarning(false);
    setTimeRemaining(0);
  };

  const dismissWarning = () => {
    setShowWarning(false);
  };

  useEffect(() => {
    // Debounced activity updater (prevents excessive writes)
    const updateActivity = () => {
      // Clear existing debounce timer
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }

      // Set new timer - only update after DEBOUNCE_DELAY of inactivity
      debounceTimerRef.current = setTimeout(() => {
        const now = Date.now();
        lastActivityRef.current = now;
        safeLocalStorage.setItem('lastActivity', now.toString());

        // Clear warning if user becomes active
        if (showWarning) {
          setShowWarning(false);
        }
      }, DEBOUNCE_DELAY);
    };

    // Track user activity with passive listeners (better performance)
    const events = ['mousedown', 'keydown', 'scroll', 'touchstart'] as const;

    events.forEach(event => {
      window.addEventListener(event, updateActivity, { passive: true });
    });

    // Check for idle timeout periodically
    const interval = setInterval(async () => {
      const lastActivity = parseInt(
        safeLocalStorage.getItem('lastActivity') || '0'
      );
      const idle = Date.now() - lastActivity;
      const remaining = IDLE_TIMEOUT - idle;

      setTimeRemaining(remaining);

      // Show warning at 12 minutes (3 min before logout)
      if (idle > WARNING_THRESHOLD && idle < IDLE_TIMEOUT && !showWarning) {
        setShowWarning(true);
      }

      if (idle > IDLE_TIMEOUT) {
        try {
          // Check for open shift before logging out
          const shiftCheck = await fetch('/api/shift/status', {
            method: 'GET',
            cache: 'no-store'
          });

          if (shiftCheck.ok) {
            const { hasOpenShift } = await shiftCheck.json();

            if (hasOpenShift) {
              // User has open shift - show warning but don't force logout
              toast.warning('You have an open shift. Please close your shift before the session expires.', { duration: 10000 });
              // Reset timer to give them time to close shift
              const now = Date.now();
              lastActivityRef.current = now;
              safeLocalStorage.setItem('lastActivity', now.toString());
              setShowWarning(false);
              return;
            }
          }

          // Log idle timeout for audit trail
          try {
            await fetch('/api/auth/log-idle', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ idleMinutes: 15 })
            });
          } catch (logError) {
            console.error('Failed to log idle timeout:', logError);
          }

          // User idle for too long - force logout
          safeLocalStorage.setItem('sessionInvalidated', 'true');

          // Clean up
          safeLocalStorage.setItem('lastActivity', '0');

          router.push('/login?reason=idle');
        } catch (error) {
          console.error('Error during idle timeout:', error);
          // Fallback: logout anyway
          safeLocalStorage.setItem('sessionInvalidated', 'true');
          safeLocalStorage.setItem('lastActivity', '0');
          router.push('/login?reason=idle');
        }
      }
    }, CHECK_INTERVAL);

    // Initialize activity timestamp
    const now = Date.now();
    lastActivityRef.current = now;
    safeLocalStorage.setItem('lastActivity', now.toString());

    return () => {
      // Cleanup
      events.forEach(event => {
        window.removeEventListener(event, updateActivity);
      });

      clearInterval(interval);

      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
    };
  }, [router, showWarning]);

  return {
    showWarning,
    timeRemaining,
    extendSession,
    dismissWarning
  };
}

