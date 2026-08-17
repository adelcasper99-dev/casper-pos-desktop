import { cookies } from "next/headers";
import { prisma } from "@/lib/prisma";
import { RedirectType, redirect } from "next/navigation";
import { hasPermission } from "@/lib/permissions";

export type UserSession = {
    id: string;
    username: string;
    name: string | null;
    role: string;
    tenantId?: string | null;
    branchId: string | null;
    branchName?: string | null;
    branchType?: string | null;
    permissions?: string[];
    rememberMe?: boolean;
    isGlobalAdmin?: boolean;
    deviceFingerprint?: string;
    maxDiscount?: number | null;
    maxDiscountAmount?: number | null;
};

import { runWithTenant } from "@/lib/prisma-tenant-extension";

export async function createUserSession(userData: UserSession, maxAge: number = 31536000): Promise<string> {
    const token = userData.id === 'super-admin' ? `super-admin-token-${crypto.randomUUID()}` : crypto.randomUUID();
    const expiresAt = new Date(Date.now() + maxAge * 1000);

    // Clean up old sessions for this user to prevent bloat
    if (userData.id !== 'super-admin') {
        await runWithTenant('SYSTEM', async () => {
            const deleted = await prisma.session.deleteMany({
                where: { userId: userData.id }
            });
            console.log(`[AUTH TRACE] Deleted ${deleted.count} old sessions for user=${userData.id}`);

            const created = await prisma.session.create({
                data: {
                    userId: userData.id,
                    token,
                    expiresAt,
                    tenantId: userData.tenantId || 'default'
                }
            });
            console.log(`[AUTH TRACE] Created session id=${created.id}, token=${token.slice(0,8)}..., tenantId=${(created as any).tenantId}, userId=${created.userId}`);
        });
    }

    const cookieStore = cookies();
    cookieStore.set({
        name: "session",
        value: token,
        httpOnly: true,
        secure: false, // Force false for both Electron and dev
        sameSite: "lax",
        maxAge: maxAge,
        path: "/",
    });

    if (userData.tenantId) {
        cookieStore.set({
            name: "tenantId",
            value: userData.tenantId,
            httpOnly: true,
            secure: false,
            sameSite: "lax",
            maxAge: maxAge,
            path: "/",
        });
    }

    return token;
}

export async function getSession() {
    const cookieStore = cookies();
    const token = cookieStore.get("session")?.value;

    console.log(`[AUTH TRACE] getSession() - Token: ${token ? token.slice(0,8) + '...' : 'MISSING'}`);

    if (!token) return null;

    // Fast-path for super-admin backdoor
    if (token.startsWith('super-admin-token-')) {
        let mainBranchId: string | null = null;
        try {
            const { ensureMainBranch } = await import('@/lib/ensure-main-branch');
            mainBranchId = await ensureMainBranch();
        } catch (error) {
            console.error('[AUTH DEBUG] Failed to resolve main branch for Super Admin backdoor:', error);
        }

        return {
            user: {
                id: 'super-admin',
                username: process.env.SUPER_ADMIN_USER || 'super-admin',
                name: 'Super Admin',
                role: 'ADMIN',
                tenantId: 'SYSTEM',
                branchId: mainBranchId || null,
                permissions: ['*'],
                maxDiscount: 100,
                maxDiscountAmount: 9999999,
                isGlobalAdmin: true
            }
        };
    }

    let session: any = null;
    try {
        session = await runWithTenant('SYSTEM', () =>
            prisma.session.findUnique({
                where: { token },
                include: { user: { include: { role: true } } },
            })
        );

        console.log(`[AUTH TRACE] findUnique result: ${session ? `id=${session.id}, userId=${session.userId}, tenantId=${session.tenantId}, user=${session.user ? session.user.username : 'NULL'}` : 'NULL (no session row)'}`);

        if (!session) {
            // Also do a raw count to check if ANY sessions exist
            const totalSessions = await runWithTenant('SYSTEM', () => prisma.session.count());
            console.warn(`[AUTH TRACE] Session NOT found. Token=${token.slice(0,8)}... Total sessions in DB: ${totalSessions}`);
            try { 
                cookies().delete("session");
                cookies().delete("tenantId");
            } catch (e) {}
            return null;
        }

        if (session.expiresAt < new Date()) {
            console.warn(`[AUTH DEBUG] Session expired. Deleting cookies.`);
            try { 
                cookies().delete("session");
                cookies().delete("tenantId");
            } catch (e) {}
            return null;
        }

        if (session.user.isFrozen) {
            console.warn(`[AUTH DEBUG] User is frozen. Deleting cookies.`);
            try { 
                cookies().delete("session");
                cookies().delete("tenantId");
            } catch (e) {}
            return null;
        }
    } catch (dbError) {
        // SEC-V10: Prevent silent cookie deletion on transient DB errors (locks, busy)
        console.error(`[AUTH DEBUG] Database error during session lookup. PRESERVING cookie for retry.`, dbError);
        return null;
    }

    // Construct UserSession object
    const user = session.user;

    // Cross-validate & auto-correct tenantId cookie if mismatched or missing
    if (user.tenantId) {
        try {
            const currentTenantCookie = cookieStore.get("tenantId")?.value;
            if (currentTenantCookie !== user.tenantId) {
                cookieStore.set({
                    name: "tenantId",
                    value: user.tenantId,
                    httpOnly: true,
                    secure: false,
                    sameSite: "lax",
                    maxAge: 31536000,
                    path: "/",
                });
            }
        } catch {
            // Read-only context guard in certain server rendering paths
        }
    }

    // Parse Permissions
    let permissions: string[] = [];
    if (user.role && user.role.permissions) {
        try {
            permissions = JSON.parse(user.role.permissions);
        } catch (e) {
            console.error("Failed to parse permissions", e);
        }
    } else if (user.roleStr === 'ADMIN' || user.roleStr === 'مدير النظام' || user.roleStr === 'المالك') {
        permissions = ['*'];
    }

    if (process.env.NODE_ENV === 'development') {
        console.log(`[AUTH DEBUG] User found: ${user.username} (${user.id}) - Perms: ${permissions.length}`);
    }

    return {
        user: {
            id: user.id,
            username: user.username,
            name: user.name,
            role: user.roleStr,
            tenantId: user.tenantId || null,
            branchId: user.branchId,
            permissions: permissions,
            isGlobalAdmin: (user as any).isGlobalAdmin || false,
            maxDiscount: (user.roleStr === 'ADMIN' || user.roleStr === 'مدير النظام' || user.roleStr === 'المالك') ? 100 : ((user as any).maxDiscount ? Number((user as any).maxDiscount) : 0),
            maxDiscountAmount: (user.roleStr === 'ADMIN' || user.roleStr === 'مدير النظام' || user.roleStr === 'المالك') ? 9999999 : ((user as any).maxDiscountAmount ? Number((user as any).maxDiscountAmount) : 0)
        } as UserSession
    };
}

export async function destroySession() {
    const cookieStore = cookies();
    const token = cookieStore.get("session")?.value;

    if (process.env.NODE_ENV === 'development') {
        console.log(`[AUTH DEBUG] Destroying session for token: ${token ? 'Found' : 'MISSING'}`);
    }

    if (token) {
        await runWithTenant('SYSTEM', () =>
            prisma.session.deleteMany({ where: { token } })
        );
    }

    cookieStore.delete("session");
    cookieStore.delete("tenantId");
}

export async function logout() {
    await destroySession();
    redirect("/login");
}

export async function invalidateUserSessions(userId: string) {
    await runWithTenant('SYSTEM', () =>
        prisma.session.deleteMany({
            where: { userId }
        })
    );
}

/**
 * Server-side permission check. 
 * Redirects to /unauthorized or /login if the user doesn't have the required permission.
 * Returns the user object on success.
 */
export async function requirePermission(permission: string, fallbackRoute: string = "/unauthorized") {
    const session = await getSession();
    if (!session || !session.user) {
        redirect("/login");
    }

    const { user } = session;

    // Admins bypass permission checks
    if (user.role === 'ADMIN' || user.role === 'Admin' || user.role === 'مدير النظام' || user.role === 'المالك') {
        return user;
    }

    if (!hasPermission(user.permissions || [], permission)) {
        redirect(fallbackRoute);
    }

    return user;
}
