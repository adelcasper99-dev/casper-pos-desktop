import { Decimal } from '@prisma/client/runtime/library';

/**
 * Recursively serialize Prisma objects for Client Components
 * 
 * Converts:
 * - Decimal -> number
 * - Date -> ISO string
 * - BigInt -> number
 * - undefined -> null
 * 
 * Usage:
 * ```ts
 * const tickets = await prisma.ticket.findMany();
 * const serialized = serializePrisma(tickets);
 * return <ClientComponent data={serialized} />
 * ```
 */
export function serializePrisma<T>(data: T): T {
    if (data === null || data === undefined) {
        return null as T;
    }

    // Handle Decimal
    if (data instanceof Decimal) {
        return data.toNumber() as T;
    }

    // Handle Date
    if (data instanceof Date) {
        return data.toISOString() as T;
    }

    // Handle BigInt
    if (typeof data === 'bigint') {
        return Number(data) as T;
    }

    // Handle Arrays
    if (Array.isArray(data)) {
        return data.map(item => serializePrisma(item)) as T;
    }

    // Handle Objects
    if (typeof data === 'object') {
        const serialized: any = {};
        for (const key in data) {
            if (Object.prototype.hasOwnProperty.call(data, key)) {
                serialized[key] = serializePrisma(data[key]);
            }
        }
        return serialized as T;
    }

    // Primitive types
    return data;
}

/**
 * Type-safe wrapper for Prisma queries
 * Automatically serializes the result
 * 
 * Usage:
 * ```ts
 * const tickets = await safeQuery(() => prisma.ticket.findMany());
 * // tickets now have Decimals converted to numbers
 * ```
 */
export async function safeQuery<T>(query: () => Promise<T>): Promise<T> {
    const result = await query();
    return serializePrisma(result);
}
