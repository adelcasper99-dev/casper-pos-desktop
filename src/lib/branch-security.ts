

import { getSession } from "@/lib/auth";
import { PERMISSIONS, hasPermission } from "@/lib/permissions";
import { redirect } from "next/navigation";

export async function checkBranchAccess(branchId: string) {
    const session = await getSession();
    const user = session?.user;

    if (!user) {
        redirect("/login" as any);
        return; // TypeScript needs this to know user is defined below
    }

    // Admins or HQ can access all
    if (user.role === 'ADMIN' || hasPermission(user.permissions, PERMISSIONS.MANAGE_SETTINGS)) {
        return true;
    }

    // Branch Managers/Staff can only access their own branch
    if (user.branchId !== branchId) {
        // Redirect to their own branch if they try to access another
        // Or throw forbidden
        redirect(`/branches/${user.branchId}` as any);
    }

    return true;
}
