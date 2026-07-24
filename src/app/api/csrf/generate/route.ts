import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { logger } from '@/lib/logger';

const CSRF_COOKIE_NAME = 'csrf-token';

async function handleCSRF() {
    try {
        const cookieStore = await cookies();
        let token = cookieStore.get(CSRF_COOKIE_NAME)?.value;

        // Always ensure a valid token is present
        if (!token) {
            token = crypto.randomUUID();
        }

        const response = NextResponse.json({ success: true, token });
        
        // Ensure cookie is set/refreshed on response
        response.cookies.set({
            name: CSRF_COOKIE_NAME,
            value: token,
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            sameSite: 'lax',
            path: '/',
        });

        return response;
    } catch (error) {
        logger.error('[CSRF API] Failed to handle token request', error);
        return NextResponse.json(
            { success: false, error: 'Internal Server Error' },
            { status: 500 }
        );
    }
}

export async function GET() {
    return handleCSRF();
}

export async function POST() {
    return handleCSRF();
}
