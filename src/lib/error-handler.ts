// lib/error-handler.ts
/**
 * Centralized error handling and logging
 */

import { trackError } from './metrics';

export class AppError extends Error {
    constructor(
        message: string,
        public code: string,
        public statusCode: number = 500,
        public context?: Record<string, any>
    ) {
        super(message);
        this.name = 'AppError';
    }
}

export function logError(error: Error, context?: Record<string, any>) {
    // Track in metrics
    trackError(error);
    
    // Log to console with context
    console.error('[ERROR]', {
        name: error.name,
        message: error.message,
        stack: process.env.NODE_ENV === 'development' ? error.stack : undefined,
        context,
        timestamp: new Date().toISOString(),
    });
    
    // TODO: In production, send to external error tracking service
    // if (process.env.NODE_ENV === 'production' && process.env.SENTRY_DSN) {
    //     Sentry.captureException(error, { extra: context });
    // }
}

export function handleApiError(error: unknown) {
    if (error instanceof AppError) {
        return {
            error: error.message,
            code: error.code,
            statusCode: error.statusCode,
        };
    }
    
    if (error instanceof Error) {
        logError(error);
        return {
            error: process.env.NODE_ENV === 'development' 
                ? error.message 
                : 'Internal server error',
            code: 'INTERNAL_ERROR',
            statusCode: 500,
        };
    }
    
    return {
        error: 'Unknown error occurred',
        code: 'UNKNOWN_ERROR',
        statusCode: 500,
    };
}

export function safeAsync<T>(
    fn: () => Promise<T>,
    errorMessage: string = 'Operation failed'
): Promise<T> {
    return fn().catch((error) => {
        logError(error, { operation: errorMessage });
        throw new AppError(errorMessage, 'ASYNC_ERROR', 500);
    });
}
