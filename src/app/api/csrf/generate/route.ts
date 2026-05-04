import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { logger } from '@/lib/logger';

const CSRF_COOKIE_NAME = 'csrf-token';

export async function POST() {
    try {
        const cookieStore = await cookies();
        let token = cookieStore.get(CSRF_COOKIE_NAME)?.value;

        // If no token exists in cookies, generate one (fallback if middleware missed it)
        if (!token) {
            token = crypto.randomUUID();
            
            // Set cookie on response
            const response = NextResponse.json({ success: true, token });
            response.cookies.set({
                name: CSRF_COOKIE_NAME,
                value: token,
                httpOnly: true,
                secure: process.env.NODE_ENV === 'production',
                sameSite: 'lax',
                path: '/',
            });
            return response;
        }

        return NextResponse.json({ success: true, token });
    } catch (error) {
        logger.error('[CSRF API] Failed to handle token request', error);
        return NextResponse.json(
            { success: false, error: 'Internal Server Error' },
            { status: 500 }
        );
    }
}
