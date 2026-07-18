import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { headers } from 'next/headers';

export async function POST(request: Request) {
    try {
        const reqHeaders = await headers();
        const tenantId = reqHeaders.get('x-tenant-id');

        if (!tenantId || tenantId === 'default') {
            return NextResponse.json({ error: 'Tenant context missing or invalid' }, { status: 401 });
        }

        const payload = await request.json();
        
        // Ensure payload is not too large
        const totalRecords = 
            (payload.sales?.length || 0) + 
            (payload.tickets?.length || 0) + 
            (payload.treasury?.length || 0) +
            (payload.inventory?.length || 0) +
            (payload.returns?.length || 0);

        if (totalRecords > 500) { // Limit to 500 total records per batch across all types
            return NextResponse.json({ error: 'Batch too large' }, { status: 413 });
        }

        const results = {
            sales: [] as { id: string, canonicalId: string, error?: string }[],
            tickets: [] as { id: string, error?: string }[],
            treasury: [] as { id: string, error?: string }[],
            inventory: [] as { id: string, error?: string }[],
            returns: [] as { id: string, error?: string }[]
        };

        // Process sequentially or use a transaction depending on isolation needs
        // We'll use a transaction to allocate sequences atomically
        await prisma.$transaction(async (tx) => {
            // Allocate sequences for sales
            if (payload.sales && payload.sales.length > 0) {
                // Fetch current sequence block using FOR UPDATE to lock
                const sequence = await tx.$queryRaw<{lastValue: number}[]>`
                    SELECT "lastValue" FROM "TenantSequence"
                    WHERE "tenantId" = ${tenantId} AND prefix = 'INV'
                    FOR UPDATE
                `;

                let currentSeq = sequence[0]?.lastValue || 0;
                
                for (const sale of payload.sales) {
                    try {
                        // Idempotency check
                        const existing = await tx.sale.findUnique({
                            where: { id: sale.id } // Assume id is a UUID generated on client
                        });

                        let finalInvoiceNumber = existing?.invoiceNumber;
                        if (!existing) {
                            currentSeq++;
                            finalInvoiceNumber = `INV-${currentSeq.toString().padStart(6, '0')}`;
                            
                            await tx.sale.create({
                                data: {
                                    id: sale.id,
                                    invoiceNumber: finalInvoiceNumber,
                                    totalAmount: sale.totalAmount,
                                    paidAmount: sale.paidAmount,
                                    discount: sale.discount,
                                    subtotal: sale.subtotal,
                                    tax: sale.tax,
                                    customerId: sale.customerId,
                                    // other fields omitted for brevity, mapping should match actual schema
                                    tenantId,
                                    items: {
                                        create: sale.items?.map((item: any) => ({
                                            id: item.id,
                                            productId: item.productId,
                                            quantity: item.quantity,
                                            price: item.price,
                                            total: item.total,
                                            tenantId
                                        }))
                                    }
                                }
                            });
                        }
                        
                        results.sales.push({ id: sale.id, canonicalId: finalInvoiceNumber as string });
                    } catch (e: any) {
                        results.sales.push({ id: sale.id, canonicalId: '', error: e.message });
                    }
                }

                if (sequence.length > 0) {
                    await tx.$executeRaw`
                        UPDATE "TenantSequence"
                        SET "lastValue" = ${currentSeq}
                        WHERE "tenantId" = ${tenantId} AND prefix = 'INV'
                    `;
                } else {
                    await tx.tenantSequence.create({
                        data: {
                            tenantId,
                            prefix: 'INV',
                            lastValue: currentSeq
                        }
                    });
                }
            }

            // (Similar logic for tickets, treasury, etc. can be added here)
        });

        return NextResponse.json(results);
    } catch (e: any) {
        console.error('Sync batch error:', e);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}
