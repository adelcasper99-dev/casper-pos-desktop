/**
 * Reporting Constants
 * These can be safely imported in both client and server components
 */

/**
 * Supported Models for Reporting
 * This whitelist prevents arbitrary data access.
 */
export const REPORTABLE_MODELS = {
    SALES: 'sale',
    TICKETS: 'ticket',
    INVENTORY: 'product',
    LEAVES: 'leaveRequest',
    JOURNAL: 'journalEntry'
} as const;

export type ReportModel = keyof typeof REPORTABLE_MODELS;
