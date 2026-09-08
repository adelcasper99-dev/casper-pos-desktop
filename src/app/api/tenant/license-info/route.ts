import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const dynamic = 'force-dynamic';

interface TenantQueryResult {
    id: string;
    name?: string;
    slug?: string;
    isActive?: boolean;
    licenses?: Array<{
        id: string;
        key: string;
        macAddress?: string;
        expiresAt: Date;
        status?: string;
    }>;
}

interface PrismaTenantClient {
    tenant?: {
        findFirst?: (args: unknown) => Promise<TenantQueryResult | null>;
        findUnique?: (args: unknown) => Promise<TenantQueryResult | null>;
    };
}

export async function GET(req: Request) {
    try {
        const session = await getSession();
        if (!session || !session.user) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        // 🛡️ [SECURITY] STRICT SERVER-SIDE SESSION TENANT EXTRACTION
        // Never read tenantId from query parameters or headers (100% IDOR Immunity)
        const tenantId = session.user.tenantId || 'default';

        // Dual-key lookup (ID or Slug) with multi-environment safe optional chaining
        const tenantClient = prisma as unknown as PrismaTenantClient;
        const tenant = tenantClient.tenant?.findFirst 
            ? await tenantClient.tenant.findFirst({
                where: {
                    OR: [
                        { id: tenantId },
                        { slug: tenantId }
                    ]
                },
                include: {
                    licenses: {
                        select: {
                            id: true,
                            key: true,
                            macAddress: true,
                            expiresAt: true,
                            status: true
                        },
                        orderBy: { expiresAt: 'desc' }
                    }
                }
            })
            : await tenantClient.tenant?.findUnique?.({
                where: { id: tenantId },
                include: {
                    licenses: {
                        select: {
                            id: true,
                            key: true,
                            macAddress: true,
                            expiresAt: true,
                            status: true
                        },
                        orderBy: { expiresAt: 'desc' }
                    }
                }
            });

        if (!tenant) {
            return NextResponse.json({
                success: true,
                data: {
                    tenantId,
                    name: 'Default Store',
                    plan: 'Casper ERP Pro',
                    status: 'active',
                    expiresAt: null,
                    remainingDays: 365,
                    isExpired: false,
                    isSuspended: false,
                    devicesCount: 0,
                    devices: []
                }
            });
        }

        const primaryLicense = tenant.licenses?.[0];
        const expiresAtDate = primaryLicense?.expiresAt ? new Date(primaryLicense.expiresAt) : null;
        const now = new Date();

        const isExpired = expiresAtDate ? expiresAtDate.getTime() < now.getTime() : false;
        const isSuspended = !tenant.isActive || primaryLicense?.status === 'SUSPENDED';
        const status = isSuspended ? 'suspended' : isExpired ? 'expired' : 'active';

        const remainingDays = expiresAtDate 
            ? Math.max(0, Math.ceil((expiresAtDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)))
            : null;

        const devices = tenant.licenses?.filter((l: { macAddress?: string }) => Boolean(l.macAddress && l.macAddress.trim())).map((l: { id: string; macAddress?: string; expiresAt: Date }, idx: number) => ({
            id: l.id,
            index: idx + 1,
            machineId: l.macAddress || 'غير محدد',
            expiresAt: l.expiresAt
        })) || [];

        return NextResponse.json({
            success: true,
            data: {
                tenantId: tenant.id,
                name: tenant.name || 'Store',
                plan: 'Casper ERP Pro',
                status,
                expiresAt: expiresAtDate ? expiresAtDate.toISOString() : null,
                remainingDays,
                isExpired,
                isSuspended,
                devicesCount: devices.length,
                devices
            }
        });

    } catch (error: unknown) {
        console.error("[TENANT_LICENSE_INFO_GET] Error:", error);
        return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
    }
}
