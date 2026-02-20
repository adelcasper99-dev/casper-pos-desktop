import { Decimal } from "@prisma/client/runtime/library";

/**
 * Generic helper to serialize Prisma objects for the frontend.
 * Converts Decimal to numbers and Date to standard ISO strings (if needed, though Next.js handles Dates okay).
 * recursively walks arrays and objects.
 */
export function serialize<T>(obj: T): any {
    if (obj === null || obj === undefined) {
        return obj;
    }

    if (typeof obj !== "object") {
        return obj;
    }

    // Handle Date
    if (obj instanceof Date) {
        return obj;
    }

    // Handle Decimal (Aggressive)
    const isDecimal = obj instanceof Decimal ||
        (obj as any).constructor?.name === 'Decimal' ||
        ('toNumber' in obj && typeof (obj as any).toNumber === 'function') ||
        ('s' in obj && 'e' in obj && 'd' in obj);

    if (isDecimal) {
        try {
            return typeof (obj as any).toNumber === 'function' ? (obj as any).toNumber() : Number(obj);
        } catch (e) {
            return Number(obj); // Fallback
        }
    }

    // Handle Array
    if (Array.isArray(obj)) {
        return obj.map((item) => serialize(item));
    }

    // Handle Object
    const result: any = {};
    for (const key in obj) {
        // We removed hasOwnProperty check to be safe with all enumerable properties
        result[key] = serialize((obj as any)[key]);
    }
    return result;
}
