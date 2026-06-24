import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function GET(request: Request) {
    try {
        const authHeader = request.headers.get('authorization');
        const token = authHeader?.split(' ')[1];
        
        const expectedSecret = process.env.NEXT_PUBLIC_SYNC_SECRET;
        
        if (!expectedSecret || token !== expectedSecret) {
            return NextResponse.json({ success: false, error: 'Unauthorized sync secret' }, { status: 401 });
        }

        const branches = await prisma.branch.findMany({
            select: { id: true, name: true, code: true },
            where: { deletedAt: null }
        });

        return NextResponse.json({ success: true, branches });
    } catch (error: any) {
        console.error('[API] /api/pos/branches error:', error);
        return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }
}
