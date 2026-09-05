import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { decodeJwt } from 'jose';

// Lightweight pure-JS Punycode decoder for Next.js Edge Runtime
function punycodeToUnicode(domain: string): string {
    if (!domain.startsWith('xn--')) return domain;
    try {
        const punycode = domain.substring(4).toLowerCase();
        let n = 128, i = 0, bias = 72;
        let output: number[] = [];
        let delim = punycode.lastIndexOf('-');
        if (delim > 0) {
            for (let j = 0; j < delim; j++) {
                output.push(punycode.charCodeAt(j));
            }
            delim++;
        } else {
            delim = 0;
        }
        while (delim < punycode.length) {
            let oldi = i, w = 1, k = 36;
            for (;; k += 36) {
                if (delim >= punycode.length) break;
                let digit = punycode.charCodeAt(delim++);
                digit = digit - 48 < 10 ? digit - 22 : digit - 65 < 26 ? digit - 65 : digit - 97 < 26 ? digit - 97 : 36;
                i += digit * w;
                let t = k <= bias ? 1 : k >= bias + 26 ? 26 : k - bias;
                if (digit < t) break;
                w *= 36 - t;
            }
            let outLen = output.length + 1;
            let delta = i - oldi;
            delta = Math.floor(delta / (oldi === 0 ? 700 : 2));
            delta += Math.floor(delta / outLen);
            let damp = 0;
            while (delta > 455) {
                delta = Math.floor(delta / 35);
                damp += 36;
            }
            bias = Math.floor(damp + (36 * delta) / (delta + 38));
            n += Math.floor(i / outLen);
            i %= outLen;
            output.splice(i++, 0, n);
        }
        return String.fromCodePoint(...output);
    } catch (e) {
        return domain;
    }
}

export function middleware(request: NextRequest) {
    const host = request.headers.get('host') || request.nextUrl.host || '';
    const parts = host.split('.');
    const rawSubdomain = parts.length > 2 ? parts[0] : null;
    const subdomain = rawSubdomain ? punycodeToUnicode(rawSubdomain) : null;
    const path = request.nextUrl.pathname;

    const isHqDomain = subdomain === 'hq' || subdomain === 'admin' || subdomain === 'casper-hq';
    const sessionToken = request.cookies.get('session')?.value;
    const terminalSetupRoutes = ['/onboarding', '/setup', '/network-setup'];

    // 1. Block regular tenants from accessing HQ control plane
    if (!isHqDomain && path.startsWith('/casper-hq')) {
        return new NextResponse(
            JSON.stringify({ error: '403 Forbidden', message: 'غير مصرح لك بالدخول إلى هذه الصفحة.' }),
            { status: 403, headers: { 'content-type': 'application/json' } }
        );
    }

    // 2. Block Terminal Setup Pages on HQ Subdomain
    if (isHqDomain && terminalSetupRoutes.some(r => path.startsWith(r))) {
        const destination = sessionToken ? '/casper-hq' : '/login';
        return NextResponse.redirect(new URL(destination, request.url));
    }

    // Ignore common system subdomains
    const isSystemSubdomain = !subdomain || ['www', 'api', 'app', 'cloud', 'pos', 'localhost', '127', 'admin', 'hq', 'casper-hq'].includes(subdomain.toLowerCase());
    
    let tenantId = request.headers.get('x-tenant-id') || request.cookies.get('tenantId')?.value;
    
    // Extract tenantId from JWT for Desktop API requests
    const authHeader = request.headers.get('authorization');
    if (authHeader?.startsWith('Bearer ')) {
        const token = authHeader.substring(7);
        try {
            const decoded = decodeJwt(token);
            if (decoded && decoded.tenantId) {
                tenantId = String(decoded.tenantId);
            }
        } catch (e) {
            // Ignore decode errors here; full validation happens in the route handler
        }
    }
    
    // Resolve tenant context with Punycode IDN conversion
    if (isHqDomain) {
        tenantId = 'SYSTEM';
    } else if (!tenantId && !isSystemSubdomain && subdomain) {
        try {
            const decoded = decodeURIComponent(subdomain);
            tenantId = punycodeToUnicode(decoded);
        } catch (e) {
            tenantId = punycodeToUnicode(subdomain);
        }
    }
    
    // Fallback to default tenant if not resolved
    if (!tenantId) {
        tenantId = 'default';
    }

    // Initialize request headers (SEC: Header values must be ByteStrings / ASCII)
    const requestHeaders = new Headers(request.headers);
    try {
        requestHeaders.set('x-tenant-id', encodeURIComponent(tenantId));
    } catch (e) {
        requestHeaders.set('x-tenant-id', tenantId);
    }

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

    // Define public routes that don't require session auth
    const publicRoutes = ['/login', '/signup', '/setup', '/network-setup', '/onboarding', '/onboarding/create-admin'];
    const publicApiPrefixes = ['/assets', '/_next'];
    
    // Explicit public API whitelist (Hardened: only allow known-safe endpoints with their own auth)
    const publicApiWhitelist = [
        '/api/auth/send-otp',
        '/api/auth/verify-otp',
        '/api/auth/signup',
        '/api/tenant/check-slug',
        '/api/telegram/webhook',        // Telegram Bot Webhook endpoint
        '/api/tickets/offline-ticket', // Uses x-sync-secret auth
        '/api/pos/offline-sale',        // Uses x-sync-secret auth
        '/api/auth/session',            // Next-auth session endpoint
        '/api/auth/signin',
        '/api/auth/callback',
        '/api/auth/logout',
        '/api/license/trial',
        '/api/license/staff-verify'
    ];

    const isTerminalSetupRoute = terminalSetupRoutes.some(r => path.startsWith(r));
    const isPublic = publicRoutes.includes(path) || 
                     publicApiPrefixes.some(pref => path.startsWith(pref)) ||
                     publicApiWhitelist.includes(path) ||
                     path.startsWith('/c/');

    // Terminal setup routes are client-node specific and NOT shared on HQ domain
    const isSharedRoute = (isPublic && (!isHqDomain || !isTerminalSetupRoute)) || 
                         path.startsWith('/api') || 
                         path.startsWith('/_next') || 
                         path.startsWith('/assets') || 
                         path === '/favicon.ico';

    // Early session guard: HQ domain requires authentication for all non-public paths
    if (isHqDomain && !sessionToken && path !== '/login' && !path.startsWith('/api') && !path.startsWith('/_next') && !path.startsWith('/assets')) {
        return NextResponse.redirect(new URL('/login', request.url));
    }

    // Create response. Rewrite ALL HQ domain requests to /casper-hq root
    // (HQ control plane is a single page — no sub-routes like /casper-hq/dashboard exist)
    let response: NextResponse;
    if (isHqDomain && !isSharedRoute && !path.startsWith('/casper-hq')) {
        const rewriteUrl = new URL('/casper-hq', request.url);
        response = NextResponse.rewrite(rewriteUrl, {
            request: {
                headers: requestHeaders,
            },
        });
    } else {
        response = NextResponse.next({
            request: {
                headers: requestHeaders,
            },
        });
    }

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

    // Pass the resolved tenant ID back to the client in response headers for verification (ASCII Safe)
    try {
        response.headers.set('X-Tenant-ID', encodeURIComponent(tenantId));
    } catch (e) {
        response.headers.set('X-Tenant-ID', tenantId);
    }

    if (process.env.NODE_ENV === 'development') {
        console.log(`[Middleware] Path: ${path} | Tenant: ${tenantId} | Session: ${sessionToken ? 'Present' : 'MISSING'}`);
    }

    // If no session and trying to access a protected route
    if (!sessionToken && !isPublic) {
        return NextResponse.redirect(new URL('/login', request.url));
    }

    // Node Role Enforcement: Redirect to /network-setup if node is not configured (client nodes only, bypass on HQ)
    // Cloud tenant subdomains are never desktop terminals — skip NODE_ROLE check
    const isCloudTenant = !isSystemSubdomain && subdomain && subdomain !== 'hq' && subdomain !== 'admin';
    const isPublicAsset = publicApiPrefixes.some(pref => path.startsWith(pref));
    const isCustomerPortal = path.startsWith('/c/');
    const nodeRole = process.env.NODE_ROLE || request.cookies.get('nodeRole')?.value;
    if (!isHqDomain && !isCloudTenant && (!nodeRole || nodeRole === 'UNCONFIGURED') && path !== '/network-setup' && !isPublicAsset && !isCustomerPortal) {
        return NextResponse.redirect(new URL('/network-setup', request.url));
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
         * - _next/static (static files)
         * - _next/image (image optimization files)
         * - favicon.ico (favicon file)
         * - images, fonts, and static media files
         */
        '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|woff|woff2|ttf|eot)$).*)',
    ],
};

