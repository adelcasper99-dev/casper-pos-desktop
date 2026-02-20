/**
 * QZ Tray Service (Client-Only with proper Next.js dynamic import)
 * This file must ONLY be imported dynamically with ssr: false
 */

import qz from 'qz-tray';
import { QZ_CERTIFICATE } from './qz-certs';

export interface Printer {
  name: string;
  driver?: string;
}

export interface PrintConfig {
  printer: string;
  data: string[] | Uint8Array[];
  options?: {
    encoding?: string;
    flavor?: string;
  };
}

export interface QZStatus {
  connected: boolean;
  version?: string;
  printers?: Printer[];
}

/**
 * QZ Tray Service Class
 */
class QZTrayService {
  private isActive = false;

  /**
   * Connect to QZ Tray via WebSocket
   */
  async connect(): Promise<void> {
    if (this.isActive || qz.websocket.isActive()) {
      this.isActive = true;
      return;
    }

    try {
      // Configure security for silent printing
      qz.security.setCertificatePromise((resolve: (cert: string) => void) => {
        resolve(QZ_CERTIFICATE);
      });

      qz.security.setSignatureAlgorithm("SHA512"); // Since 2.1
      qz.security.setSignaturePromise((toSign: string) => {
        return function (resolve: (sig: string) => void, reject: (err: any) => void) {
          fetch('/api/qz/sign', {
            method: 'POST',
            headers: { 'Content-Type': 'text/plain' },
            body: toSign,
          })
            .then(async res => {
              if (!res.ok) {
                const errorText = await res.text();
                throw new Error(`Signing failed: ${errorText || res.statusText}`);
              }
              return res.text();
            })
            .then(signature => resolve(signature.trim()))
            .catch(err => {
              console.error('QZ Signing Error:', err);
              reject(err);
            });
        };
      });

      await qz.websocket.connect();
      this.isActive = true;
      console.log('✓ QZ Tray connected');
    } catch (error: any) {
      this.isActive = false;
      throw new Error(
        `QZ Tray connection failed. Please ensure QZ Tray is running.\n\nError: ${error.message}`
      );
    }
  }

  /**
   * Disconnect from QZ Tray
   */
  async disconnect(): Promise<void> {
    if (qz.websocket.isActive()) {
      await qz.websocket.disconnect();
      this.isActive = false;
      console.log('✓ QZ Tray disconnected');
    }
  }

  /**
   * Check if currently connected
   */
  isConnected(): boolean {
    return this.isActive && qz.websocket.isActive();
  }

  /**
   * Get QZ Tray version
   */
  async getVersion(): Promise<string> {
    await this.connect();
    return qz.api.getVersion();
  }

  /**
   * Get list of available printers
   */
  async getPrinters(): Promise<Printer[]> {
    await this.connect();
    const printerNames = await qz.printers.find();
    return printerNames.map((name: string) => ({ name }));
  }

  /**
   * Find specific printer by name
   */
  async findPrinter(name: string): Promise<Printer> {
    await this.connect();

    try {
      const printerName = await qz.printers.find(name);

      if (!printerName || (Array.isArray(printerName) && printerName.length === 0)) {
        throw new Error(`Printer "${name}" not found`);
      }

      return {
        name: Array.isArray(printerName) ? printerName[0] : printerName,
      };
    } catch (error: any) {
      throw new Error(`Printer "${name}" not found. Please check the printer name in Settings.`);
    }
  }

  /**
   * Get default printer
   */
  async getDefaultPrinter(): Promise<Printer> {
    await this.connect();
    const name = await qz.printers.getDefault();
    return { name };
  }

  /**
   * Print raw data to printer
   */
  async print(config: PrintConfig): Promise<void> {
    await this.connect();

    const printConfig = qz.configs.create(config.printer, {
      encoding: config.options?.encoding || 'UTF-8',
      flavor: config.options?.flavor || 'plain',
      margins: 0, // Set default margins to 0 to rely on CSS
    });

    try {
      await qz.print(printConfig, config.data);
      console.log(`✓ Printed to ${config.printer}`);
    } catch (error: any) {
      throw new Error(`Print failed: ${error.message}`);
    }
  }

  /**
   * Print ESC/POS commands
   */
  async printESCPOS(printerName: string, commands: string[]): Promise<void> {
    // Convert ESC/POS commands to hex format for QZ Tray
    const hexData = commands.map(cmd => {
      // Convert string to array of char codes, then to hex string
      return Array.from(cmd)
        .map(char => char.charCodeAt(0).toString(16).padStart(2, '0'))
        .join('');
    });

    await this.print({
      printer: printerName,
      data: hexData,
      options: {
        flavor: 'hex',  // Use hex flavor for raw ESC/POS commands
      },
    });
  }

  /**
   * Get status of QZ Tray connection and printers
   */
  async getStatus(): Promise<QZStatus> {
    try {
      await this.connect();
      const version = await this.getVersion();
      const printers = await this.getPrinters();

      return {
        connected: true,
        version,
        printers,
      };
    } catch (error) {
      return {
        connected: false,
      };
    }
  }

  /**
   * Health check - verify QZ Tray is accessible
   */
  async healthCheck(): Promise<boolean> {
    try {
      await this.connect();
      return true;
    } catch (error) {
      return false;
    }
  }
}

// Singleton instance
export const qzTrayService = new QZTrayService();
