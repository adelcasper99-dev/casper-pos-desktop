/**
 * Print Service
 * Dynamically loads QZ Tray service only on client-side
 */

import type { LabelProduct, LabelTemplate } from './label-commands';
import { PRINTER_REGISTRY_KEY, type PrinterRegistry } from '@/types/printer-config';
import { safeRandomUUID } from './utils';

export interface PrinterStatus {
  online: boolean;
  version?: string;
  printers?: string[];
  error?: string;
}

let qzService: any = null;

// --- Casper Agent Client ---
const AGENT_URL = 'http://localhost:21234';

class CasperAgentClient {
  async isAvailable(): Promise<boolean> {
    try {
      const res = await fetch(`${AGENT_URL}/status`);
      return res.ok;
    } catch (e) {
      return false;
    }
  }

  async getStatus() {
    try {
      const res = await fetch(`${AGENT_URL}/status`);
      if (!res.ok) throw new Error('Agent responding but with error');
      return await res.json();
    } catch (e) {
      throw new Error('Agent offline');
    }
  }

  async printHTML(html: string, printerName?: string) {
    const res = await fetch(`${AGENT_URL}/print`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ html, printer: printerName })
    });

    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error || 'Agent print failed');
    }
  }
}

const agentClient = new CasperAgentClient();


/**
 * Lazy load QZ Tray service (client-side only)
 */
async function getQZService() {
  if (qzService) return qzService;

  const module = await import('./qz-tray-service.client');
  qzService = module.qzTrayService;
  return qzService;
}

/**
 * Print Service Class
 */
class PrintService {
  private defaultPrinterName = 'Xprinter XP-200B';
  private registry: PrinterRegistry | null = null;

  constructor() {
    if (typeof window !== 'undefined') {
      this.initRegistry();
    }
  }

  private initRegistry() {
    const stored = localStorage.getItem(PRINTER_REGISTRY_KEY);
    if (stored) {
      try {
        this.registry = JSON.parse(stored);
      } catch (e) {
        console.warn("Failed to parse printer registry", e);
      }
    }

    // Auto-migration from legacy keys
    if (!this.registry) {
      const legacyReceipt = localStorage.getItem('casper_receipt_printer');
      const legacyLabel = localStorage.getItem('printer_label');

      if (legacyReceipt || legacyLabel) {
        this.registry = {
          workstationId: safeRandomUUID(),
          receiptPrinter: legacyReceipt || undefined,
          labelPrinter: legacyLabel || undefined,
          updatedAt: Date.now()
        };
        this.saveRegistry();
        console.log("✓ Migrated legacy printer settings to Registry v2");
      }
    }
  }

  private saveRegistry() {
    if (this.registry) {
      localStorage.setItem(PRINTER_REGISTRY_KEY, JSON.stringify(this.registry));
    }
  }

  getRegistry(): PrinterRegistry | null {
    return this.registry;
  }

  updateRegistry(updates: Partial<PrinterRegistry>) {
    this.registry = {
      ...this.registry,
      ...updates,
      workstationId: this.registry?.workstationId || safeRandomUUID(),
      updatedAt: Date.now()
    } as PrinterRegistry;
    this.saveRegistry();
  }

  setDefaultPrinter(name: string) {
    this.defaultPrinterName = name;
  }

  getDefaultPrinter(): string {
    return this.registry?.labelPrinter || this.defaultPrinterName;
  }

  async isServerOnline(): Promise<boolean> {
    try {
      const service = await getQZService();
      return await service.healthCheck();
    } catch {
      return false;
    }
  }

  async getStatus(): Promise<PrinterStatus> {
    // 1. Try Casper Agent first
    try {
      const agentStatus = await agentClient.getStatus();
      return {
        online: true,
        version: `Agent ${agentStatus.version}`,
        printers: agentStatus.printers?.map((p: any) => p.name) || [],
      };
    } catch (e) {
      // Agent offline, fall back to QZ
    }

    try {
      const service = await getQZService();
      const status = await service.getStatus();

      if (!status.connected) {
        return {
          online: false,
          error: status.error
        }
      }

      return {
        online: status.connected,
        version: status.version,
        printers: status.printers?.map((p: any) => p.name),
      };
    } catch (error: any) {
      return {
        online: false,
        error: error.message,
      };
    }
  }

  async getPrinters(): Promise<string[]> {
    // 1. Try Agent
    try {
      const agentStatus = await agentClient.getStatus();
      if (agentStatus.printers) {
        return agentStatus.printers.map((p: any) => p.name);
      }
    } catch (e) {
      // Ignore
    }

    // 2. Fallback QZ
    try {
      const service = await getQZService();
      const printers = await service.getPrinters();
      return printers.map((p: any) => p.name);
    } catch (error: any) {
      throw new Error(`Failed to get printers: ${error.message}`);
    }
  }

  async printLabels(labels: LabelProduct[], template?: LabelTemplate, printerName?: string): Promise<void> {
    try {
      const service = await getQZService();
      const isOnline = await this.isServerOnline();

      if (!isOnline) {
        throw new Error('QZ_TRAY_OFFLINE');
      }

      const targetPrinter = printerName || this.defaultPrinterName;
      await service.findPrinter(targetPrinter);

      const { generateMultipleLabelCommands } = await import('./label-commands');
      const commands = generateMultipleLabelCommands(labels, template);

      await service.printESCPOS(targetPrinter, commands);
      console.log(`✓ Printed ${labels.length} label(s) to ${targetPrinter}`);
    } catch (error: any) {
      if (error.message === 'QZ_TRAY_OFFLINE') {
        throw error;
      }
      throw new Error(`Print error: ${error.message}`);
    }
  }

  async testPrint(printerName?: string): Promise<void> {
    const service = await getQZService();
    const targetPrinter = printerName || this.defaultPrinterName;

    try {
      await service.findPrinter(targetPrinter);
      const { generateTestLabel } = await import('./label-commands');
      const commands = generateTestLabel();
      await service.printESCPOS(targetPrinter, commands);
      console.log(`✓ Test print sent to ${targetPrinter}`);
    } catch (error: any) {
      throw new Error(`Test print failed: ${error.message}`);
    }
  }

  async connect(): Promise<void> {
    const service = await getQZService();
    await service.connect();
  }

  async disconnect(): Promise<void> {
    const service = await getQZService();
    await service.disconnect();
  }

  async printSilentHTML(html: string, printerName: string): Promise<boolean> {
    const service = await getQZService();

    // 1. Try Casper Agent
    try {
      const isAgentAvailable = await agentClient.isAvailable();
      if (isAgentAvailable) {
        await agentClient.printHTML(html, printerName);
        console.log(`✓ Agent printed HTML to ${printerName}`);
        return true;
      }
    } catch (e) {
      console.warn("Agent print failed", e);
    }

    // 2. Try QZ Tray
    try {
      const isOnline = await service.isIdeallyConnected();
      if (isOnline) {
        await service.print({
          printer: printerName,
          data: [{
            type: 'html',
            format: 'plain',
            data: html
          } as any],
          options: { flavor: 'html' }
        });
        console.log(`✓ QZ printed HTML to ${printerName}`);
        return true;
      }
    } catch (e) {
      console.warn("QZ print failed", e);
    }

    return false;
  }

  async printHTML(html: string, printerName?: string): Promise<void> {
    const targetPrinter = printerName || this.registry?.receiptPrinter || localStorage.getItem('printer_receipt');

    if (targetPrinter) {
      const success = await this.printSilentHTML(html, targetPrinter);
      if (success) return;
      console.warn("Silent print failed or unavailable, falling back to iframe");
    }

    // 2. Fallback: Invisible Iframe Printing
    // This bypasses popup blockers and provides a cleaner experience
    return new Promise((resolve, reject) => {
      try {
        const iframe = document.createElement('iframe');
        iframe.style.position = 'fixed';
        iframe.style.right = '0';
        iframe.style.bottom = '0';
        iframe.style.width = '0';
        iframe.style.height = '0';
        iframe.style.border = '0';
        iframe.src = 'about:blank';

        document.body.appendChild(iframe);

        const doc = iframe.contentWindow?.document || iframe.contentDocument;
        if (!doc) throw new Error("Could not access iframe document");

        doc.open();
        doc.write(html);
        doc.close();

        // Wait for resources (images, etc) to load before printing
        iframe.onload = () => {
          setTimeout(() => {
            try {
              iframe.contentWindow?.focus();
              iframe.contentWindow?.print();
              // Clean up after a delay to allow print dialog to handle the reference
              setTimeout(() => {
                document.body.removeChild(iframe);
                resolve();
              }, 1000);
            } catch (e) {
              reject(e);
            }
          }, 500);
        };
      } catch (error) {
        reject(error);
      }
    });
  }
}

export const printService = new PrintService();
