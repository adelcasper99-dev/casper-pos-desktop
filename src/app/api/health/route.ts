import { NextResponse } from "next/server";

/**
 * Health check endpoint used by useNetworkStatus to confirm the local server
 * is reachable. Always returns 200 — this is a desktop (Electron) app and
 * the server is always localhost, so this should never fail unless the
 * Next.js process itself has crashed.
 */
export async function HEAD() {
    return new NextResponse(null, { status: 200 });
}

export async function GET() {
    return NextResponse.json({ status: "ok", timestamp: Date.now() });
}
