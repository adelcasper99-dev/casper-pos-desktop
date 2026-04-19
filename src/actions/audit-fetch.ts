"use server";

import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";

import { hasPermission, PERMISSIONS } from "@/lib/permissions";

export async function getAuditLogs(entityType?: string, limit: number = 50) {
    try {
        const session = await getSession();
        // Basic security: require LOGS_VIEW permission
        if (!session?.user || !hasPermission(session.user.permissions, PERMISSIONS.LOGS_VIEW)) {
            return [];
        }

        const where = entityType ? { entityType } : {};

        const logs = await prisma.auditLog.findMany({
            where,
            orderBy: { createdAt: 'desc' },
            take: limit
        });

        // Date serialization
        return logs.map((log: any) => ({
            ...log,
            createdAt: log.createdAt.toISOString()
        }));

    } catch (error) {
        console.error("Failed to fetch audit logs:", error);
        return [];
    }
}
