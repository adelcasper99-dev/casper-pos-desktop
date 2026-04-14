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
import { logger } from './logger';

// ─────────────────────────────────────────────
// Type augmentation for the Electron bridge
// ─────────────────────────────────────────────
declare global {
  interface Window {
    electronAPI?: {
      isElectron: true;
      getPrinters: () => Promise<{ name: string; isDefault: boolean; status: number }[]>;
      printStandard: (html: string, printerName: string, options?: any) => Promise<{ success: boolean; error?: string }>;
      printThermal: (html: string, printerName: string, paperWidthMm: number) => Promise<{ success: boolean; error?: string }>;
      print: (html: string, printerName: string, options?: any) => Promise<{ success: boolean; error?: string }>;
      printThermalReceipt: (html: string, printerName: string, paperWidthMm: number) => Promise<{ success: boolean; error?: string }>;
      saveToPDF: (html: string, filename?: string) => Promise<{ success: boolean; path?: string; error?: string }>;
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
        selectBackupFolder: () => Promise<string | null>;
        getConfig: () => Promise<any>;
        getDbPath: () => Promise<string>;
        saveConfigAndRestart: (path: string) => Promise<boolean>;
        saveBackupConfig: (config: { backupPath: string; backupInterval?: number; maxBackups?: number }) => Promise<{ success: boolean; error?: string }>;
      };
      /** Offline Data Resilience & Maintenance API */
      storage?: {
        saveOfflineData: (data: any) => Promise<{ success: boolean; error?: string }>;
        loadOfflineData: () => Promise<any>;
        getAvailableBackups: () => Promise<{ success: boolean; backups?: any[]; error?: string }>;
        deleteBackup: (filePath: string) => Promise<{ success: boolean; error?: string }>;
        restoreFromBackup: (filePath: string) => Promise<{ success: boolean; error?: string }>;
        exportSupportBundle: () => Promise<{ success: boolean; path?: string; error?: string }>;
        vacuumDatabase: () => Promise<{ success: boolean; error?: string }>;
      };
      /** Auto Updater API */
      updater?: {
        onUpdateAvailable: (cb: (info: any) => void) => () => void;
        onDownloadProgress: (cb: (progress: any) => void) => () => void;
        onUpdateDownloaded: (cb: (info: any) => void) => () => void;
        onError: (cb: (err: any) => void) => () => void;
        installUpdate: () => Promise<void>;
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

  async print(html: string, printerName: string, options?: any): Promise<{ success: boolean; error?: string }> {
    return await window.electronAPI!.printStandard(html, printerName, options ?? {});
  }

  async printThermal(html: string, printerName: string, paperWidthMm: number): Promise<{ success: boolean; error?: string }> {
    return await window.electronAPI!.printThermal(html, printerName, paperWidthMm);
  }
}

const electronChannel = new ElectronPrintChannel();

// ─────────────────────────────────────────────
// Channel 2: Casper Hardware Bridge (Network HTTP API)
// ─────────────────────────────────────────────

class HardwareBridgeClient {
  private getBridgeUrl(): string {
    if (typeof window !== 'undefined') {
      const stored = localStorage.getItem(PRINTER_REGISTRY_KEY);
      if (stored) {
        try {
          const registry = JSON.parse(stored) as PrinterRegistry;
          if (registry.bridgeIpAddress && registry.bridgeIpAddress.trim() !== '') {
            let ip = registry.bridgeIpAddress.trim().replace(/\/$/, '');
            if (!ip.startsWith('http')) ip = `http://${ip}`;
            // If there's only one colon (from 'http://'), it means no port was specified
            if ((ip.match(/:/g) || []).length === 1) {
              ip = `${ip}:4040`;
            }
            return ip;
          }
        } catch (e) {}
      }
    }
    return 'http://localhost:4040';
  }

  async isAvailable(): Promise<boolean> {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 3000);
      const res = await fetch(`${this.getBridgeUrl()}/api/status`, { signal: controller.signal });
      clearTimeout(timeoutId);
      return res.ok;
    } catch (e) {
      return false;
    }
  }

  async getStatus() {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 3000);
      const res = await fetch(`${this.getBridgeUrl()}/api/status`, { signal: controller.signal });
      clearTimeout(timeoutId);
      if (!res.ok) throw new Error('Bridge responding but with error');
      return await res.json();
    } catch (e) {
      throw new Error('Bridge offline');
    }
  }

  async printDocument(html: string, jobType: 'receipt' | 'barcode' | 'a4', printerName?: string) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 15000);
    
    try {
      const res = await fetch(`${this.getBridgeUrl()}/api/print`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ html, jobType, printer: printerName }),
        signal: controller.signal
      });
      clearTimeout(timeoutId);

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Bridge print failed');
      }
    } catch (e: any) {
      clearTimeout(timeoutId);
      throw new Error(e.name === 'AbortError' ? 'Bridge print request timed out' : (e.message || 'Bridge offline'));
    }
  }
}

const hardwareBridge = new HardwareBridgeClient();

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
  private defaultPrinterName = ''; // Resolved to OS default at print time if no registry entry
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
        logger.info('✓ Migrated legacy printer settings to Registry v2');
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
    return this.registry?.labelPrinter || '';
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

    // 2. Hardware Bridge
    try {
      const bridgeStatus = await hardwareBridge.getStatus();
      return {
        online: true,
        version: `Bridge ${bridgeStatus.version || '1.0'}`,
        printers: bridgeStatus.printers?.map((p: any) => p.name) || [],
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

    // 2. Bridge
    try {
      const bridgeStatus = await hardwareBridge.getStatus();
      if (bridgeStatus.printers) return bridgeStatus.printers.map((p: any) => p.name);
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
    const targetPrinter = printerName
      || this.registry?.labelPrinter
      || (electronChannel.isAvailable() ? await electronChannel.getDefaultPrinterName() : null)
      || '';

    // 1. Try Electron IPC first (silent, native — no QZ needed)
    if (electronChannel.isAvailable()) {
      try {
        const { generateLabelHTML } = await import('./label-commands');
        const html = generateLabelHTML(labels, template);
        const widthMm = template?.page?.width ?? 58;
        const success = await this.printSilentHTML(html, targetPrinter, { paperWidthMm: widthMm });
        if (success) {
          logger.info(`✓ [Electron] Printed ${labels.length} label(s) to "${targetPrinter}"`);
          return;
        }
      } catch (err) {
        console.warn('[PrintService] Electron label print failed, falling back to QZ...', err);
      }
    }

    // 2. Fallback: QZ Tray ESC/POS (for non-Electron environments)
    try {
      const service = await getQZService();
      const isOnline = await this.isServerOnline();
      if (!isOnline) throw new Error('QZ_TRAY_OFFLINE');
      if (targetPrinter) await service.findPrinter(targetPrinter);
      const { generateMultipleLabelCommands } = await import('./label-commands');
      const commands = generateMultipleLabelCommands(labels, template);
      await service.printESCPOS(targetPrinter, commands);
      logger.info(`✓ [QZ] Printed ${labels.length} label(s) to "${targetPrinter}"`);
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
      logger.info(`✓ Test print sent to ${targetPrinter}`);
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
   * Optimized thermal printing.
   * Directly uses the high-speed thermal channel in Electron if available.
   */
  async printThermal(html: string, printerName: string, paperWidthMm: number = 80): Promise<boolean> {
    if (this.isElectron()) {
      try {
        const result = await electronChannel.printThermal(html, printerName, paperWidthMm);
        if (result?.success) {
          logger.info(`✓ [Electron-Thermal] Printed to "${printerName}"`);
          return true;
        } else {
          console.warn('[PrintService] Electron thermal reported failure:', result?.error);
        }
      } catch (err) {
        console.warn('[PrintService] Electron thermal channel failed', err);
      }
    }
    // Fallback to generic silent print
    return await this.printSilentHTML(html, printerName, { paperWidthMm });
  }

  isElectron(): boolean {
    return typeof window !== 'undefined' && !!window.electronAPI?.isElectron;
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
        if (!window.electronAPI?.printStandard) {
          console.warn('[PrintService] electronAPI.printStandard is MISSING from bridge');
        } else {
          const result = await electronChannel.print(html, printerName, options);
          if (result?.success) {
            logger.info(`✓ [Electron] Printed to "${printerName}"`);
            return true;
          } else {
            console.warn('[PrintService] Electron standard reported failure:', result?.error);
          }
        }
      } catch (err) {
        console.warn('[PrintService] Electron silent print failed, trying Agent...', err);
      }
    } else {
      console.log('[PrintService] Electron channel not available, checking other channels...');
    }

    // 2. Hardware Bridge
    try {
      const isBridgeAvailable = await hardwareBridge.isAvailable();
      if (isBridgeAvailable) {
        // Determine jobType based on context heuristics
        const paperWidth = options?.paperWidthMm || 80;
        let jobType: 'receipt' | 'barcode' | 'a4' = 'receipt';
        
        if (paperWidth > 150) jobType = 'a4';
        else if (paperWidth < 60) jobType = 'barcode'; // or 58mm thermal, bridge handles both well if routed.

        await hardwareBridge.printDocument(html, jobType, printerName);
        logger.info(`✓ [Bridge] Printed to "${printerName || 'Mapped Target'}"`);
        return true;
      }
    } catch (e) {
      console.warn('[PrintService] Bridge print failed', e);
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
        logger.info(`✓ [QZ] Printed to "${printerName}"`);
        return true;
      } else {
        console.warn('[PrintService] QZ Tray is offline');
      }
    } catch (e) {
      console.warn('[PrintService] QZ print failed', e);
    }

    // 🛡️ FIX: Log detailed error when all channels fail
    logger.error(`❌ [PrintService] All print channels failed. Printer: "${printerName}", Options: ${JSON.stringify(options)}`);
    return false;
  }

  /**
   * Forcefully silent print for POS / Tickets.
   * If silent fail, it returns false rather than showing a dialog.
   */
  async printStrictlySilent(html: string, printerName: string, options?: { paperWidthMm?: number }): Promise<boolean> {
      return await this.printSilentHTML(html, printerName, options);
  }

  async saveToPDF(html: string, filename?: string): Promise<{ success: boolean; path?: string; error?: string }> {
    if (!this.isElectron()) {
      return { success: false, error: 'PDF export is only available in Desktop version' };
    }
    return await window.electronAPI!.saveToPDF(html, filename);
  }

  /**
   * Main entry point for receipt printing.
   * Tries silent print first; falls back to iframe print dialog.
   */
  async printHTML(html: string, printerName?: string, options?: { paperWidthMm?: number, strictlySilent?: boolean }): Promise<void> {
    // Resolve printer name from args > registry > localStorage
    const registry = this.getRegistry();
    const targetPrinter = printerName
      || (options?.paperWidthMm && options.paperWidthMm > 100 ? registry?.a4Printer : registry?.thermalPrinter)
      || registry?.receiptPrinter
      || localStorage.getItem('printer_receipt')
      || undefined;

    // 🛡️ FIX: Add diagnostic logging
    console.log('[PrintService] printHTML called:', { 
      printerName, 
      targetPrinter, 
      isElectron: this.isElectron(),
      strictlySilent: options?.strictlySilent,
      paperWidthMm: options?.paperWidthMm
    });

    if (targetPrinter) {
      // 🛡️ HARDENING: Added a safety race to ensure the frontend doesn't hang if IPC doesn't return
      const printPromise = this.printSilentHTML(html, targetPrinter, options);
      const timeoutPromise = new Promise<boolean>((resolve) => setTimeout(() => resolve(false), 20000));

      const success = await Promise.race([printPromise, timeoutPromise]);
      if (success) {
        console.log('[PrintService] Print succeeded');
        return;
      }
      console.warn('[PrintService] Silent print timed out or failed');
    } else {
      console.warn('[PrintService] No target printer resolved');
    }

    // 🛡️ [Electron/Strict] BLOCK FALLBACK DIALOG
    if (this.isElectron() || options?.strictlySilent) {
        if (!targetPrinter) {
             logger.error('❌ [PrintService] No printer specified for silent print. Aborting to avoid dialog.');
        } else {
             logger.error('❌ [PrintService] Silent print failed for ' + targetPrinter + '. Aborting fallback.');
        }
        return;
    }

    // ─── Fallback: Invisible iframe print dialog (Only for Web/Fallback) ──────────────────────
    console.log('[PrintService] Falling back to browser print dialog...');
    return new Promise((resolve, reject) => {
      try {
        const iframe = document.createElement('iframe');
        iframe.style.cssText = 'position:absolute;top:-10000px;left:-10000px;width:1px;height:1px;visibility:hidden;pointer-events:none;';
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
