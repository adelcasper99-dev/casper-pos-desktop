/**
 * Shared TypeScript type definitions for Ticket entities
 * Used across Repair Center, Dashboard, and Workflow modules
 */

/**
 * Ticket data structure from Prisma
 * Matches prisma/schema.prisma Ticket model
 */
export interface Ticket {
    id: string;
    barcode: string;

    // Customer
    customerName: string;
    customerPhone: string;
    customerEmail: string | null;
    customerId: string | null;

    // Device
    deviceBrand: string;
    deviceModel: string;
    deviceImei: string | null;
    deviceColor: string | null;
    securityCode: string | null;
    patternData: string | null;

    // Issues & Warranty
    issueDescription: string;
    conditionNotes: string | null;
    warrantyExpiry: Date | null;

    // Status
    status: string;

    // Location
    currentBranchId: string;

    // Assignment
    technicianId: string | null;
    completedById: string | null;

    // Financials
    initialQuote: number;
    repairPrice: number;
    partsCost: number;
    deposit: number;

    // Commission
    commissionRate: number;
    commissionAmount: number;
    netProfit: number;

    // Payment
    paymentStatus: string;
    paymentMethod: string | null;
    amountPaid: number;

    // Timestamps
    createdAt: Date;
    updatedAt: Date;
    startedAt: Date | null;
    expectedDuration: number | null;
    deletedAt: Date | null;
    completedAt: Date | null;
    deliveredAt: Date | null;

    // Warranty Returns
    returnCount: number;
    lastReturnedAt: Date | null;
    returnReason: string | null;
    originalTechId: string | null;
    warrantyExpiryDate: Date | null;
    commissionClawback: number;

    // Relations
    shiftId: string | null;
    movementId: string | null;
    version: number;
}

/**
 * Minimal ticket data for workflow actions
 * Only includes fields needed for status transitions
 */
export interface WorkflowTicket {
    id: string;
    status: string;
    barcode: string;
    deviceBrand: string;
    deviceModel: string;
    customerName: string;
    technicianId: string | null;
    expectedDuration: number | null;
}
