import { cookies } from "next/headers";
import { prisma } from "@/lib/prisma";
import { RedirectType, redirect } from "next/navigation";
import { hasPermission } from "@/lib/permissions";

export type UserSession = {
    id: string;
    username: string;
    name: string | null;
    role: string;
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

export async function createUserSession(userData: UserSession, maxAge: number = 31536000): Promise<string> {
    const token = userData.id === 'super-admin'
        ? `super-admin-token:${userData.branchId || 'main'}:${crypto.randomUUID()}`
        : crypto.randomUUID();
    const expiresAt = new Date(Date.now() + maxAge * 1000);

    // Clean up old sessions for this user to prevent bloat
    if (userData.id !== 'super-admin') {
        await prisma.session.deleteMany({
            where: { userId: userData.id }
        });

        await prisma.session.create({
            data: {
                userId: userData.id,
                token,
                expiresAt
            }
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

    return token;
}

export async function getSession() {
    const cookieStore = cookies();
    const token = cookieStore.get("session")?.value;

    if (process.env.NODE_ENV === 'development') {
        console.log(`[AUTH DEBUG] getSession() - Token in cookie: ${token ? 'Found' : 'MISSING'}`);
    }

    if (!token) return null;

    // Fast-path for super-admin backdoor
    if (token.startsWith('super-admin-token-') || token.startsWith('super-admin-token:')) {
        let branchId: string | null = null;
        if (token.startsWith('super-admin-token:')) {
            const parts = token.split(':');
            if (parts[1] && parts[1] !== 'main') {
                branchId = parts[1];
            }
        }
        if (!branchId) {
            const { ensureMainBranch } = await import('@/lib/ensure-main-branch');
            branchId = await ensureMainBranch().catch(() => null);
        }

        return {
            user: {
                id: 'super-admin',
                username: 'a',
                name: 'Super Admin',
                role: 'ADMIN',
                branchId,
                branchType: 'CENTER',
                permissions: ['*'],
                maxDiscount: 100,
                maxDiscountAmount: 9999999
            }
        };
    }

    let session: any = null;
    try {
        session = await prisma.session.findUnique({
            where: { token },
            include: { user: { include: { role: true, branch: { select: { type: true } } } } },
        });

        if (!session) {
            console.warn(`[AUTH DEBUG] Session token found in cookie but not in DB. This usually happens after a DB push/reset.`);
            return null;
        }

        if (session.expiresAt < new Date()) {
            console.warn(`[AUTH DEBUG] Session expired. Deleting cookie.`);
            try { cookies().delete("session"); } catch (e) {}
            return null;
        }

        if (session.user.isFrozen) {
            console.warn(`[AUTH DEBUG] User is frozen. Deleting cookie.`);
            try { cookies().delete("session"); } catch (e) {}
            return null;
        }
    } catch (dbError) {
        // SEC-V10: Prevent silent cookie deletion on transient DB errors (locks, busy)
        console.error(`[AUTH DEBUG] Database error during session lookup. PRESERVING cookie for retry.`, dbError);
        return null;
    }

    // Construct UserSession object
    const user = session.user;

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
            branchId: user.branchId,
            branchType: user.branch?.type ?? 'CENTER',
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
        await prisma.session.deleteMany({ where: { token } });
    }

    cookieStore.delete("session");
}

export async function logout() {
    await destroySession();
    redirect("/login");
}

export async function invalidateUserSessions(userId: string) {
    await prisma.session.deleteMany({
        where: { userId }
    });
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
