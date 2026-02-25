/**
 * Persistent printer configuration registry
 */
export interface PrinterRegistry {
    /** Unique ID for this workstation/browser instance */
    workstationId: string;

    /** Assigned printer for receipts (A4 or Thermal - legacy fallback) */
    receiptPrinter?: string;

    /** Assigned printer for thermal receipts specifically */
    thermalPrinter?: string;

    /** Assigned printer for A4 receipts specifically */
    a4Printer?: string;

    /** Assigned format for receipts */
    receiptFormat?: 'thermal' | 'a4';

    /** Whether thermal printing is enabled in the UI */
    enableThermal?: boolean;

    /** Whether A4 printing is enabled in the UI */
    enableA4?: boolean;

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
