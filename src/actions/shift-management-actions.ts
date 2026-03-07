"use server";

/**
 * AUDIT TRAIL POLICY: This file performs sensitive financial/inventory operations.
 * All mutations MUST be accompanied by an AuditLog entry.
 * AuditLog is APPEND-ONLY and must not be deleted or modified.
 */

import { prisma } from "@/lib/prisma";
import { Prisma } from "@prisma/client";
import { revalidatePath, revalidateTag } from "next/cache"
import { z } from "zod";
import { getCurrentUser } from "./auth";
import { secureAction } from "@/lib/safe-action";
import { getTranslations } from "@/lib/i18n-mock";
import { AccountingEngine } from "@/lib/accounting/transaction-factory";

import { Decimal } from "@prisma/client/runtime/library";
import { serialize } from "@/lib/serialization";

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Get current timezone based on branch settings
 * Default to UTC if branch timezone not set
 */
async function getBranchTimezone(userId?: string): Promise<string> {
    // 🛡️ PRODUCTION TODO: In multi-branch deployment, fetch timezone from Branch model.
    // For local desktop deployments, typically system timezone is used.
    if (userId) {
        const user = await prisma.user.findUnique({
            where: { id: userId },
        });
        // Add branch-specific timezone lookup here if needed.
    }

    const settings = await prisma.storeSettings.findUnique({
        where: { id: "settings" }
    });

    return (settings as any)?.timezone || "UTC";
}

/**
 * Format business date (YYYY-MM-DD) in local timezone
 */
function getBusinessDate(timezone: string = "UTC"): string {
    const now = new Date();
    // For now, use simple ISO date. In production, use timezone library like date-fns-tz
    return now.toISOString().split('T')[0];
}

// ============================================================================
// CORE SHIFT OPERATIONS
// ============================================================================

/**
 * Open a new shift
 * Validates that no other shift is open for this user on this register
 */
export const openShift = secureAction(async (data: {
    startCash?: number;
    userId?: string;
    registerId?: string;
    registerName?: string;
    csrfToken?: string; // For CSRF validation
}) => {
    const currentUser = await getCurrentUser();
    const userId = data.userId || currentUser?.id;

    const t = await getTranslations('SystemMessages.Errors');

    if (!userId) {
        throw new Error(t('unauthorized'));
    }

    // Super Admin Backdoor Handling: Find the proxied admin user
    let checkUserId = userId;
    if (userId === 'super-admin') {
        const fallbackAdmin = await prisma.user.findFirst({
            where: { roleStr: 'ADMIN' }
        }) || await prisma.user.findFirst();
        if (fallbackAdmin) checkUserId = fallbackAdmin.id;
    }

    // Check for existing open shift for this user
    const existingShift = await prisma.shift.findFirst({
        where: {
            userId: checkUserId,
            status: "OPEN",
            registerId: data.registerId || null
        }
    });

    if (existingShift) {
        throw new Error(t('shiftOpenError'));
    }

    // Get timezone and business date
    const timezone = await getBranchTimezone(userId);
    const businessDate = getBusinessDate(timezone);

    // Get cashier name
    const user = await prisma.user.findUnique({ where: { id: userId } });

    // Super Admin Backdoor Handling: Find a real admin user to bind the shift to
    let actualUserId = userId;
    let actualCashierName = user?.name || user?.username;

    if (userId === 'super-admin') {
        const fallbackAdmin = await prisma.user.findFirst({
            where: { roleStr: 'ADMIN' }
        }) || await prisma.user.findFirst();

        if (fallbackAdmin) {
            actualUserId = fallbackAdmin.id;
            actualCashierName = `Super Admin (via ${fallbackAdmin.name || fallbackAdmin.username})`;
        } else {
            throw new Error("No database users found to bind the shift to.");
        }
    }

    const shift = await prisma.shift.create({
        data: {
            userId: actualUserId,
            registerId: data.registerId,
            registerName: data.registerName,
            startCash: new Decimal(data.startCash ?? 0),
            cashierName: actualCashierName,
            timezone,
            businessDate,
            status: "OPEN"
        }
    });

    revalidatePath("/pos");
    revalidatePath("/");

    return serialize({
        success: true,
        shift: shift,
        message: `Shift opened successfully with $${data.startCash ?? 0} starting cash`
    });
}, { permission: "SHIFT_MANAGE", requireCSRF: true });

/**
 * Close an existing shift
 * Calculates expected cash and variance
 * Aggregates all payment method totals from linked transactions
 */
export const closeShift = secureAction(async (data: {
    shiftId: string;
    actualCash: number;
    notes?: string;
    safeDropAmount?: number;
    safeDropTreasuryId?: string;
    csrfToken?: string; // For CSRF validation
}) => {
    const shift = await prisma.shift.findUnique({
        where: { id: data.shiftId },
        include: {
            sales: {
                include: { payments: true }
            },
            expenses: true,
            // Fetch REFUND transactions to subtract cash refunds from expectedCash
            transactions: {
                where: {
                    type: 'REFUND',
                    paymentMethod: 'CASH',
                    deletedAt: null
                }
            }
        }
    });

    const t = await getTranslations('SystemMessages.Errors');

    if (!shift) {
        throw new Error(t('notFound'));
    }

    if (shift.status !== "OPEN") {
        throw new Error(t('shiftCloseError', { status: shift.status }));
    }


    // ✅ CRITICAL FIX: Use ACCUMULATED values (tracked in real-time)
    // DO NOT recalculate from shift.sales.payments - causes data loss!
    // These values are incremented with every sale/payment during the shift
    const totalCashSales = shift.totalCashSales;
    const totalCardSales = shift.totalCardSales;
    const totalWalletSales = shift.totalWalletSales;
    const totalInstapay = shift.totalInstapay;
    // @ts-ignore
    const totalAccountSales = shift.totalAccountSales || new Decimal(0);
    // @ts-ignore
    const totalCashRefundsAccumulated = shift.totalCashRefunds || new Decimal(0);
    // @ts-ignore
    const totalAccountRefundsAccumulated = shift.totalAccountRefunds || new Decimal(0);

    // Only count split payments (doesn't affect money totals)
    let splitPaymentCount = 0;
    for (const sale of shift.sales) {
        if (sale.payments.length > 1) splitPaymentCount++;
    }

    // ✅ BL-03 fix: Only count CASH expenses for cash drawer variance
    // Non-cash expenses (Bank/Visa) shouldn't affect the physical cash drawer
    const totalCashExpenses = shift.expenses
        .filter(exp => (exp.paymentMethod || 'CASH').toUpperCase() === 'CASH')
        .reduce(
            (sum, exp) => sum.add(new Decimal(exp.amount)),
            new Decimal(0)
        );

    const totalAllExpenses = shift.expenses.reduce(
        (sum, exp) => sum.add(new Decimal(exp.amount)),
        new Decimal(0)
    );

    // ✅ FIX: Subtract CASH refunds issued during this shift from expectedCash
    // Use the accumulated value from real-time tracking
    const totalCashRefundsToUse = totalCashRefundsAccumulated;

    // Calculate expected cash: Start + Cash Sales - Cash Expenses - Cash Refunds
    const expectedCash = shift.startCash
        .add(totalCashSales)
        .minus(totalCashExpenses)
        .minus(totalCashRefundsToUse);

    const actualCashDecimal = new Decimal(data.actualCash);
    const cashVariance = actualCashDecimal.minus(expectedCash);

    // ✅ FIX #2: VERIFY COUNTS (Don't recalculate!)
    const actualSalesCount = shift.sales.length;
    const actualTicketsCount = 0; // shift.tickets.length; // REMOVED

    let hasDiscrepancy = false;
    const discrepancyNotes: string[] = [];

    // Check sales count
    if (shift.totalSales !== actualSalesCount) {
        hasDiscrepancy = true;
        const diff = actualSalesCount - shift.totalSales;
        discrepancyNotes.push(
            `Sales count mismatch: Recorded=${shift.totalSales}, Actual=${actualSalesCount}, Diff=${diff}`
        );
        console.error('[CRITICAL] Sales count discrepancy detected', {
            shiftId: shift.id,
            recorded: shift.totalSales,
            actual: actualSalesCount
        });
    }

    /* // REMOVED TICKET CHECK
    // Check tickets count
    if (shift.totalTickets !== actualTicketsCount) {
        hasDiscrepancy = true;
        const diff = actualTicketsCount - shift.totalTickets;
        discrepancyNotes.push(
            `Ticket count mismatch: Recorded=${shift.totalTickets}, Actual=${actualTicketsCount}, Diff=${diff}`
        );
        console.error('[CRITICAL] Ticket count discrepancy detected', {
            shiftId: shift.id,
            recorded: shift.totalTickets,
            actual: actualTicketsCount
        });
    }
    */

    // ✅ FIX #3: CREATE AUDIT LOG FOR DISCREPANCIES
    if (hasDiscrepancy) {
        await prisma.auditLog.create({
            data: {
                entityType: "SHIFT",
                entityId: shift.id,
                action: "COUNT_DISCREPANCY",
                previousData: JSON.stringify({
                    recorded: { sales: shift.totalSales, tickets: shift.totalTickets },
                    actual: { sales: actualSalesCount, tickets: actualTicketsCount }
                }),
                newData: JSON.stringify({
                    action: "AUTO_CORRECTED",
                    correctedTo: { sales: actualSalesCount, tickets: actualTicketsCount }
                }),
                reason: discrepancyNotes.join('; '),
                user: shift.cashierName || 'SYSTEM'
            }
        });
    }

    // Use verified counts (with auto-correction if needed)
    const finalSalesCount = hasDiscrepancy ? actualSalesCount : shift.totalSales;
    const finalTicketsCount = hasDiscrepancy ? actualTicketsCount : shift.totalTickets;

    // Update shift with calculated values
    const closedShift = await prisma.shift.update({
        where: { id: data.shiftId },
        data: {
            status: "CLOSED",
            closedAt: new Date(),
            actualCash: actualCashDecimal,
            endCash: expectedCash,
            cashVariance,
            totalCashSales,
            totalCardSales,
            totalWalletSales,
            totalInstapay,
            // @ts-ignore
            totalAccountSales,
            // @ts-ignore
            totalCashRefunds: totalCashRefundsAccumulated,
            // @ts-ignore
            totalAccountRefunds: totalAccountRefundsAccumulated,
            totalSplitPayments: splitPaymentCount,
            totalExpenses: totalAllExpenses,
            totalSales: finalSalesCount,      // ✅ Verified
            totalTickets: finalTicketsCount,  // ✅ Verified
            hasAdjustments: hasDiscrepancy,   // ✅ Flag if corrected
            notes: hasDiscrepancy
                ? `${data.notes || ''}\n\n[AUTO-CORRECTED]: ${discrepancyNotes.join('\n')}`
                : data.notes || shift.notes
        }
    });

    // Handle Safe Drop (Treasury Transfer) AND Accounting Entries
    await prisma.$transaction(async (tx) => {
        if (data.safeDropAmount && data.safeDropAmount > 0 && data.safeDropTreasuryId) {
            await tx.transaction.create({
                data: {
                    type: 'SAFE_DROP',
                    amount: new Decimal(data.safeDropAmount || 0),
                    paymentMethod: 'CASH',
                    description: `Safe Drop from Shift #${shift.id}`,
                    treasuryId: data.safeDropTreasuryId
                }
            });

            await tx.treasury.update({
                where: { id: data.safeDropTreasuryId },
                data: { balance: { increment: data.safeDropAmount } }
            });

            // ── Phase 4: Z-Report Safe Drop Journal Entry ──
            await AccountingEngine.recordTransaction({
                description: `Z-Report Safe Drop - Shift #${shift.id.slice(0, 8)}`,
                reference: shift.id,
                date: new Date(),
                lines: [
                    { accountCode: '1020', debit: data.safeDropAmount, credit: 0, description: "Safe Drop - To Treasury" }, // Assuming Safe/Treasury is 1020
                    { accountCode: '1000', debit: 0, credit: data.safeDropAmount, description: "Safe Drop - From Cash Drawer" }
                ]
            }, tx);
        }

        // ── Phase 4: Z-Report Cash Variance (Over/Short) Journal Entry ──
        if (!cashVariance.isZero()) {
            const varianceAmt = Math.abs(cashVariance.toNumber());
            const isShortage = cashVariance.isNegative(); // If negative, we have less cash than expected

            await AccountingEngine.recordTransaction({
                description: `Z-Report Cash Variance - Shift #${shift.id.slice(0, 8)}`,
                reference: shift.id,
                date: new Date(),
                lines: isShortage ? [
                    // Shortage: Expense (DR) / Cash Out (CR)
                    { accountCode: '5500', debit: varianceAmt, credit: 0, description: "Cash Shortage (Loss)" },
                    { accountCode: '1000', debit: 0, credit: varianceAmt, description: "Cash Register Adjustment" }
                ] : [
                    // Overage: Cash In (DR) / Contra-Expense or Income (CR)
                    { accountCode: '1000', debit: varianceAmt, credit: 0, description: "Cash Register Adjustment" },
                    { accountCode: '5500', debit: 0, credit: varianceAmt, description: "Cash Overage (Gain)" }
                ]
            }, tx);
        }
    });

    revalidatePath("/pos");
    revalidatePath("/");
    revalidatePath("/reports");

    return serialize({
        success: true,
        shift: closedShift,
        variance: cashVariance.toNumber(), // ✅ FIX: Use .toNumber() for proper Decimal conversion
        hasDiscrepancy,
        discrepancyNotes,
        message: hasDiscrepancy
            ? `⚠️ Shift closed with COUNT DISCREPANCIES (auto-corrected). Check audit log.`
            : cashVariance.equals(0)
                ? "Shift closed successfully - Perfect balance!"
                : `Shift closed with ${cashVariance.greaterThan(0) ? 'overage' : 'shortage'} of ${Math.abs(cashVariance.toNumber()).toFixed(2)}`
    });
}, { permission: "SHIFT_MANAGE", requireCSRF: true });

/**
 * Internal function to get current shift - for use within other server actions
 * Does NOT perform permission checks (caller is responsible for auth)
 */
export async function getCurrentShiftInternal(filters?: {
    userId?: string;
    registerId?: string;
}) {
    const userId = filters?.userId;

    if (!userId) {
        return { shift: null };
    }

    let checkUserId = userId;
    if (userId === 'super-admin') {
        const fallbackAdmin = await prisma.user.findFirst({
            where: { roleStr: 'ADMIN' }
        }) || await prisma.user.findFirst();
        if (fallbackAdmin) checkUserId = fallbackAdmin.id;
    }

    const where: Prisma.ShiftWhereInput = {
        userId: checkUserId,
        status: "OPEN"
    };

    if (filters?.registerId !== undefined) {
        where.registerId = filters.registerId;
    }

    const shift = await prisma.shift.findFirst({
        where,
        orderBy: { openedAt: 'desc' }
    });

    return { shift: shift };
}

/**
 * Get current active shift for a user
 * Supports register-level filtering for multi-register environments
 */
export const getCurrentShift = secureAction(async (filters?: {
    userId?: string;
    registerId?: string;
}) => {
    const currentUser = await getCurrentUser();
    const userId = filters?.userId || currentUser?.id;

    if (!userId) {
        return { shift: null };
    }

    let checkUserId = userId;
    if (userId === 'super-admin') {
        const fallbackAdmin = await prisma.user.findFirst({
            where: { roleStr: 'ADMIN' }
        }) || await prisma.user.findFirst();
        if (fallbackAdmin) checkUserId = fallbackAdmin.id;
    }

    const where: Prisma.ShiftWhereInput = {
        userId: checkUserId,
        status: "OPEN"
    };

    // If registerId specified, filter by it
    // If null, only return shifts with no register (backward compat)
    if (filters?.registerId !== undefined) {
        where.registerId = filters.registerId;
    }

    const shift = await prisma.shift.findFirst({
        where,
        orderBy: { openedAt: 'desc' }
    });

    /* // REMOVED TICKET COUNT
    if (shift) {
        serviceReturnCount = await prisma.ticket.count({
            where: {
                shiftId: shift.id,
                returnCount: { gt: 0 }
            }
        });
    }
    */

    return serialize({
        shift: shift ? shift : null,
        serviceReturnCount: 0 // serviceReturnCount // REMOVED
    });
}, { permission: "SHIFT_VIEW", requireCSRF: false });

/**
 * Get shift by ID with all related data
 */
export const getShiftById = secureAction(async (shiftId: string) => {
    const shift = await prisma.shift.findUnique({
        where: { id: shiftId },
        include: {
            sales: {
                include: {
                    payments: true,
                    items: { include: { product: true } },
                    customer: { select: { name: true, phone: true } }
                }
            },
            /* // REMOVED TICKETS
            tickets: {
                include: {
                    payments: true,
                    customer: { select: { name: true, phone: true } }
                }
            },
            */
            expenses: true,
            adjustments: true,
            transactions: {
                include: {
                    treasury: true
                }
            },
            user: { select: { id: true, name: true, username: true } }
        }
    });

    if (!shift) {
        throw new Error("Shift not found");
    }

    return serialize({ shift: shift });
}, { permission: "SHIFT_VIEW", requireCSRF: false });

/**
 * Get shift history with filters
 */
export const getShiftHistory = secureAction(async (filters?: {
    userId?: string;
    registerId?: string;
    status?: string;
    startDate?: string;
    endDate?: string;
    businessDate?: string;
    limit?: number;
    offset?: number;
}) => {
    const where: Prisma.ShiftWhereInput = {};

    if (filters?.userId) where.userId = filters.userId;
    if (filters?.registerId) where.registerId = filters.registerId;
    if (filters?.status) where.status = filters.status;
    if (filters?.businessDate) where.businessDate = filters.businessDate;

    if (filters?.startDate || filters?.endDate) {
        where.openedAt = {};
        if (filters.startDate) where.openedAt.gte = new Date(filters.startDate);
        if (filters.endDate) where.openedAt.lte = new Date(filters.endDate);
    }

    const [shifts, total] = await Promise.all([
        prisma.shift.findMany({
            where,
            include: {
                user: { select: { name: true, username: true } }
            },
            orderBy: { openedAt: 'desc' },
            take: filters?.limit || 50,
            skip: filters?.offset || 0
        }),
        prisma.shift.count({ where })
    ]);

    return serialize({
        shifts: shifts,
        total,
        hasMore: total > (filters?.offset || 0) + shifts.length
    });
}, { permission: "SHIFT_VIEW", requireCSRF: false });

/**
 * Update heartbeat to prevent orphan detection
 * Called automatically on every transaction
 */
export const updateShiftHeartbeat = secureAction(async (shiftId: string) => {
    await prisma.shift.update({
        where: { id: shiftId },
        data: { lastHeartbeat: new Date() }
    });

    return { success: true };
}, { permission: "SHIFT_VIEW", requireCSRF: false }); // Low permission since it's automatic

// ============================================================================
// ADVANCED OPERATIONS (Gap Fixes)
// ============================================================================

/**
 * Force close orphaned shift (Admin only)
 * Used for crash recovery
 */
export const forceCloseShift = secureAction(async (data: {
    shiftId: string;
    reason: string;
}) => {
    const currentUser = await getCurrentUser();

    const t = await getTranslations('SystemMessages.Errors');

    if (!currentUser) {
        throw new Error(t('unauthorized'));
    }

    const shift = await prisma.shift.findUnique({
        where: { id: data.shiftId },
        include: { sales: { include: { payments: true } }, expenses: true }
    });

    if (!shift) {
        throw new Error(t('notFound'));
    }

    // ✅ BL-04 fix: Use ATOMIC aggregated totals already in the Shift record
    // recalculating from sales/expenses causes data loss if records are soft-deleted or shifted.
    const totalCashSales = shift.totalCashSales;
    const totalExpenses = shift.totalExpenses;
    const totalCashRefunds = shift.totalRefunds;

    const estimatedCash = shift.startCash.add(totalCashSales).minus(totalExpenses).minus(totalCashRefunds);

    const closedShift = await prisma.shift.update({
        where: { id: data.shiftId },
        data: {
            status: "FORCE_CLOSED",
            closedAt: new Date(),
            forceClosed: true,
            forceClosedBy: currentUser.id,
            forceCloseReason: data.reason,
            endCash: estimatedCash,
            actualCash: estimatedCash, // Assume perfect balance
            cashVariance: new Decimal(0),
            notes: `FORCE CLOSED: ${data.reason}`
        }
    });

    // Create audit log
    await prisma.auditLog.create({
        data: {
            entityType: "SHIFT",
            entityId: data.shiftId,
            action: "FORCE_CLOSE",
            previousData: JSON.stringify({ status: shift.status }),
            newData: JSON.stringify({ status: "FORCE_CLOSED" }),
            reason: data.reason,
            user: currentUser.username || currentUser.name
        }
    });

    revalidatePath("/pos");
    revalidatePath("/reports");

    return serialize({
        success: true,
        shift: closedShift,
        message: "Shift force-closed successfully"
    });
}, { permission: "SHIFT_ADMIN" });

/**
 * Detect orphaned shifts (shifts open >24 hours with no heartbeat)
 * Run as scheduled job
 */
export const detectOrphanedShifts = secureAction(async () => {
    const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);

    const orphanedShifts = await prisma.shift.findMany({
        where: {
            status: "OPEN",
            lastHeartbeat: {
                lt: twentyFourHoursAgo
            },
            isOrphaned: false
        },
        include: {
            user: { select: { name: true, username: true } }
        }
    });

    // Flag as orphaned
    if (orphanedShifts.length > 0) {
        await prisma.shift.updateMany({
            where: {
                id: { in: orphanedShifts.map(s => s.id) }
            },
            data: { isOrphaned: true }
        });
    }

    return serialize({
        orphanedCount: orphanedShifts.length,
        shifts: orphanedShifts
    });
}, { permission: "SHIFT_ADMIN", requireCSRF: false });

/**
 * Transfer shift ownership (handoff)
 * For lunch breaks, shift changes, etc.
 */
export const handoffShift = secureAction(async (data: {
    shiftId: string;
    newUserId: string;
    csrfToken?: string; // For CSRF validation
}) => {
    const t = await getTranslations('SystemMessages.Errors');
    const shift = await prisma.shift.findUnique({ where: { id: data.shiftId } });

    if (!shift) {
        throw new Error("Shift not found");
    }

    if (shift.status !== "OPEN") {
        throw new Error(t('handoffActiveOnly'));
    }

    // ✅ BL-05 fix: Only the current owner or an ADMIN can hand off
    const currentUser = await getCurrentUser();
    const isOwner = shift.userId === currentUser?.id;
    const isAdmin = currentUser?.role === 'ADMIN' || currentUser?.permissions?.includes('*');

    if (!isOwner && !isAdmin) {
        throw new Error(t('forbidden'));
    }

    const newUser = await prisma.user.findUnique({ where: { id: data.newUserId } });

    if (!newUser) {
        throw new Error(t('notFound'));
    }

    const updatedShift = await prisma.shift.update({
        where: { id: data.shiftId },
        data: {
            userId: data.newUserId,
            cashierName: newUser.name || newUser.username,
            notes: shift.notes
                ? `${shift.notes}\n[Handoff at ${new Date().toISOString()}]`
                : `[Handoff at ${new Date().toISOString()}]`
        }
    });

    revalidatePath("/pos");

    return serialize({
        success: true,
        shift: updatedShift,
        message: `Shift handed off to ${newUser.name || newUser.username}`
    });
}, { permission: "SHIFT_HANDOFF", requireCSRF: true });

/**
 * Create adjustment entry for closed shift
 * For error corrections with full audit trail
 */
export const createShiftAdjustment = secureAction(async (data: {
    shiftId: string;
    amount: number;
    reason: string;
    type: string; // CORRECTION, REFUND_ADJUSTMENT, ERROR_FIX, OTHER
    relatedTransactionId?: string;
}) => {
    const currentUser = await getCurrentUser();

    const t = await getTranslations('SystemMessages.Errors');

    if (!currentUser) {
        throw new Error(t('unauthorized'));
    }

    const shift = await prisma.shift.findUnique({ where: { id: data.shiftId } });

    if (!shift) {
        throw new Error(t('notFound'));
    }

    if (shift.status === "OPEN") {
        throw new Error(t('adjustmentActiveError'));
    }

    // Create adjustment
    const adjustment = await prisma.shiftAdjustment.create({
        data: {
            shiftId: data.shiftId,
            type: data.type,
            amount: new Decimal(data.amount),
            reason: data.reason,
            approvedBy: currentUser.id, // In production, require separate approval
            createdBy: currentUser.id,
            relatedTransactionId: data.relatedTransactionId
        }
    });

    // Update shift to flag adjustments
    await prisma.shift.update({
        where: { id: data.shiftId },
        data: { hasAdjustments: true }
    });

    // Create audit log
    await prisma.auditLog.create({
        data: {
            entityType: "SHIFT_ADJUSTMENT",
            entityId: adjustment.id,
            action: "CREATE",
            previousData: JSON.stringify({}),
            newData: JSON.stringify(adjustment),
            reason: data.reason,
            user: currentUser.username || currentUser.name
        }
    });

    revalidatePath("/reports");

    return serialize({
        success: true,
        adjustment: adjustment,
        message: "Adjustment created successfully"
    });
}, { permission: "SHIFT_ADJUST" });
