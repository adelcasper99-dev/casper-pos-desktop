import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

// Helper to handle BigInt serialization
const serializeBigInt = (obj: any): any => {
    return JSON.parse(JSON.stringify(obj, (key, value) =>
        typeof value === 'bigint' ? value.toString() : value
    ));
};

export async function GET() {
    try {
        const warehouses = await prisma.warehouse.findMany({
            include: {
                branch: true,
                _count: {
                    select: {
                        stocks: true,
                        purchases: true,
                        sales: true,
                        movementsFrom: true,
                        movementsTo: true
                    }
                }
            }
        });
        return NextResponse.json(serializeBigInt(warehouses));
    } catch (e: any) {
        return NextResponse.json({ error: String(e.message), stack: e.stack }, { status: 500 });
    }
}
