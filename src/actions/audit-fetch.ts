"use server";

import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";

export async function getAuditLogs(entityType?: string, limit: number = 50) {
    try {
        const session = await getSession();
        // Basic security: only admins/managers can view logs
        if (!session?.user || (session.user.role !== "ADMIN" && session.user.role !== "Admin" && session.user.role !== "Manager")) {
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
