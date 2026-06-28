import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export function middleware(request: NextRequest) {
    const response = NextResponse.next();

    // Check for CSRF token in cookies
    const csrfToken = request.cookies.get('csrf-token')?.value;

    // If no token exists, generate one and set it
    if (!csrfToken) {
        const newToken = crypto.randomUUID();

        // Clone request headers to append the new cookie
        const requestHeaders = new Headers(request.headers);
        const cookieHeader = requestHeaders.get('cookie');
        
        // SEC-V09: Fix leading semicolon bug in manual cookie injection
        const updatedCookieHeader = cookieHeader 
            ? `${cookieHeader}; csrf-token=${newToken}`
            : `csrf-token=${newToken}`;
        
        requestHeaders.set('cookie', updatedCookieHeader);

        // Create response with modified request headers so Server Components see the cookie
        const response = NextResponse.next({
            request: {
                headers: requestHeaders,
            },
        });

        // Set cookie on the response for the client browser
        // V-02 fix: httpOnly:true prevents JS from reading the CSRF token directly.
        // Clients should read the token from the X-CSRF-Token response header instead.
        response.cookies.set({
            name: 'csrf-token',
            value: newToken,
            httpOnly: true,  // ✅ V-02 fix: was false — JS must NOT access this cookie
            secure: false, // Force false for Electron local protocol
            sameSite: 'lax', // Use lax instead of strict for local Electron protocols
            path: '/',
        });

        // Expose token in header so client-side reads it from fetch response header
        response.headers.set('X-CSRF-Token', newToken);

        return response;
    }

    // --- Session Verification ---
    const sessionToken = request.cookies.get('session')?.value;
    const path = request.nextUrl.pathname;

    if (process.env.NODE_ENV === 'development') {
        console.log(`[Middleware] Path: ${path} | Session: ${sessionToken ? 'Present' : 'MISSING'} | CSRF: ${csrfToken ? 'Present' : 'MISSING'}`);
    }

    // Define public routes that don't require session auth
    const publicRoutes = ['/login', '/setup', '/network-setup'];
    const publicApiPrefixes = ['/assets', '/_next'];
    
    // Explicit public API whitelist (Hardened: only allow known-safe endpoints with their own auth)
    const publicApiWhitelist = [
        '/api/tickets/offline-ticket', // Uses x-sync-secret auth
        '/api/pos/offline-sale',        // Uses x-sync-secret auth
        '/api/auth/session',            // Next-auth session endpoint
        '/api/auth/signin',
        '/api/auth/callback',
        '/api/auth/logout'
    ];

    const isPublic = publicRoutes.includes(path) || 
                     publicApiPrefixes.some(pref => path.startsWith(pref)) ||
                     publicApiWhitelist.includes(path) ||
                     path.startsWith('/c/');

    // If no session and trying to access a protected route
    if (!sessionToken && !isPublic) {
        return NextResponse.redirect(new URL('/login', request.url));
    }

    // Node Role Enforcement: Redirect to /network-setup if node is not configured
    const isPublicAsset = publicApiPrefixes.some(pref => path.startsWith(pref));
    const nodeRole = process.env.NODE_ROLE || request.cookies.get('nodeRole')?.value;
    if ((!nodeRole || nodeRole === 'UNCONFIGURED') && path !== '/network-setup' && !isPublicAsset) {
        return NextResponse.redirect(new URL('/network-setup', request.url));
    }

    // If session exists and trying to access the root path, send to dashboard
    if (sessionToken && path === '/') {
        return NextResponse.redirect(new URL('/dashboard', request.url));
    }

    // If no session and trying to access root, send to login
    if (!sessionToken && path === '/') {
        return NextResponse.redirect(new URL('/login', request.url));
    }

    return response;
}

export const config = {
    matcher: [
        /*
         * Match all request paths except for:
         * - static files (favicon.ico)
         */
        '/((?!favicon.ico).*)',
    ],
};
