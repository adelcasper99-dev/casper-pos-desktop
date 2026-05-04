/**
 * ✅ Client-side CSRF utilities
 * These functions are safe to use in "use client" components
 * as they do not import next/headers or other server-only modules.
 */

export async function generateCSRFToken(): Promise<string> {
    // Call the API route to generate and set the cookie
    // ✅ PRODUCTION FIX: Use relative path (works in all environments)
    const response = await fetch('/api/csrf/generate', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        }
    });

    if (!response.ok) {
        throw new Error('Failed to generate CSRF token');
    }

    const data = await response.json();
    return data.token;
}
