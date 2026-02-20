import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";

export async function logAction(
    entityType: string,
    entityId: string,
    action: string,
    newData?: any,
    previousData?: any,
    reason?: string
) {
    try {
        const session = await getSession();
        const userName = session?.user?.name || session?.user?.username || "System/Unknown";

        await prisma.auditLog.create({
            data: {
                entityType,
                entityId,
                action,
                newData: newData ? JSON.stringify(newData) : null,
                previousData: previousData ? JSON.stringify(previousData) : "",
                reason,
                user: userName
            }
        });
    } catch (error) {
        console.error("Failed to create audit log", error);
        // Don't throw, we don't want to break the main flow if logging fails
    }
}
