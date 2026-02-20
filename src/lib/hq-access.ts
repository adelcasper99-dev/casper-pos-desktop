

import { User } from "@prisma/client";

/**
 * Type-safe helper to check if a user can access a specific HQ center.
 * 
 * Access Logic:
 * 1. Global Admin -> Full access to all HQs in the system.
 * 2. Scoped User -> Access only if the HQ ID exists in their managedHQIds array.
 * 
 * @param user The user object (usually from session/prisma)
 * @param hqId The ID of the HQ center to check access for
 * @returns boolean indicating if access is granted
 */
export function canAccessHQ(user: User | null | undefined, hqId: string): boolean {
    if (!user) return false;

    // 1. Global Admin Priority Bypass
    // Users marked as global admins have unrestricted access to all HQs.
    if (user.isGlobalAdmin) return true;

    // 2. Scoped Managed HQs
    // Users can be assigned specific HQs to manage.
    if (user.managedHQIds) {
        try {
            const ids = JSON.parse(user.managedHQIds);
            if (Array.isArray(ids) && ids.includes(hqId)) {
                return true;
            }
        } catch (e) {
            // Ignore parsing errors
        }
    }
    return false;
}
