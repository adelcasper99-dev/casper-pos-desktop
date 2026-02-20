export const TicketStatus = {
    NEW: 'NEW',
    // 🔧 FIX BUG-08: Removed READY_FOR_TRANSIT (dead — no workflow transition used it)
    IN_TRANSIT_TO_CENTER: 'IN_TRANSIT_TO_CENTER',
    AT_CENTER: 'AT_CENTER', // Generic "Arrived"
    DIAGNOSING: 'DIAGNOSING',
    PENDING_APPROVAL: 'PENDING_APPROVAL',
    IN_PROGRESS: 'IN_PROGRESS',
    QC_PENDING: 'QC_PENDING', // Technician finished, needs check
    WAITING_FOR_PARTS: 'WAITING_FOR_PARTS',
    COMPLETED: 'COMPLETED',
    // 🔧 FIX BUG-08: Removed READY_FOR_RETURN (dead — used nowhere)
    IN_TRANSIT_TO_BRANCH: 'IN_TRANSIT_TO_BRANCH',
    READY_AT_BRANCH: 'READY_AT_BRANCH',
    DELIVERED: 'DELIVERED',         // Handed to customer (legacy — same as PICKED_UP)
    PICKED_UP: 'PICKED_UP',         // 🔧 BUG-12 NOTE: Same as DELIVERED, workflow uses PICKED_UP as primary
    CANCELLED: 'CANCELLED',
    PAID_DELIVERED: 'PAID_DELIVERED', // Final state
    RETURNED_FOR_REFIX: 'RETURNED_FOR_REFIX', // Warranty return - customer returned with issue
    REJECTED: 'REJECTED' // Technician marked as unrepairable
} as const;

export type TicketStatusType = typeof TicketStatus[keyof typeof TicketStatus];

export const MovementStatus = {
    IN_TRANSIT: 'IN_TRANSIT',
    RECEIVED: 'RECEIVED',
    CANCELLED: 'CANCELLED'
} as const;

export type MovementStatusType = typeof MovementStatus[keyof typeof MovementStatus];

/**
 * Printing & UI Scaling Constants
 */

/**
 * Millimeters to Pixels conversion factor at 96 DPI.
 * Standard for web-based POS previews.
 */
export const MM_TO_PX = 3.78;

/**
 * Dots Per Millimeter for 203 DPI thermal printers.
 * Used for raw label command generation.
 */
export const DOTS_PER_MM = 8;

/**
 * Standard paper sizes in mm
 */
export const PAPER_SIZES = {
    STANDARD: 80,
    MOBILE: 58,
    WIDE: 100
};
