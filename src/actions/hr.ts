"use server";

import { prisma } from "@/lib/prisma"
import { secureAction } from "@/lib/safe-action";
import { PERMISSIONS } from "@/lib/permissions/registry";

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
}, { permission: PERMISSIONS.HR_VIEW_ATTENDANCE });
