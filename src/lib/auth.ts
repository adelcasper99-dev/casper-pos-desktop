import { cookies } from "next/headers";
import { prisma } from "@/lib/prisma";
import { RedirectType, redirect } from "next/navigation";

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
};

export async function createUserSession(userData: UserSession, maxAge: number = 31536000): Promise<string> {
    const token = crypto.randomUUID();
    const expiresAt = new Date(Date.now() + maxAge * 1000);

    // Clean up old sessions for this user to prevent bloat
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

    const cookieStore = cookies();
    cookieStore.set({
        name: "session",
        value: token,
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        maxAge: maxAge,
        path: "/",
    });

    return token;
}

export async function getSession() {
    const cookieStore = cookies();
    const token = cookieStore.get("session")?.value;

    console.log(`[AUTH DEBUG] Token from cookie: ${token ? 'Found' : 'MISSING'}`);

    if (!token) return null;

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

    console.log(`[AUTH DEBUG] Session from DB: ${session ? 'Found' : 'NOT FOUND'}`);

    // Handle expired
    if (!session || session.expiresAt < new Date()) {
        if (session) console.log(`[AUTH DEBUG] Session expired at: ${session.expiresAt}`);
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
    } else if (user.roleStr === 'ADMIN') {
        permissions = ['*'];
    }

    console.log(`[AUTH DEBUG] User found: ${user.username} (${user.id}) - Perms: ${permissions.length}`);

    return {
        user: {
            id: user.id,
            username: user.username,
            name: user.name,
            role: user.roleStr,
            branchId: user.branchId,
            permissions: permissions
        } as UserSession
    };
}

export async function destroySession() {
    const cookieStore = cookies();
    const token = cookieStore.get("session")?.value;

    console.log(`[AUTH DEBUG] Destroying session for token: ${token ? 'Found' : 'MISSING'}`);

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
