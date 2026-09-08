import { describe, it, expect, vi, beforeEach } from 'vitest';
import { isPlatformHqAdmin, requirePlatformHqAdmin, checkRateLimit } from '@/lib/hq-auth-guard';
import { GET as getTenantLicenseInfo } from '@/app/api/tenant/license-info/route';
import { GET as getAdminLicenses } from '@/app/api/admin/licenses/route';
import { POST as revokeAdminLicense } from '@/app/api/admin/licenses/[id]/revoke/route';
import { POST as renewAdminLicense } from '@/app/api/admin/licenses/[id]/renew/route';
import { POST as generateAdminLicense } from '@/app/api/admin/license/generate/route';
import { POST as staffGenerateAdminLicense } from '@/app/api/admin/license/staff-generate/route';
import { POST as mergeMasterData } from '@/app/api/admin/master-data/merge/route';
import { getSession } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { NextRequest } from 'next/server';

vi.mock('@/lib/auth', () => ({
    getSession: vi.fn()
}));

vi.mock('@/lib/prisma', () => ({
    prisma: {
        tenant: {
            findMany: vi.fn(),
            findUnique: vi.fn(),
            findFirst: vi.fn(),
            update: vi.fn()
        },
        actionLog: {
            create: vi.fn()
        }
    }
}));

describe('Multi-Tenant License Isolation & HQ Security Guardrails', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    describe('1. Platform HQ Role Validation (Zero Hardcoded String Bypass)', () => {
        it('should allow authentic casper-hq tenant sessions', () => {
            const hqSession = {
                user: { id: 'u1', username: 'hq_admin', tenantId: 'casper-hq', role: 'ADMIN' }
            };
            expect(isPlatformHqAdmin(hqSession)).toBe(true);
        });

        it('should allow isGlobalAdmin sessions', () => {
            const globalAdminSession = {
                user: { id: 'u2', username: 'global_admin', isGlobalAdmin: true, role: 'SUPER_ADMIN' }
            };
            expect(isPlatformHqAdmin(globalAdminSession)).toBe(true);
        });

        it('should REJECT regular tenant admin sessions (even with ADMIN or SUPER_ADMIN role within tenant)', () => {
            const tenantAdminSession = {
                user: { id: 'u3', username: 'demo_admin', tenantId: 'demo', role: 'ADMIN' }
            };
            expect(isPlatformHqAdmin(tenantAdminSession)).toBe(false);

            const tenantSuperAdminSession = {
                user: { id: 'u4', username: 'mfathy_owner', tenantId: 'mfathy', role: 'SUPER_ADMIN' }
            };
            expect(isPlatformHqAdmin(tenantSuperAdminSession)).toBe(false);
        });

        it('should REJECT unauthenticated or empty sessions', () => {
            expect(isPlatformHqAdmin(null)).toBe(false);
            expect(isPlatformHqAdmin({})).toBe(false);
            expect(isPlatformHqAdmin({ user: null })).toBe(false);
        });
    });

    describe('2. All 6 /api/admin/* Routes Reject Non-HQ Tenants with 403 Forbidden', () => {
        beforeEach(() => {
            // Mock regular tenant session
            vi.mocked(getSession).mockResolvedValue({
                user: { id: 'user-demo-1', username: 'demo_admin', tenantId: 'demo', role: 'ADMIN' }
            } as any);
        });

        it('blocks GET /api/admin/licenses for non-HQ tenant', async () => {
            const req = new Request('http://localhost/api/admin/licenses');
            const res = await getAdminLicenses(req);
            expect(res.status).toBe(403);
            const json = await res.json();
            expect(json.error).toBe('Forbidden');
        });

        it('blocks POST /api/admin/licenses/[id]/revoke for non-HQ tenant', async () => {
            const req = new Request('http://localhost/api/admin/licenses/mfathy/revoke', { method: 'POST' });
            const res = await revokeAdminLicense(req, { params: { id: 'mfathy' } });
            expect(res.status).toBe(403);
        });

        it('blocks POST /api/admin/licenses/[id]/renew for non-HQ tenant', async () => {
            const req = new Request('http://localhost/api/admin/licenses/mfathy/renew', { method: 'POST' });
            const res = await renewAdminLicense(req, { params: { id: 'mfathy' } });
            expect(res.status).toBe(403);
        });

        it('blocks POST /api/admin/license/generate for non-HQ tenant', async () => {
            const req = new Request('http://localhost/api/admin/license/generate', { method: 'POST' });
            const res = await generateAdminLicense(req);
            expect(res.status).toBe(403);
        });

        it('blocks POST /api/admin/license/staff-generate for non-HQ tenant', async () => {
            const req = new Request('http://localhost/api/admin/license/staff-generate', { method: 'POST' });
            const res = await staffGenerateAdminLicense(req);
            expect(res.status).toBe(403);
        });

        it('blocks POST /api/admin/master-data/merge for non-HQ tenant', async () => {
            const req = new NextRequest('http://localhost/api/admin/master-data/merge', { method: 'POST' });
            const res = await mergeMasterData(req);
            expect(res.status).toBe(403);
        });
    });

    describe('3. /api/tenant/license-info 100% IDOR Parameter Immunity', () => {
        it('strictly returns ONLY caller session tenant data, ignoring query parameter tampering (?tenantId=mfathy)', async () => {
            vi.mocked(getSession).mockResolvedValue({
                user: { id: 'user-demo-1', username: 'demo_admin', tenantId: 'demo', role: 'ADMIN' }
            } as any);

            const mockTenantData = {
                id: 'demo',
                name: 'Demo Store',
                isActive: true,
                licenses: [
                    {
                        id: 'lic-demo-1',
                        key: 'CASPER-DEMO-KEY',
                        macAddress: '00:11:22:33:44:55',
                        expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
                        status: 'ACTIVE'
                    }
                ]
            };
            vi.mocked(prisma.tenant.findUnique).mockResolvedValue(mockTenantData as any);
            vi.mocked(prisma.tenant.findFirst).mockResolvedValue(mockTenantData as any);

            // Attacker attempts to pass query param ?tenantId=mfathy
            const req = new Request('http://localhost/api/tenant/license-info?tenantId=mfathy');
            const res = await getTenantLicenseInfo(req);

            expect(res.status).toBe(200);
            const json = await res.json();
            
            // Assert that query was called strictly with session tenantId 'demo', NOT 'mfathy'
            expect(prisma.tenant.findFirst).toHaveBeenCalledWith({
                where: { OR: [{ id: 'demo' }, { slug: 'demo' }] },
                include: expect.any(Object)
            });

            expect(json.data.tenantId).toBe('demo');
            expect(json.data.name).toBe('Demo Store');
            expect(json.data.devicesCount).toBe(1);
            expect(json.data.devices[0].machineId).toBe('00:11:22:33:44:55');
        });
    });

    describe('4. Authorized HQ Master Access Path', () => {
        it('allows casper-hq platform admin to query all client licenses', async () => {
            vi.mocked(getSession).mockResolvedValue({
                user: { id: 'hq-super-admin', username: 'hq', tenantId: 'casper-hq', isGlobalAdmin: true }
            } as any);

            vi.mocked(prisma.tenant.findMany).mockResolvedValue([
                { id: 'demo', name: 'Demo Store', licenses: [] },
                { id: 'mfathy', name: 'M Fathy Store', licenses: [] }
            ] as any);

            const req = new Request('http://localhost/api/admin/licenses');
            const res = await getAdminLicenses(req);

            expect(res.status).toBe(200);
            const json = await res.json();
            expect(json.success).toBe(true);
            expect(json.data.length).toBe(2);
        });
    });
});
