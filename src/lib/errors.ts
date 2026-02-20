export class AppError extends Error {
    constructor(
        public code: ErrorCode, 
        public message: string, 
        public metadata?: Record<string, any>
    ) {
        super(message);
        this.name = 'AppError';
    }
}

export const ErrorCodes = {
    UNAUTHORIZED: 'UNAUTHORIZED',
    FORBIDDEN: 'FORBIDDEN',
    NOT_FOUND: 'NOT_FOUND',
    VALIDATION_ERROR: 'VALIDATION_ERROR',
    INVENTORY_ERROR: 'INVENTORY_ERROR', // Stock issues
    FINANCIAL_ERROR: 'FINANCIAL_ERROR', // Accounting sync, etc.
    INTERNAL_ERROR: 'INTERNAL_ERROR'
} as const;

export type ErrorCode = typeof ErrorCodes[keyof typeof ErrorCodes];
