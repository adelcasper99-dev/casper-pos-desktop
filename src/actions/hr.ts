"use server";

import { prisma } from "@/lib/prisma"
import { secureAction } from "@/lib/safe-action";
import { PERMISSIONS, hasPermission } from "@/lib/permissions";
import { getSession } from "@/lib/auth";

const db = prisma as any;

export const getStaffDirectory = secureAction(async () => {
    const users = await db.user.findMany({
        where: { deletedAt: null },
        include: {
            role: true,
            branch: true,
            sessions: {
                where: { expiresAt: { gt: new Date() } },
                take: 1
            }
        },
        orderBy: { name: 'asc' }
    });

    const staffData = users.map((u: any) => ({
        id: u.id,
        name: u.name || u.username,
        username: u.username,
        role: u.role?.name || "Staff",
        branch: u.branch?.name || "Main",
        salary: u.salary ? Number(u.salary) : 0,
        status: u.sessions.length > 0 ? 'ONLINE' : 'OFFLINE',
        clockInTime: u.sessions.length > 0 ? u.sessions[0].createdAt : null, // Approx
        avatarSeed: u.username
    }));

    return { data: staffData };
}, { permission: PERMISSIONS.HR_VIEW_ATTENDANCE, requireCSRF: false });

/**
 * Fetches users with all fields required by the attendance components:
 * monthlyOffDays, salary, roleStr — for DailyAttendance & EmployeeAttendanceDetail
 */
export async function getUsersForAttendancePage() {
    const session = await getSession();
    if (!session?.user) throw new Error("Unauthorized");

    const hasAccess = hasPermission(session.user.permissions, PERMISSIONS.HR_VIEW_ATTENDANCE) || session.user.role === "ADMIN";
    if (!hasAccess) throw new Error("Forbidden");

    const users = await db.user.findMany({
        where: { deletedAt: null },
        include: { role: true },
        orderBy: { name: 'asc' }
    });

    return users.map((u: any) => ({
        id: u.id,
        name: u.name || u.username,
        roleStr: u.role?.name || "Staff",
        salary: u.salary ? Number(u.salary) : 0,
        monthlyOffDays: u.monthlyOffDays ?? 4,
    }));
}

export async function getBranchesAndRoles() {
    const session = await getSession();
    if (!session?.user) throw new Error("Unauthorized");

    const branches = await db.branch.findMany({ where: { deletedAt: null } });
    const roles = await db.role.findMany();

    return {
        branches: branches.map((b: any) => ({ id: b.id, name: b.name })),
        roles: roles.map((r: any) => ({ id: r.id, name: r.name }))
    };
}

export async function updateEmployeeData(userId: string, data: {
    name?: string;
    roleId?: string;
    branchId?: string;
    salary?: number;
    monthlyOffDays?: number;
}) {
    const session = await getSession();
    if (!session?.user) return { success: false, error: "Unauthorized" };

    const isAdmin = session.user.role === "ADMIN" || session.user.role === "مدير النظام" || session.user.role === "المالك";
    const canManageUsers = hasPermission(session.user.permissions, PERMISSIONS.MANAGE_USERS);

    if (!isAdmin && !canManageUsers) {
        return { success: false, error: "Forbidden" };
    }

    try {
        const updateData: any = {
            name: data.name,
            roleId: (data.roleId && data.roleId !== "") ? data.roleId : null,
            branchId: (data.branchId && data.branchId !== "") ? data.branchId : null,
            salary: typeof data.salary === 'number' && !isNaN(data.salary) ? data.salary : undefined,
            monthlyOffDays: typeof data.monthlyOffDays === 'number' && !isNaN(data.monthlyOffDays) ? data.monthlyOffDays : undefined,
        };

        // Remove undefined fields to avoid overriding with nothing if not provided
        Object.keys(updateData).forEach(key => updateData[key] === undefined && delete updateData[key]);

        const updated = await db.user.update({
            where: { id: userId },
            data: updateData
        });

        // Audit Log
        await db.actionLog.create({
            data: {
                action: "UPDATE_EMPLOYEE_DATA",
                details: `Updated personal data for ${updated.username}. Changes: ${JSON.stringify(data)}`,
                userId: session.user.id
            }
        });

        return { success: true, message: "Employee data updated successfully" };
    } catch (error) {
        console.error("Error updating employee data:", error);
        return { success: false, error: "Internal Server Error" };
    }
}

export async function toggleUserFreeze(userId: string) {
    const session = await getSession();
    if (!session?.user) return { success: false, error: "Unauthorized" };

    const isAdmin = session.user.role === "ADMIN" || session.user.role === "مدير النظام" || session.user.role === "المالك";
    const canManageUsers = hasPermission(session.user.permissions, PERMISSIONS.MANAGE_USERS);

    if (!isAdmin && !canManageUsers) {
        return { success: false, error: "Forbidden" };
    }

    try {
        const user = await db.user.findUnique({ where: { id: userId } });
        if (!user) return { success: false, error: "User not found" };

        const updatedUser = await db.user.update({
            where: { id: userId },
            data: { isFrozen: !user.isFrozen }
        });

        // If freezing, also terminate active sessions
        if (updatedUser.isFrozen) {
            await db.session.deleteMany({ where: { userId } });
        }

        return { 
            success: true, 
            isFrozen: updatedUser.isFrozen,
            message: updatedUser.isFrozen ? "Account frozen successfully" : "Account unfrozen successfully"
        };
    } catch (error) {
        console.error("Error toggling user freeze:", error);
        return { success: false, error: "Internal Server Error" };
    }
}
