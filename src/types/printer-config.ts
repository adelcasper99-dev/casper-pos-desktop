/**
 * Persistent printer configuration registry
 */
export interface PrinterRegistry {
    /** Unique ID for this workstation/browser instance */
    workstationId: string;

    /** Network IP for Casper Hardware Bridge (e.g., 192.168.1.15) */
    bridgeIpAddress?: string;
    bridgeSecurityToken?: string;

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

    /** Default number of copies to print */
    defaultCopies?: number;

    /** Whether to show the Quick Print button in POS footer */
    enableSpeedPrint?: boolean;

    /** Last seen QZ Tray version */
    qzVersion?: string;

    /** Timestamp of last configuration update */
    updatedAt: number;

    // ── Print Calibration ─────────────────────────────────────────────────────
    /** Thermal paper width in mm: 58 | 72 | 80 | 104. Default 80. */
    thermalPaperWidthMm?: number;
    /** Extra top margin for thermal receipts in mm. Default 0. */
    thermalMarginTopMm?: number;
    /** Extra right margin for thermal receipts in mm. Default 0. */
    thermalMarginRightMm?: number;
    /** Extra bottom margin for thermal receipts in mm. Default 0. */
    thermalMarginBottomMm?: number;
    /** Extra left margin for thermal receipts in mm. Default 0. */
    thermalMarginLeftMm?: number;

    /** A4 page margin — top in mm. Default 10. */
    a4MarginTopMm?: number;
    /** A4 page margin — right in mm. Default 10. */
    a4MarginRightMm?: number;
    /** A4 page margin — bottom in mm. Default 10. */
    a4MarginBottomMm?: number;
    /** A4 page margin — left in mm. Default 10. */
    a4MarginLeftMm?: number;
}

/**
 * Registry storage key
 */
export const PRINTER_REGISTRY_KEY = 'casper_printer_registry_v2';
