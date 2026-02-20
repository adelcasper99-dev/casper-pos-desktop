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
            // 1. Auth Check
            const session = await getSession();
            if (!session?.user) {
                throw new AppError(ErrorCodes.UNAUTHORIZED, "Unauthorized: Please log in.");
            }

            const user = session.user;

            // 2. CSRF Protection (for state-changing operations)
            if (options.requireCSRF !== false) {
                // Extract CSRF token from args (typically first arg or FormData)
                let csrfToken: string | undefined;

                if (args.length > 0) {
                    // Search all arguments for the token
                    console.log("[SecureAction] inspecting args:", JSON.stringify(args, null, 2));
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
                    // Enhanced logging for debugging
                    logger.warn('CSRF validation failed', {
                        user: user.username,
                        userId: user.id,
                        hasToken: !!csrfToken,
                        tokenPreview: csrfToken?.substring(0, 8) + '...',
                        timestamp: new Date().toISOString()
                    });

                    throw new AppError(
                        ErrorCodes.VALIDATION_ERROR,
                        "Security token expired or invalid. Please refresh the page and try again."
                    );
                }
            }

            // 3. Permission Check
            if (options.permission) {
                // Assuming user.permissions is an array of strings
                const hasPermission = user.permissions?.includes(options.permission) || user.role === 'ADMIN';
                if (!hasPermission) {
                    logger.warn("Access Denied: Insufficient permissions", {
                        userId: user.id,
                        username: user.username,
                        requiredPermission: options.permission,
                        userPermissions: user.permissions,
                        role: user.role
                    });
                    throw new AppError(ErrorCodes.FORBIDDEN, "Forbidden: Insufficient permissions.");
                }
            }

            // 4. Execute Action
            const result = await action(...args);

            // 5. Return Success - spread properties for direct access
            return serialize({ success: true, ...result }) as ActionResponse<T>;

        } catch (error: any) {
            console.error("SecureAction Error:", error);

            // Handle Known App Errors
            if (error instanceof AppError) {
                return { success: false, error: error.message, code: error.code } as ActionResponse<T>;
            }

            // Handle Zod Validation Errors
            if (error instanceof ZodError) {
                const message = error.issues.map((e: any) => e.message).join(", ");
                return { success: false, error: message, code: ErrorCodes.VALIDATION_ERROR } as ActionResponse<T>;
            }

            // Handle Prisma Unique Constraint
            if (error.code === 'P2002') {
                return { success: false, error: "Duplicate entry found.", code: ErrorCodes.VALIDATION_ERROR } as ActionResponse<T>;
            }

            // Default Generic Error
            const message = error.message || "An unexpected error occurred.";
            return { success: false, error: message, code: ErrorCodes.INTERNAL_ERROR } as ActionResponse<T>;
        }
    };
}
