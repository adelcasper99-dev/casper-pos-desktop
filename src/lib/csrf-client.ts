/**
 * ✅ Client-side CSRF utilities
 * These functions are safe to use in "use client" components
 * as they do not import next/headers or other server-only modules.
 */

export async function generateCSRFToken(): Promise<string> {
    try {
        let response = await fetch('/api/csrf/generate', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            }
        });

        if (!response.ok) {
            response = await fetch('/api/csrf/generate', {
                method: 'GET'
            });
        }

        if (response.ok) {
            const data = await response.json();
            return data.token || '';
        }
    } catch (err) {
        console.warn('[CSRF] Token generation fetch failed, proceeding with fallback:', err);
    }
    return '';
}
