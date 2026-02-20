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

    if (!token) return null;

    // Eager load user and branch if needed
    const session = await prisma.session.findUnique({
        where: { token },
        include: {
            user: {
                // We might need branch info if your schema has relation
                // In simplified schema, branchId is on User, but relation might not be named 'branch' in my schema update?
                // I added Branch model. Let's check relation.
                // User model in schema: branchId String?, no relation defined in my snippet?
                // Wait, in schema.prisma I defined: 
                // model User { ... branchId String? ... }
                // I did NOT define `branch Branch @relation(...)` in the snippet I wrote.
                // So I can't include branch. I'll just return branchId.
            }
        }
    });

    // Handle expired
    if (!session || session.expiresAt < new Date()) {
        return null;
    }

    // Construct UserSession object
    const user = session.user;
    return {
        user: {
            id: user.id,
            username: user.username,
            name: user.name,
            role: user.roleStr,
            branchId: user.branchId,
            permissions: [] // Simplify for now
        } as UserSession
    };
}

export async function destroySession() {
    const cookieStore = cookies();
    const token = cookieStore.get("session")?.value;

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
