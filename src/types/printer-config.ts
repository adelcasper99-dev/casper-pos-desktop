/**
 * Persistent printer configuration registry
 */
export interface PrinterRegistry {
    /** Unique ID for this workstation/browser instance */
    workstationId: string;

    /** Assigned printer for receipts */
    receiptPrinter?: string;

    /** Assigned printer for labels */
    labelPrinter?: string;

    /** Selected paper size (80mm, 58mm, 100mm) */
    paperSize?: string;

    /** Last seen QZ Tray version */
    qzVersion?: string;

    /** Timestamp of last configuration update */
    updatedAt: number;
}

/**
 * Registry storage key
 */
export const PRINTER_REGISTRY_KEY = 'casper_printer_registry_v2';
