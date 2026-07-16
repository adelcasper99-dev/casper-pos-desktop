import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export function middleware(request: NextRequest) {
    // 1. Resolve tenant context from Subdomain, custom header, or cookie
    const host = request.headers.get('host') || '';
    const parts = host.split('.');
    const subdomain = parts.length > 2 ? parts[0] : null;
    
    // Ignore common system subdomains
    const isSystemSubdomain = !subdomain || ['www', 'api', 'localhost', '127', 'admin'].includes(subdomain.toLowerCase());
    
    let tenantId = request.headers.get('x-tenant-id') || request.cookies.get('tenantId')?.value;
    
    if (!tenantId && !isSystemSubdomain) {
        tenantId = subdomain;
    }
    
    // Fallback to default tenant if not resolved
    if (!tenantId) {
        tenantId = 'default';
    }

    // Initialize request headers
    const requestHeaders = new Headers(request.headers);
    requestHeaders.set('x-tenant-id', tenantId);

    // Check for CSRF token in cookies
    const csrfToken = request.cookies.get('csrf-token')?.value;
    let csrfTokenValue = csrfToken;

    // If no token exists, generate one
    if (!csrfToken) {
        csrfTokenValue = crypto.randomUUID();
        const cookieHeader = requestHeaders.get('cookie');
        
        // SEC-V09: Fix leading semicolon bug in manual cookie injection
        const updatedCookieHeader = cookieHeader 
            ? `${cookieHeader}; csrf-token=${csrfTokenValue}`
            : `csrf-token=${csrfTokenValue}`;
        
        requestHeaders.set('cookie', updatedCookieHeader);
    }

    // Create response with modified request headers so Server Components see them
    const response = NextResponse.next({
        request: {
            headers: requestHeaders,
        },
    });

    // Set CSRF cookie on the response if it was newly generated
    if (!csrfToken && csrfTokenValue) {
        response.cookies.set({
            name: 'csrf-token',
            value: csrfTokenValue,
            httpOnly: true,
            secure: false, // Force false for Electron local protocol
            sameSite: 'lax',
            path: '/',
        });
        response.headers.set('X-CSRF-Token', csrfTokenValue);
    }

    // Pass the resolved tenant ID back to the client in response headers for verification
    response.headers.set('X-Tenant-ID', tenantId);

    // --- Session Verification ---
    const sessionToken = request.cookies.get('session')?.value;
    const path = request.nextUrl.pathname;

    if (process.env.NODE_ENV === 'development') {
        console.log(`[Middleware] Path: ${path} | Tenant: ${tenantId} | Session: ${sessionToken ? 'Present' : 'MISSING'}`);
    }

    // Define public routes that don't require session auth
    const publicRoutes = ['/login', '/setup', '/network-setup', '/onboarding', '/onboarding/create-admin'];
    const publicApiPrefixes = ['/assets', '/_next'];
    
    // Explicit public API whitelist (Hardened: only allow known-safe endpoints with their own auth)
    const publicApiWhitelist = [
        '/api/tickets/offline-ticket', // Uses x-sync-secret auth
        '/api/pos/offline-sale',        // Uses x-sync-secret auth
        '/api/auth/session',            // Next-auth session endpoint
        '/api/auth/signin',
        '/api/auth/callback',
        '/api/auth/logout',
        '/api/license/trial',
        '/api/license/staff-verify'
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
    const isCustomerPortal = path.startsWith('/c/');
    const nodeRole = process.env.NODE_ROLE || request.cookies.get('nodeRole')?.value;
    if ((!nodeRole || nodeRole === 'UNCONFIGURED') && path !== '/network-setup' && !isPublicAsset && !isCustomerPortal) {
        return NextResponse.redirect(new URL('/network-setup', request.url));
    }

    // If session exists, we DO NOT redirect here to avoid infinite loops if the session is invalid in DB.
    // The redirect logic has been moved to the respective route handlers (/login/layout.tsx and /page.tsx).

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

