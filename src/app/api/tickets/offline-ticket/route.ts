import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { Decimal } from 'decimal.js';

import { getFormattedTicketNumber } from '@/lib/id-generator';

/**
 * Sequential barcode generation with atomic protection
 */
async function getNextTicketNumberInsideTx(tx: any, branchId?: string) {
    let branchCode = '';
    if (branchId) {
        const branch = await tx.branch.findUnique({
            where: { id: branchId },
            select: { code: true }
        });
        branchCode = branch?.code || '';
    }

    return await getFormattedTicketNumber(branchCode, tx);
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
            const barcode = await getNextTicketNumberInsideTx(tx, branchId);

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
