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
        // Append to existing Cookie header or create new
        const cookieHeader = requestHeaders.get('cookie') || '';
        requestHeaders.set('cookie', `${cookieHeader}; csrf-token=${newToken}`);

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

    // Define public routes that don't require auth
    const isPublicRoute = path === '/login' || path === '/setup' || path.startsWith('/assets') || path.startsWith('/_next');

    // If no session and trying to access a protected route
    if (!sessionToken && !isPublicRoute) {
        return NextResponse.redirect(new URL('/login', request.url));
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
         * Match all request paths except for the ones starting with:
         * - api (API routes)
         * - _next/static (static files)
         * - _next/image (image optimization files)
         * - favicon.ico (favicon file)
         */
        '/((?!api|_next/static|_next/image|favicon.ico).*)',
    ],
};
