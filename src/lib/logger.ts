type LogLevel = 'debug' | 'info' | 'warn' | 'error';

interface LogContext {
  userId?: string;
  action?: string;
  duration?: number;
  [key: string]: any;
}

class Logger {
  private log(level: LogLevel, message: string, context?: LogContext) {
    const logEntry = {
      level,
      message,
      timestamp: new Date().toISOString(),
      environment: process.env.NODE_ENV,
      ...context,
    };

    if (process.env.NODE_ENV === 'production') {
      // Structured JSON for log aggregation (CloudWatch, Datadog, etc.)
      console.log(JSON.stringify(logEntry));
    } else {
      // Pretty print for development
      const contextStr = context ? JSON.stringify(context, null, 2) : '';
      console[level](
        `[${level.toUpperCase()}] ${message}`,
        contextStr || ''
      );
    }
  }

  debug(message: string, context?: LogContext) {
    if (process.env.NODE_ENV !== 'production') {
      this.log('debug', message, context);
    }
  }

  info(message: string, context?: LogContext) {
    this.log('info', message, context);
  }

  warn(message: string, context?: LogContext) {
    this.log('warn', message, context);
  }

  error(message: string, context?: LogContext) {
    this.log('error', message, context);
  }

  // Performance logging helper
  performance(action: string, startTime: number, context?: LogContext) {
    const duration = Date.now() - startTime;
    this.info(`${action} completed`, { ...context, duration });
  }
}

export const logger = new Logger();
