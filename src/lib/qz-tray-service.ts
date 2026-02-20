/**
 * QZ Tray Service (CDN-Based Version)
 * Loads QZ Tray from CDN for better browser compatibility
 */

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

// 🛡️ Added specific interfaces for QZ library objects
export interface QZInstance {
  websocket: {
    isActive: () => boolean;
    connect: () => Promise<void>;
    disconnect: () => Promise<void>;
  };
  security: {
    setCertificatePromise: (cb: (resolve: (cert: string) => void) => void) => void;
    setSignatureAlgorithm: (algo: string) => void;
    setSignaturePromise: (cb: (toSign: string) => (resolve: (sig: string) => void, reject: (err: any) => void) => void) => void;
  };
  api: {
    getVersion: () => Promise<string>;
  };
  printers: {
    find: (name?: string) => Promise<string | string[]>;
    getDefault: () => Promise<string>;
  };
  configs: {
    create: (printer: string, options: any) => any;
  };
  print: (config: any, data: any[]) => Promise<void>;
}

/**
 * Load QZ Tray from CDN
 */
async function loadQZ(): Promise<QZInstance> {
  if (typeof window === 'undefined') {
    throw new Error('QZ Tray can only be used in the browser');
  }

  // Check if already loaded
  if ((window as any).qz) {
    return (window as any).qz;
  }

  // Load from CDN
  return new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = 'https://cdn.jsdelivr.net/npm/qz-tray@2.2.5/qz-tray.min.js';
    script.async = true;

    script.onload = () => {
      if ((window as any).qz) {
        console.log('✓ QZ Tray loaded from CDN');
        resolve((window as any).qz);
      } else {
        reject(new Error('QZ Tray script loaded but qz object not found'));
      }
    };

    script.onerror = () => {
      reject(new Error('Failed to load QZ Tray from CDN'));
    };

    document.head.appendChild(script);
  });
}

/**
 * QZ Tray Service Class
 */
// Import the certificate from the shared module
import { QZ_CERTIFICATE } from './qz-certs';


class QZTrayService {
  private isActive = false;
  private qz: QZInstance | null = null;

  /**
   * Initialize and get QZ instance
   */
  private async getQZ() {
    if (!this.qz) {
      this.qz = await loadQZ();
    }
    return this.qz;
  }



  /**
   * Connect to QZ Tray via WebSocket
   */
  async connect(): Promise<void> {
    const qz = await this.getQZ();

    if (this.isActive || qz.websocket.isActive()) {
      this.isActive = true;
      return;
    }

    // Configure Security (Certificate & Signing)
    qz.security.setCertificatePromise((resolve: (cert: string) => void) => {
      resolve(QZ_CERTIFICATE);
    });

    qz.security.setSignatureAlgorithm("SHA512"); // Since 2.1
    qz.security.setSignaturePromise((toSign: string) => {
      return (resolve: (sig: string) => void, reject: (err: any) => void) => {
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

    try {
      await qz.websocket.connect();
      this.isActive = true;
      console.log('✓ QZ Tray connected');
    } catch (error: any) {
      this.isActive = false;
      console.error('QZ Tray connection error:', error);

      // Determine user-friendly error message
      let msg = 'QZ Tray connection failed.';
      if (error.message?.includes('refused')) {
        msg = 'QZ Tray is not running. Please start the QZ Tray application.';
      } else if (error.message?.includes('denied')) {
        msg = 'QZ Tray connection denied. Please check your firewall or QZ settings.';
      }

      throw new Error(`${msg}\n\nTechnical Details: ${error.message}`);
    }
  }

  /**
   * Disconnect from QZ Tray
   */
  async disconnect(): Promise<void> {
    const qz = await this.getQZ();

    if (qz.websocket.isActive()) {
      await qz.websocket.disconnect();
      this.isActive = false;
      console.log('✓ QZ Tray disconnected');
    }
  }

  /**
   * Check if currently connected (fast check)
   */
  async isIdeallyConnected(): Promise<boolean> {
    if (!this.isActive) return false;
    try {
      const qz = await this.getQZ();
      return qz.websocket.isActive();
    } catch {
      return false;
    }
  }

  /**
   * Check if currently connected (thorough check)
   */
  async isConnected(): Promise<boolean> {
    try {
      const qz = await this.getQZ();
      return this.isActive && qz.websocket.isActive();
    } catch {
      return false;
    }
  }

  /**
   * Get QZ Tray version
   */
  async getVersion(): Promise<string> {
    const qz = await this.getQZ();
    await this.connect();
    return qz.api.getVersion();
  }

  /**
   * Get list of available printers
   */
  async getPrinters(): Promise<Printer[]> {
    const qz = await this.getQZ();
    await this.connect();
    const found = await qz.printers.find();
    const printerNames = Array.isArray(found) ? found : [found];
    return printerNames.map((name: string) => ({ name }));
  }

  /**
   * Find specific printer by name
   */
  async findPrinter(name: string): Promise<Printer> {
    const qz = await this.getQZ();
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
    const qz = await this.getQZ();
    await this.connect();
    const name = await qz.printers.getDefault();
    return { name };
  }

  /**
   * Print raw data to printer
   */
  async print(config: PrintConfig): Promise<void> {
    const qz = await this.getQZ();
    await this.connect();

    const printConfig = qz.configs.create(config.printer, {
      encoding: config.options?.encoding || 'UTF-8',
      flavor: config.options?.flavor || 'plain',
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
    await this.print({
      printer: printerName,
      data: commands,
      options: {
        flavor: 'plain',
        encoding: 'UTF-8',
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
      console.error('QZ Tray status check failed:', error);
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
      console.error('QZ Tray health check failed:', error);
      return false;
    }
  }
}

// Singleton instance
export const qzTrayService = new QZTrayService();
