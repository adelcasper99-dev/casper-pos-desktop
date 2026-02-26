/**
 * Rotate CSRF token (generate new one via API)
 * 
 * ✅ Client-Side Safe: Uses fetch, no server-only imports.
 * Call after sensitive operations or when token is missing.
 */
import { logger } from './logger';
export async function rotateCSRFToken(): Promise<string> {
    try {
        // ✅ PRODUCTION FIX: Use relative path (works in all environments)
        const response = await fetch('/api/csrf/generate', {
            method: 'POST',
            credentials: 'include',
            headers: {
                'Content-Type': 'application/json'
            }
        });

        if (!response.ok) {
            // Try getting error text
            const text = await response.text();
            throw new Error(`Failed to rotate CSRF token: ${response.status} ${text}`);
        }

        const data = await response.json();

        if (process.env.NODE_ENV === 'development') {
            logger.info('[CSRF] Token rotated successfully');
        }

        return data.token;
    } catch (error) {
        logger.error('[CSRF] Token rotation failed', error);
        throw error;
    }
}
