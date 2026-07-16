import { NextResponse } from 'next/server';

export async function POST(request: Request) {
    try {
        const body = await request.json();
        const { cloudUrl, syncSecret } = body;

        if (!cloudUrl || !syncSecret) {
            return NextResponse.json({ success: false, error: 'Missing cloudUrl or syncSecret' }, { status: 400 });
        }

        const normalizedUrl = cloudUrl.endsWith('/') ? cloudUrl.slice(0, -1) : cloudUrl;

        // Perform server-side fetch to bypass CORS
        const res = await fetch(`${normalizedUrl}/api/pos/branches`, {
            method: 'GET',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${syncSecret}`
            },
            cache: 'no-store'
        });

        const contentType = res.headers.get('content-type');
        let data;
        if (contentType && contentType.includes('application/json')) {
            data = await res.json();
        } else {
            const text = await res.text();
            console.error('[API] Proxy received non-JSON response:', text.substring(0, 100));
            return NextResponse.json({ 
                success: false, 
                error: `Server returned non-JSON response (${res.status}). The endpoint might not exist on the remote server yet.` 
            }, { status: res.status });
        }

        if (!res.ok) {
            return NextResponse.json({ success: false, error: data?.error || `HTTP Error ${res.status}` }, { status: res.status });
        }

        return NextResponse.json(data);
    } catch (error: any) {
        console.error('[API] Proxy /api/proxy/branches error:', error);
        return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }
}
