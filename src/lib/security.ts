/**
 * Security utilities for session management
 */

/**
 * Generate a device fingerprint for session hijacking prevention
 * Uses browser characteristics to create a unique identifier
 * @param userAgent - User agent string
 * @returns Hash of device characteristics
 */
export function generateDeviceFingerprint(userAgent: string): string {
  // Simple hash function
  const hash = (str: string): number => {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32bit integer
    }
    return hash;
  };

  // Combine multiple factors
  const factors = [
    userAgent,
    // Screen resolution (if available)
    typeof window !== 'undefined' ? `${window.screen.width}x${window.screen.height}` : '',
    // Timezone
    typeof Intl !== 'undefined' ? Intl.DateTimeFormat().resolvedOptions().timeZone : '',
  ];

  const combined = factors.join('|');
  return hash(combined).toString(36);
}

/**
 * Validate device fingerprint matches session
 * @param currentFingerprint - Current device fingerprint
 * @param sessionFingerprint - Fingerprint stored in session
 * @returns true if fingerprints match
 */
export function validateDeviceFingerprint(
  currentFingerprint: string,
  sessionFingerprint?: string
): boolean {
  // If no session fingerprint, allow (backward compatibility)
  if (!sessionFingerprint) return true;
  
  return currentFingerprint === sessionFingerprint;
}
