import { prisma } from '@/lib/prisma';

/**
 * Audit logging for commission-related actions
 */

interface CommissionCalculationData {
  technicianId: string;
  netProfit: number;
  commissionRate: number;
  commissionAmount: number;
}

interface CommissionBackfillStats {
  ticketsProcessed: number;
  totalCommissions: number;
  errors: number;
}

/**
 * Logs a commission calculation event
 */
export async function logCommissionCalculation(
  ticketId: string,
  data: CommissionCalculationData
): Promise<void> {
  try {
    await prisma.auditLog.create({
      data: {
        entityType: 'TICKET_COMMISSION',
        entityId: ticketId,
        action: 'CALCULATE',
        previousData: '',
        newData: JSON.stringify({
          technicianId: data.technicianId,
          netProfit: data.netProfit,
          commissionRate: data.commissionRate,
          commissionAmount: data.commissionAmount,
          timestamp: new Date().toISOString()
        }),
        user: 'SYSTEM'
      }
    });
  } catch (error) {
    console.error('Failed to log commission calculation:', error);
    // Don't throw - logging failure shouldn't break commission calculation
  }
}

/**
 * Logs commission backfill operation results
 */
export async function logCommissionBackfill(stats: CommissionBackfillStats): Promise<void> {
  try {
    await prisma.auditLog.create({
      data: {
        entityType: 'COMMISSION_BACKFILL',
        entityId: `backfill-${Date.now()}`,
        action: 'BACKFILL_COMPLETE',
        previousData: '',
        newData: JSON.stringify({
          ticketsProcessed: stats.ticketsProcessed,
          totalCommissions: stats.totalCommissions,
          errors: stats.errors,
          timestamp: new Date().toISOString()
        }),
        user: 'SYSTEM'
      }
    });
    
    console.log('✅ Backfill operation logged to audit trail');
  } catch (error) {
    console.error('Failed to log backfill results:', error);
  }
}

/**
 * Logs commission reversal (due to refund or status change)
 */
export async function logCommissionReversal(
  ticketId: string,
  reason: string,
  previousAmount?: number
): Promise<void> {
  try {
    await prisma.auditLog.create({
      data: {
        entityType: 'TICKET_COMMISSION',
        entityId: ticketId,
        action: 'REVERSE',
        previousData: previousAmount ? JSON.stringify({ commissionAmount: previousAmount }) : '',
        newData: JSON.stringify({
          commissionAmount: 0,
          reason,
          timestamp: new Date().toISOString()
        }),
        reason,
        user: 'SYSTEM'
      }
    });
  } catch (error) {
    console.error('Failed to log commission reversal:', error);
  }
}

/**
 * Logs when an engineer's commission rate is updated
 */
export async function logCommissionRateChange(
  technicianId: string,
  oldRate: number,
  newRate: number,
  changedBy: string
): Promise<void> {
  try {
    await prisma.auditLog.create({
      data: {
        entityType: 'TECHNICIAN',
        entityId: technicianId,
        action: 'UPDATE_COMMISSION_RATE',
        previousData: JSON.stringify({ commissionRate: oldRate }),
        newData: JSON.stringify({ commissionRate: newRate }),
        reason: `Commission rate changed from ${oldRate}% to ${newRate}%`,
        user: changedBy
      }
    });
  } catch (error) {
    console.error('Failed to log commission rate change:', error);
  }
}

/**
 * Retrieves commission audit trail for a ticket
 */
export async function getCommissionAuditTrail(ticketId: string) {
  try {
    const logs = await prisma.auditLog.findMany({
      where: {
        entityType: 'TICKET_COMMISSION',
        entityId: ticketId
      },
      orderBy: {
        createdAt: 'desc'
      }
    });
    
    return logs;
  } catch (error) {
    console.error('Failed to retrieve commission audit trail:', error);
    return [];
  }
}
