import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { Decimal } from 'decimal.js';

/**
 * Sequential barcode generation with collision protection (Transactional version)
 */
async function getNextTicketNumberInsideTx(tx: any) {
    let attempts = 0;
    while (attempts < 5) {
        const lastTickets = await tx.ticket.findMany({
            where: { barcode: { startsWith: 'T-' } },
            orderBy: { createdAt: 'desc' },
            take: 20,
            select: { barcode: true }
        });

        let maxSeq = 0;
        for (const ticket of lastTickets) {
            const match = ticket.barcode.match(/^T-(\d+)$/);
            if (match) {
                const num = parseInt(match[1], 10);
                if (!isNaN(num) && num > maxSeq) maxSeq = num;
            }
        }

        const nextNum = maxSeq + 1;
        const candidate = `T-${nextNum.toString().padStart(3, '0')}`;

        const exists = await tx.ticket.findUnique({ where: { barcode: candidate } });
        if (!exists) return candidate;

        attempts++;
        await new Promise(r => setTimeout(r, Math.random() * 50));
    }
    return `T-F${Date.now().toString().slice(-6)}`;
}

export async function POST(request: NextRequest) {
    // 🛡️ Security Handshake
    const clientSecret = request.headers.get('x-sync-secret');
    if (process.env.SYNC_SECRET && clientSecret !== process.env.SYNC_SECRET) {
        return NextResponse.json({ success: false, error: 'Unauthorized sync attempt' }, { status: 401 });
    }

    let body: any = null;
    try {
        body = await request.json();
        const {
            id,
            idempotencyKey,
            customerName,
            customerPhone,
            customerEmail,
            deviceBrand,
            deviceModel,
            deviceImei,
            deviceColor,
            issueDescription,
            conditionNotes,
            securityCode,
            patternData,
            repairPrice = 0,
            branchId,
            shiftId,
            userId, 
            createdAt
        } = body;

        // ── Idempotency Guard ──────────────────────────────────────────────────
        if (idempotencyKey || id) {
            const existing = idempotencyKey 
                ? await prisma.ticket.findUnique({ where: { idempotencyKey } })
                : await prisma.ticket.findUnique({ where: { id } });

            if (existing) {
                return NextResponse.json({
                    success: true,
                    existing: true,
                    id: existing.id,
                    barcode: existing.barcode,
                    message: 'Ticket already processed',
                });
            }
        }

        if (!branchId || !customerPhone || !customerName) {
            return NextResponse.json(
                { success: false, error: 'Missing required fields' },
                { status: 400 }
            );
        }

        const dPrice = new Decimal(repairPrice);

        // ── Transaction ────────────────────────────────────────────────────────
        const ticket = await prisma.$transaction(async (tx) => {
            // 1. Barcode Generation
            const barcode = await getNextTicketNumberInsideTx(tx);

            // 2. Customer Handshake
            let customerId = undefined;
            if (customerPhone) {
                const existingCustomer = await tx.customer.findUnique({ where: { phone: customerPhone.trim() } });
                if (existingCustomer) {
                    customerId = existingCustomer.id;
                } else {
                    const newCustomer = await tx.customer.create({
                        data: { name: customerName, phone: customerPhone.trim(), balance: 0 }
                    });
                    customerId = newCustomer.id;
                }
            }

            // 3. Create Ticket
            const newTicket = await tx.ticket.create({
                data: {
                    ...(id ? { id } : {}),
                    barcode,
                    customerName,
                    customerPhone,
                    customerEmail: customerEmail || null,
                    customerId: customerId || null,
                    deviceBrand,
                    deviceModel,
                    deviceImei: deviceImei || null,
                    deviceColor: deviceColor || null,
                    issueDescription,
                    conditionNotes: conditionNotes || null,
                    securityCode: securityCode || null,
                    patternData: patternData || null,
                    status: 'NEW',
                    currentBranchId: branchId,
                    technicianId: userId || null,
                    initialQuote: dPrice.toString(),
                    repairPrice: dPrice.toString(),
                    shiftId: shiftId || null,
                    idempotencyKey: idempotencyKey ?? undefined,
                    createdAt: createdAt ? new Date(createdAt) : undefined,
                }
            });

            // 4. Log History
            await tx.ticketNote.create({
                data: {
                    ticketId: newTicket.id,
                    text: "Ticket created (Hardened Offline Sync)",
                    author: "SyncWorker",
                    isInternal: true
                }
            });

            // 5. Update Shift
            if (shiftId) {
                await tx.shift.update({
                    where: { id: shiftId },
                    data: { totalTickets: { increment: 1 }, lastHeartbeat: new Date() }
                });
            }

            return newTicket;
        }, { timeout: 30000 });

        return NextResponse.json({ success: true, id: ticket.id, barcode: ticket.barcode, existing: false });

    } catch (error: any) {
        if ((error.code === 'P2002' || error.code === 'P2028')) {
            const { idempotencyKey, id } = body || {};
            if (idempotencyKey || id) {
                let existing = await prisma.ticket.findUnique({ 
                    where: idempotencyKey ? { idempotencyKey } : { id } 
                });
                if (!existing) {
                    await new Promise(r => setTimeout(r, 100));
                    existing = await prisma.ticket.findUnique({ 
                        where: idempotencyKey ? { idempotencyKey } : { id } 
                    });
                }
                if (existing) {
                    return NextResponse.json({
                        success: true,
                        existing: true,
                        id: existing.id,
                        barcode: existing.barcode,
                        message: 'Ticket already processed (Recovered from race)',
                    });
                }
            }
        }
        console.error('[offline-ticket] failed:', error);
        return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }
}
