/**
 * Print Service
 * Priority chain:
 *   1. Electron IPC (native silent print — no dialog, no third-party software)
 *   2. Casper Agent (HTTP sidecar)
 *   3. QZ Tray (WebSocket)
 *   4. Iframe fallback (browser print dialog)
 */

import type { LabelProduct, LabelTemplate } from './label-commands';
import { PRINTER_REGISTRY_KEY, type PrinterRegistry } from '@/types/printer-config';
import { safeRandomUUID } from './utils';

// ─────────────────────────────────────────────
// Type augmentation for the Electron bridge
// ─────────────────────────────────────────────
declare global {
  interface Window {
    electronAPI?: {
      isElectron: true;
      getPrinters: () => Promise<{ name: string; isDefault: boolean; status: number }[]>;
      print: (html: string, printerName: string, options?: any) => Promise<{ success: true }>;
      /** Custom frameless window controls – exposed by TitleBar */
      windowControls?: {
        minimize: () => void;
        maximize: () => void;
        close: () => void;
        isMaximized: () => Promise<boolean>;
        onMaximizeChange: (cb: (isMaximized: boolean) => void) => () => void;
        zoomIn: () => void;
        zoomOut: () => void;
        zoomReset: () => void;
      };
      /** Database Configuration API */
      config?: {
        showOpenDialog: () => Promise<string | null>;
        getDbPath: () => Promise<string>;
        saveConfigAndRestart: (path: string) => Promise<boolean>;
      };
    };
  }
}

export interface PrinterStatus {
  online: boolean;
  version?: string;
  printers?: string[];
  error?: string;
}

let qzService: any = null;

// ─────────────────────────────────────────────
// Channel 1: Electron Native IPC
// ─────────────────────────────────────────────
class ElectronPrintChannel {
  isAvailable(): boolean {
    return typeof window !== 'undefined' && !!window.electronAPI?.isElectron;
  }

  async getPrinters(): Promise<string[]> {
    const printers = await window.electronAPI!.getPrinters();
    return printers.map(p => p.name);
  }

  async getDefaultPrinterName(): Promise<string | null> {
    const printers = await window.electronAPI!.getPrinters();
    const def = printers.find(p => p.isDefault);
    return def?.name ?? (printers[0]?.name ?? null);
  }

  async print(html: string, printerName: string, options?: any): Promise<void> {
    await window.electronAPI!.print(html, printerName, options ?? {});
  }
}

const electronChannel = new ElectronPrintChannel();

// ─────────────────────────────────────────────
// Channel 2: Casper Agent (HTTP sidecar)
// ─────────────────────────────────────────────
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

// ─────────────────────────────────────────────
// Channel 3: QZ Tray (lazy loaded)
// ─────────────────────────────────────────────
async function getQZService() {
  if (qzService) return qzService;
  const module = await import('./qz-tray-service.client');
  qzService = module.qzTrayService;
  return qzService;
}

// ─────────────────────────────────────────────
// Print Service
// ─────────────────────────────────────────────
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
        console.warn('Failed to parse printer registry', e);
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
        console.log('✓ Migrated legacy printer settings to Registry v2');
      }
    }
  }

  private saveRegistry() {
    if (this.registry) {
      localStorage.setItem(PRINTER_REGISTRY_KEY, JSON.stringify(this.registry));
    }
  }

  getRegistry(): PrinterRegistry | null { return this.registry; }

  updateRegistry(updates: Partial<PrinterRegistry>) {
    this.registry = {
      ...this.registry,
      ...updates,
      workstationId: this.registry?.workstationId || safeRandomUUID(),
      updatedAt: Date.now()
    } as PrinterRegistry;
    this.saveRegistry();
  }

  setDefaultPrinter(name: string) { this.defaultPrinterName = name; }

  getDefaultPrinter(): string {
    return this.registry?.labelPrinter || this.defaultPrinterName;
  }

  async isServerOnline(): Promise<boolean> {
    // Electron is always "online"
    if (electronChannel.isAvailable()) return true;
    try {
      const service = await getQZService();
      return await service.healthCheck();
    } catch {
      return false;
    }
  }

  /**
   * Returns the full printer status, preferring Electron → Agent → QZ
   */
  async getStatus(): Promise<PrinterStatus> {
    // 1. Electron
    if (electronChannel.isAvailable()) {
      try {
        const printers = await electronChannel.getPrinters();
        return {
          online: true,
          version: 'Electron Native',
          printers,
        };
      } catch (e) {
        // Fall through
      }
    }

    // 2. Casper Agent
    try {
      const agentStatus = await agentClient.getStatus();
      return {
        online: true,
        version: `Agent ${agentStatus.version}`,
        printers: agentStatus.printers?.map((p: any) => p.name) || [],
      };
    } catch (e) {
      // Fall through
    }

    // 3. QZ Tray
    try {
      const service = await getQZService();
      const status = await service.getStatus();
      if (!status.connected) return { online: false, error: status.error };
      return {
        online: status.connected,
        version: status.version,
        printers: status.printers?.map((p: any) => p.name),
      };
    } catch (error: any) {
      return { online: false, error: error.message };
    }
  }

  /**
   * Returns a list of printer names, preferring Electron → Agent → QZ
   */
  async getPrinters(): Promise<string[]> {
    // 1. Electron
    if (electronChannel.isAvailable()) {
      try {
        return await electronChannel.getPrinters();
      } catch (e) {
        console.warn('[PrintService] Electron getPrinters failed', e);
      }
    }

    // 2. Agent
    try {
      const agentStatus = await agentClient.getStatus();
      if (agentStatus.printers) return agentStatus.printers.map((p: any) => p.name);
    } catch (e) { /* ignore */ }

    // 3. QZ
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
      if (!isOnline) throw new Error('QZ_TRAY_OFFLINE');
      const targetPrinter = printerName || this.defaultPrinterName;
      await service.findPrinter(targetPrinter);
      const { generateMultipleLabelCommands } = await import('./label-commands');
      const commands = generateMultipleLabelCommands(labels, template);
      await service.printESCPOS(targetPrinter, commands);
      console.log(`✓ Printed ${labels.length} label(s) to ${targetPrinter}`);
    } catch (error: any) {
      if (error.message === 'QZ_TRAY_OFFLINE') throw error;
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

  /**
   * Silent HTML print.
   * Priority: Electron IPC → Casper Agent → QZ Tray
   * Returns true if a silent print succeeded.
   */
  async printSilentHTML(html: string, printerName: string, options?: { paperWidthMm?: number }): Promise<boolean> {
    // 1. Electron (best path — zero dependencies, truly silent)
    if (electronChannel.isAvailable()) {
      try {
        if (!window.electronAPI?.print) {
          console.warn('[PrintService] electronAPI.print is MISSING from bridge');
        } else {
          const widthMicrons = Math.round((options?.paperWidthMm || 80) * 1000);
          await electronChannel.print(html, printerName, {
            pageSize: {
              width: widthMicrons,
              height: 2970000 // large max height so receipt isn't clipped
            }
          });
          console.log(`✓ [Electron] Printed to "${printerName}"`);
          return true;
        }
      } catch (err) {
        console.warn('[PrintService] Electron silent print failed, trying Agent...', err);
      }
    }

    // 2. Casper Agent
    try {
      const isAgentAvailable = await agentClient.isAvailable();
      if (isAgentAvailable) {
        await agentClient.printHTML(html, printerName);
        console.log(`✓ [Agent] Printed to "${printerName}"`);
        return true;
      }
    } catch (e) {
      console.warn('[PrintService] Agent print failed', e);
    }

    // 3. QZ Tray
    try {
      const service = await getQZService();
      const isOnline = await service.healthCheck();
      if (isOnline) {
        await service.print({
          printer: printerName,
          data: [{ type: 'html', format: 'plain', data: html } as any],
          options: { flavor: 'html' }
        });
        console.log(`✓ [QZ] Printed to "${printerName}"`);
        return true;
      }
    } catch (e) {
      console.warn('[PrintService] QZ print failed', e);
    }

    return false;
  }

  /**
   * Main entry point for receipt printing.
   * Tries silent print first; falls back to iframe print dialog.
   */
  async printHTML(html: string, printerName?: string, options?: { paperWidthMm?: number }): Promise<void> {
    // Resolve printer name from args > registry > localStorage
    const targetPrinter = printerName
      || this.registry?.receiptPrinter
      || localStorage.getItem('printer_receipt')
      || undefined;

    if (targetPrinter) {
      const success = await this.printSilentHTML(html, targetPrinter, options);
      if (success) return;
      console.warn('[PrintService] All silent print channels failed — falling back to iframe dialog');
    }

    // ─── Fallback: Invisible iframe print dialog ──────────────────────
    return new Promise((resolve, reject) => {
      try {
        const iframe = document.createElement('iframe');
        iframe.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0;';
        iframe.src = 'about:blank';
        document.body.appendChild(iframe);

        const doc = iframe.contentWindow?.document || iframe.contentDocument;
        if (!doc) throw new Error('Could not access iframe document');

        doc.open();
        doc.write(html);
        doc.close();

        iframe.onload = () => {
          setTimeout(() => {
            try {
              iframe.contentWindow?.focus();
              iframe.contentWindow?.print();
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
