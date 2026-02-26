import { getSession } from "@/lib/auth";
import { PERMISSIONS } from "@/lib/permissions";
import { AppError, ErrorCodes } from "@/lib/errors";
import { ZodError } from "zod";
import { verifyCSRFToken } from "@/lib/csrf";
import { logger } from "@/lib/logger";
import { serialize } from "@/lib/serialization";

// ActionResponse now flattens the data object for easier access
// e.g., result.message instead of result.data.message
// Uses Partial<T> so error cases don't require T properties
type ActionResponse<T> = {
    success: boolean;
    error?: string;
    code?: string;
    message?: string; // Common usage
} & Partial<T>; // Partial makes all T properties optional

type ActionOptions = {
    permission?: string; // Standard permission string
    role?: string;       // Or explicit role check
    requireCSRF?: boolean; // Require CSRF token validation (default: true for mutations)
};

/**
 * Secure Action Wrapper
 * Standardizes Auth, Permission Checks, Error Handling, and Serialization.
 */
export function secureAction<T, A extends any[]>(
    action: (...args: A) => Promise<T>,
    options: ActionOptions = {}
): (...args: A) => Promise<ActionResponse<T>> {
    return async (...args: A) => {
        try {
            // 1. Auth Check

            const session = await getSession();
            if (!session?.user) {
                console.error("[SecureAction ERROR] Session or user missing:", {
                    action: action.name,
                    hasSession: !!session,
                    hasUser: !!session?.user
                });
                const { getTranslations } = await import('@/lib/i18n-mock');
                const t = await getTranslations('Auth');
                throw new AppError(ErrorCodes.UNAUTHORIZED, t('error') || "Unauthorized");
            }

            const user = session.user;

            // 2. CSRF Protection (for state-changing operations)
            if (options.requireCSRF !== false) {
                // Extract CSRF token from args (typically first arg or FormData)
                let csrfToken: string | undefined;

                if (args.length > 0) {
                    // Search all arguments for the CSRF token
                    for (const arg of args) {
                        if (arg instanceof FormData) {
                            const val = arg.get('csrfToken')?.toString();
                            if (val) {
                                csrfToken = val;
                                break;
                            }
                        } else if (typeof arg === 'object' && arg !== null && 'csrfToken' in arg) {
                            csrfToken = (arg as any).csrfToken;
                            if (csrfToken) break;
                        }
                    }
                }

                const isValid = await verifyCSRFToken(csrfToken);

                if (!isValid) {
                    logger.warn('CSRF validation failed', {
                        user: user.username,
                        userId: user.id,
                        hasToken: !!csrfToken,
                        tokenPreview: csrfToken?.substring(0, 8) + '...',
                        timestamp: new Date().toISOString()
                    });

                    const { getTranslations } = await import('@/lib/i18n-mock');
                    const t = await getTranslations('SystemMessages.Errors');

                    throw new AppError(
                        ErrorCodes.VALIDATION_ERROR,
                        t('csrfInvalid')
                    );
                }
            }

            // 3. Permission Check
            if (options.permission) {
                // Assuming user.permissions is an array of strings
                // V-03 fix: never check role name string (can be spoofed).
                // ADMIN users get permissions=['*'] from getSession() → role.permissions parsing.
                const hasPermission =
                    user.permissions?.includes(options.permission) ||
                    user.permissions?.includes('*');
                if (!hasPermission) {
                    logger.warn("Access Denied: Insufficient permissions", {
                        userId: user.id,
                        username: user.username,
                        requiredPermission: options.permission,
                        userPermissions: user.permissions,
                        role: user.role
                    });
                    const { getTranslations } = await import('@/lib/i18n-mock');
                    const t = await getTranslations('SystemMessages.Errors');
                    throw new AppError(ErrorCodes.FORBIDDEN, t('forbidden'));
                }
            }

            // 4. Execute Action
            const result = await action(...args);

            // 5. Return Success - spread properties for direct access
            return serialize({ success: true, ...result }) as ActionResponse<T>;

        } catch (error: any) {
            logger.error("SecureAction Error", error);
            // Handle AppError (expected errors)
            if (error instanceof AppError) {
                return { success: false, error: error.message, code: error.code } as ActionResponse<T>;
            }

            // Handle Zod Validation Errors
            if (error instanceof ZodError) {
                // We will try to map common Zod errors to Arabic here if possible, 
                // but since this is generic, we'll return the message. 
                // The client should ideally handle translation of validation errors or we fix them in Zod map.
                const message = error.issues.map((e: any) => e.message).join(", ");
                return { success: false, error: message, code: ErrorCodes.VALIDATION_ERROR } as ActionResponse<T>;
            }

            // Handle Prisma Unique Constraint
            if (error.code === 'P2002') {
                const { getTranslations } = await import('@/lib/i18n-mock');
                const t = await getTranslations('SystemMessages.Validation');
                return { success: false, error: t('unique'), code: ErrorCodes.VALIDATION_ERROR } as ActionResponse<T>;
            }

            // Default Generic Error
            const { getTranslations } = await import('@/lib/i18n-mock');
            const t = await getTranslations('SystemMessages.Errors');
            const message = error.message || t('generic');
            return { success: false, error: message, code: ErrorCodes.INTERNAL_ERROR } as ActionResponse<T>;
        }
    };
}
