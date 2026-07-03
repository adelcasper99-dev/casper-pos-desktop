import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function GET(request: NextRequest) {
    const searchParams = request.nextUrl.searchParams;
    const q = searchParams.get('q') || '';
    
    try {
        const where: any = {};
        if (q) {
            where.name = { contains: q };
        }

        const categories = await prisma.category.findMany({
            where,
            orderBy: { name: 'asc' },
            take: 50,
        });

        return NextResponse.json({ success: true, data: categories });
    } catch (error: any) {
        return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }
}
