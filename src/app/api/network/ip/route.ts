import { NextResponse } from 'next/server';
import os from 'os';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

export async function GET() {
    try {
        // 1. Check if there is a manual static IP configured in the database settings features JSON
        try {
            const settings = await prisma.storeSettings.findFirst({});
            if (settings?.features) {
                const features = JSON.parse(settings.features);
                if (features.staticIp && typeof features.staticIp === 'string' && features.staticIp.trim() !== '') {
                    return NextResponse.json({ ip: features.staticIp.trim() });
                }
            }
        } catch (dbError) {
            console.error('Failed to read static IP from database settings, falling back to auto-detect:', dbError);
        }

        // 2. Perform refined automatic IP detection
        const interfaces = os.networkInterfaces();
        let localIp = '127.0.0.1';

        // Sort interfaces to prioritize physical adapters (Wi-Fi/Ethernet) and deprioritize virtual ones
        const sortedNames = Object.keys(interfaces).sort((a, b) => {
            const aLower = a.toLowerCase();
            const bLower = b.toLowerCase();
            
            const aIsVirtual = aLower.includes('virtual') || aLower.includes('vms') || aLower.includes('vmware') || 
                               aLower.includes('vethernet') || aLower.includes('tailscale') || aLower.includes('zerotier') || 
                               aLower.includes('vpn') || aLower.includes('wsl') || aLower.includes('loopback');
            const bIsVirtual = bLower.includes('virtual') || bLower.includes('vms') || bLower.includes('vmware') || 
                               bLower.includes('vethernet') || bLower.includes('tailscale') || bLower.includes('zerotier') || 
                               bLower.includes('vpn') || bLower.includes('wsl') || bLower.includes('loopback');
            
            if (aIsVirtual && !bIsVirtual) return 1;
            if (!aIsVirtual && bIsVirtual) return -1;
            
            const aIsWifiOrEth = aLower.includes('wi-fi') || aLower.includes('wifi') || aLower.includes('ethernet') || 
                                 aLower.includes('en') || aLower.includes('eth');
            const bIsWifiOrEth = bLower.includes('wi-fi') || bLower.includes('wifi') || bLower.includes('ethernet') || 
                                 bLower.includes('en') || bLower.includes('eth');
            
            if (aIsWifiOrEth && !bIsWifiOrEth) return -1;
            if (!aIsWifiOrEth && bIsWifiOrEth) return 1;
            
            return 0;
        });

        // Iterate over sorted network interfaces to find a valid external IPv4 address
        for (const name of sortedNames) {
            for (const iface of interfaces[name] || []) {
                // Skip internal (i.e. 127.0.0.1) and non-IPv4 addresses
                if (iface.family === 'IPv4' && !iface.internal) {
                    localIp = iface.address;
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
