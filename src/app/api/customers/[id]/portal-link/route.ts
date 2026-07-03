import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getOrGeneratePortalToken } from '@/actions/customer-actions';
import { getCurrentUser } from '@/actions/auth';

export const dynamic = 'force-dynamic';

export async function GET(request: Request, { params }: { params: { id: string } }) {
    try {
        // Must be authenticated to generate a link for a customer
        const user = await getCurrentUser();
        if (!user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const customerId = params.id;
        const result = await getOrGeneratePortalToken(customerId);

        if (!result.success || !result.token) {
            return NextResponse.json({ error: result.error || 'Failed to generate token' }, { status: 400 });
        }

        // Determine Base URL
        // In Desktop/Offline mode, we use localtunnel if it's running
        // But since we can't easily ask the Electron main process synchronously from a server action without IPC,
        // The easiest way is to let the client-side UI ask Electron for the `tunnel:status` (if running in Electron),
        // OR we can just return the local server address and let the frontend format it.
        // Wait, the Next.js server doesn't know the tunnel URL directly unless Electron passes it to an environment variable.
        // Actually, if we return the relative path `/c/${token}`, the client can prepend its own domain,
        // or if in Electron, it can prepend the Tunnel URL.
        
        return NextResponse.json({
            success: true,
            token: result.token,
            path: `/c/${result.token}`
        });

    } catch (error: any) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
