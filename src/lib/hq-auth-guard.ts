import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

// Sliding-window in-memory rate limiter for security endpoints
const rateLimitMap = new Map<string, { count: number; resetAt: number }>();

export function checkRateLimit(key: string, limit: number = 10, windowMs: number = 60000): boolean {
    const now = Date.now();
    const entry = rateLimitMap.get(key);

    if (!entry || now > entry.resetAt) {
        rateLimitMap.set(key, { count: 1, resetAt: now + windowMs });
        return true;
    }

    if (entry.count >= limit) {
        return false;
    }

    entry.count += 1;
    return true;
}

interface GuardUser {
    id: string;
    username?: string;
    role?: string;
    tenantId?: string | null;
    isGlobalAdmin?: boolean;
}

interface GuardSession {
    user?: GuardUser | null;
}

export function isPlatformHqAdmin(session: GuardSession | null | undefined): boolean {
    return Boolean(
        session?.user && (
            session.user.tenantId === 'casper-hq' || 
            session.user.isGlobalAdmin === true
        )
    );
}

export type HqAdminAuthResult = 
    | { session: { user: GuardUser }; errorResponse: null }
    | { session: null; errorResponse: NextResponse };

export async function requirePlatformHqAdmin(req: Request): Promise<HqAdminAuthResult> {
    const ip = req.headers.get('x-forwarded-for') || req.headers.get('x-real-ip') || '127.0.0.1';
    
    let session: GuardSession | null = null;
    try {
        session = (await getSession()) as GuardSession | null;
    } catch (e) {
        console.error("[HQ_AUTH_GUARD] Failed to resolve session:", e);
    }

    const compositeKey = session?.user?.id ? `user:${session.user.id}` : `ip:${ip}`;

    // Rate limit failed / probing requests
    if (!checkRateLimit(compositeKey, 30, 60000)) {
        return {
            session: null,
            errorResponse: NextResponse.json(
                { error: "Too Many Requests", message: "تم تجاوز الحد المسموح للطلبات. الرجاء المحاولة لاحقاً." },
                { status: 429 }
            )
        };
    }

    if (!session || !session.user) {
        return {
            session: null,
            errorResponse: NextResponse.json(
                { error: "Unauthorized", message: "جلسة غير مسجلة." },
                { status: 401 }
            )
        };
    }

    if (!isPlatformHqAdmin(session)) {
        const tenantId = session.user.tenantId || 'unknown';
        const userId = session.user.id || 'unknown';
        const url = req.url || 'unknown';
        
        console.warn(`🚨 [SECURITY_ALERT] Unauthorized attempt to access HQ Admin API [${url}] by Tenant: ${tenantId}, User: ${userId}, IP: ${ip}`);

        // Persist security alert to ActionLog if database is accessible
        try {
            await (prisma as unknown as { actionLog?: { create: (arg: unknown) => Promise<unknown> } }).actionLog?.create({
                data: {
                    tenantId: tenantId,
                    action: 'SECURITY_ALERT_UNAUTHORIZED_HQ_ACCESS',
                    details: `Unauthorized access attempt on HQ Admin route: ${url} (User: ${userId}, IP: ${ip})`,
                    userId: userId
                }
            });
        } catch (dbErr) {
            // Non-blocking log failure
        }

        return {
            session: null,
            errorResponse: NextResponse.json(
                { error: "Forbidden", message: "غير مصرح: هذا المسار مخصص لإدارة منصة كاسبر المركزية فقط (Casper HQ)." },
                { status: 403 }
            )
        };
    }

    return { session: { user: session.user }, errorResponse: null };
}

