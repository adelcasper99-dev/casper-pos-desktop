declare module 'qz-tray' {
  export interface QZConfig {
    create(printer: string, options?: any): QZConfig;
    setPrinter(printer: string): void;
  }

  export interface QZPrint {
    print(config: QZConfig, data: any[]): Promise<void>;
  }

  export interface QZPrinters {
    find(printerName?: string): Promise<string[]>;
    getDefault(): Promise<string>;
    details(printer: string): Promise<any>;
  }

  export interface QZAPI {
    setSha256Type(type: (data: string) => string): void;
    setPromiseType(promiseConstructor: PromiseConstructor): void;
    getVersion(): string;
  }

  export interface QZ {
    websocket: {
      connect(config?: { host?: string; port?: number; usingSecure?: boolean }): Promise<void>;
      disconnect(): Promise<void>;
      isActive(): boolean;
    };
    configs: QZConfig;
    print: QZPrint['print'];
    printers: QZPrinters;
    security: {
      setCertificatePromise(promise: (resolve: (cert: string) => void, reject: (err: any) => void) => void): void;
      setSignatureAlgorithm(algorithm: string): void;
      setSignaturePromise(promise: (toSign: string) => (resolve: (sig: string) => void, reject: (err: any) => void) => void): void;
    };
    api: QZAPI;
    VERSION: string;
  }

  const qz: QZ;
  export default qz;
}
