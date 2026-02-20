
import { prisma } from '@/lib/prisma';

export const PHONE_REGEX = /^\d{11}$/;
export const PHONE_ERROR_MSG = "Phone number must be exactly 11 digits";

/**
 * Checks if a phone number is globally unique across User, Supplier, and Customer tables.
 * Returns true if the phone is unique (not used).
 * Returns false if the phone is already in use.
 * 
 * @param phone The phone number to check
 * @param excludeType The type of entity to exclude from the check (for updates)
 * @param excludeId The ID of the entity to exclude (for updates)
 */
export async function checkGlobalPhoneUniqueness(
    phone: string,
    excludeType?: 'USER' | 'SUPPLIER' | 'CUSTOMER',
    excludeId?: string
): Promise<{ unique: boolean, usedBy?: 'USER' | 'SUPPLIER' | 'CUSTOMER', entityId?: string, entityName?: string }> {

    if (!phone) return { unique: true };

    // 1. Check Users
    if (excludeType !== 'USER' || !excludeId) {
        const user = await prisma.user.findFirst({
            where: {
                phone,
                NOT: excludeType === 'USER' && excludeId ? { id: excludeId } : undefined
            },
            select: { id: true, name: true, username: true }
        });
        if (user) return { unique: false, usedBy: 'USER', entityId: user.id, entityName: user.name || user.username };
    }

    // 2. Check Suppliers
    if (excludeType !== 'SUPPLIER' || !excludeId) {
        const supplier = await prisma.supplier.findFirst({
            where: {
                phone,
                NOT: excludeType === 'SUPPLIER' && excludeId ? { id: excludeId } : undefined
            },
            select: { id: true, name: true }
        });
        if (supplier) return { unique: false, usedBy: 'SUPPLIER', entityId: supplier.id, entityName: supplier.name };
    }

    // 3. Check Customers
    // Note: Customers might share phones in legacy data, but we want to enforce 1-to-1 now.
    // However, if we are creating a Ticket, we might "link" to an existing customer, so this check
    // is primarily for creating a NEW profile. 
    if (excludeType !== 'CUSTOMER' || !excludeId) {
        const customer = await prisma.customer.findFirst({
            where: {
                phone,
                NOT: excludeType === 'CUSTOMER' && excludeId ? { id: excludeId } : undefined
            },
            select: { id: true, name: true }
        });
        if (customer) return { unique: false, usedBy: 'CUSTOMER', entityId: customer.id, entityName: customer.name };
    }

    return { unique: true };
}
