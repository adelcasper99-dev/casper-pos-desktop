export const logger = {
  info: (message: string, context?: any) => {
    const timestamp = new Date().toISOString();
    console.log(`[${timestamp}] [INFO] ${message}`, context || '');
    // In a production app, we would also write to a local file or send to a log server.
  },
  error: (message: string, error?: any) => {
    const timestamp = new Date().toISOString();
    console.error(`[${timestamp}] [ERROR] ${message}`, error || '');
    if (typeof window !== 'undefined' && (window as any).electron) {
      // Future: Send to main process to write to filesystem log.
    }
  },
  warn: (message: string, context?: any) => {
    const timestamp = new Date().toISOString();
    console.warn(`[${timestamp}] [WARN] ${message}`, context || '');
  }
};
