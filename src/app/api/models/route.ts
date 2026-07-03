import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function GET(request: NextRequest) {
    const searchParams = request.nextUrl.searchParams;
    const q = searchParams.get('q') || '';
    const categoryId = searchParams.get('categoryId');

    try {
        const where: any = {};
        if (q) {
            where.name = { contains: q };
        }
        if (categoryId) {
            where.categoryId = categoryId;
        }

        const models = await prisma.model.findMany({
            where,
            orderBy: { name: 'asc' },
            take: 50,
        });

        return NextResponse.json({ success: true, data: models });
    } catch (error: any) {
        return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }
}
