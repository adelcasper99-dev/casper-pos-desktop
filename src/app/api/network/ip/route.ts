import { NextResponse } from 'next/server';
import os from 'os';

export const dynamic = 'force-dynamic';

export async function GET() {
    try {
        const interfaces = os.networkInterfaces();
        let localIp = '127.0.0.1';

        // Iterate over network interfaces to find a valid IPv4 address
        for (const name of Object.keys(interfaces)) {
            for (const iface of interfaces[name] || []) {
                // Skip internal (i.e. 127.0.0.1) and non-IPv4 addresses
                if (iface.family === 'IPv4' && !iface.internal) {
                    localIp = iface.address;
                    // We break on the first valid external IPv4 we find
                    break;
                }
            }
            if (localIp !== '127.0.0.1') break;
        }

        return NextResponse.json({ ip: localIp });
    } catch (error) {
        console.error('Failed to get local IP', error);
        return NextResponse.json({ ip: '127.0.0.1' }, { status: 500 });
    }
}
