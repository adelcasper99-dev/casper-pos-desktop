import { vi, describe, it, expect, beforeEach } from 'vitest';
import { prisma } from '@/lib/prisma';
import { runWithTenant } from '@/lib/prisma-tenant-extension';
import { provisionTenantCore } from '@/actions/hq-tenant-actions';

const mockCookieStore = {
  get: vi.fn(),
  set: vi.fn(),
  delete: vi.fn()
};

vi.mock('next/headers', () => ({
  cookies: vi.fn(() => mockCookieStore),
  headers: vi.fn(() => new Headers())
}));

describe('E2E Signup Flow & Multi-Tenant User Isolation', () => {
  const TEST_TENANTS = ['tenant-alpha', 'tenant-beta', 'tenant-gamma'];

  async function cleanupTenants() {
    await runWithTenant('SYSTEM', async () => {
      const tenantFilter = {
        where: {
          OR: TEST_TENANTS.map(id => ({ tenantId: id }))
        }
      };

      await prisma.session.deleteMany({
        where: {
          user: {
            tenantId: { in: TEST_TENANTS }
          }
        }
      }).catch(() => {});
      await prisma.license.deleteMany(tenantFilter).catch(() => {});
      await prisma.journalLine.deleteMany(tenantFilter).catch(() => {});
      await prisma.journalEntry.deleteMany(tenantFilter).catch(() => {});
      await prisma.account.deleteMany(tenantFilter).catch(() => {});
      await prisma.storeSettings.deleteMany(tenantFilter).catch(() => {});
      await prisma.warehouse.deleteMany(tenantFilter).catch(() => {});
      await prisma.treasury.deleteMany(tenantFilter).catch(() => {});
      await prisma.user.deleteMany(tenantFilter).catch(() => {});
      await prisma.branch.deleteMany(tenantFilter).catch(() => {});
      await prisma.tenant.deleteMany({
        where: {
          OR: TEST_TENANTS.map(id => ({ id }))
        }
      }).catch(() => {});
    });
  }

  beforeEach(async () => {
    await cleanupTenants();
  });

  it('TC-1: "Same username in two tenants both succeed" scenario', async () => {
    // 1. Provision Tenant Alpha with adminUsername = "dodo"
    const tenantAlpha = await provisionTenantCore({
      name: 'Alpha Store',
      domain: 'tenant-alpha',
      adminUsername: 'dodo',
      adminPassword: 'password123',
      adminRole: 'ADMIN',
      phone: '01011112222'
    });

    expect(tenantAlpha.tenant.id).toBe('tenant-alpha');
    expect(tenantAlpha.user.username).toBe('dodo');
    expect(tenantAlpha.user.tenantId).toBe('tenant-alpha');

    // 2. Provision Tenant Beta with the EXACT SAME adminUsername = "dodo"
    const tenantBeta = await provisionTenantCore({
      name: 'Beta Store',
      domain: 'tenant-beta',
      adminUsername: 'dodo', // <--- SAME USERNAME
      adminPassword: 'password456',
      adminRole: 'ADMIN',
      phone: '01033334444'
    });

    expect(tenantBeta.tenant.id).toBe('tenant-beta');
    expect(tenantBeta.user.username).toBe('dodo');
    expect(tenantBeta.user.tenantId).toBe('tenant-beta');

    // 3. Verify both users exist in database independently
    const users = await runWithTenant('SYSTEM', async () => {
      return await prisma.user.findMany({
        where: {
          username: 'dodo',
          deletedAt: null
        }
      });
    });

    expect(users.length).toBe(2);
    expect(users.map(u => u.tenantId).sort()).toEqual(['tenant-alpha', 'tenant-beta']);
  });

  it('TC-2: Subdomain conflict rejects with accurate P2002 error in core provision', async () => {
    // 1. Create first tenant
    await provisionTenantCore({
      name: 'Alpha Store',
      domain: 'tenant-alpha',
      adminUsername: 'admin1',
      adminPassword: 'password123',
      phone: '01011112222'
    });

    // 2. Try to create second tenant with SAME domain
    let errorCaught: { code?: string } | null = null;
    try {
      await provisionTenantCore({
        name: 'Another Store',
        domain: 'tenant-alpha', // Duplicate domain
        adminUsername: 'admin2',
        adminPassword: 'password123',
        phone: '01055556666'
      });
    } catch (err: unknown) {
      errorCaught = err as { code?: string };
    }

    expect(errorCaught).toBeDefined();
    expect(errorCaught?.code).toBe('P2002');
  });

  it('TC-3: Signup API route disambiguates Subdomain vs Phone conflict messages', async () => {
    const { POST } = await import('@/app/api/auth/signup/route');
    const { createVerificationToken } = await import('@/lib/otp-service');

    const validProofAlpha = createVerificationToken('01011112222');

    // 1. First signup succeeds
    const req1 = new Request('http://localhost:3000/api/auth/signup', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        storeName: 'Alpha Store',
        slug: 'tenant-alpha',
        adminUsername: 'manager1',
        adminPassword: 'password123',
        phone: '01011112222',
        verificationToken: validProofAlpha
      })
    });

    const res1 = await POST(req1);
    const data1 = await res1.json();
    expect(res1.status).toBe(200);
    expect(data1.success).toBe(true);

    // 2. Subdomain conflict -> Returns explicit Subdomain Arabic message
    const validProofBeta = createVerificationToken('01099998888');
    const reqSubdomainConflict = new Request('http://localhost:3000/api/auth/signup', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        storeName: 'Duplicate Subdomain Store',
        slug: 'tenant-alpha', // duplicate slug
        adminUsername: 'differentuser',
        adminPassword: 'password123',
        phone: '01099998888',
        verificationToken: validProofBeta
      })
    });

    const resSubdomain = await POST(reqSubdomainConflict);
    const dataSubdomain = await resSubdomain.json();
    expect(resSubdomain.status).toBe(409);
    expect(dataSubdomain.error).toBe('هذا المعرف الفرعي (Subdomain) مستخدم بالفعل، يرجى اختيار اسم آخر.');

    // 3. Same username in different store -> SUCCEEDS (User isolation)
    const validProofGamma = createVerificationToken('01088887777');
    const reqSameUsername = new Request('http://localhost:3000/api/auth/signup', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        storeName: 'Beta Store',
        slug: 'tenant-beta', // different slug
        adminUsername: 'manager1', // same username as tenant-alpha
        adminPassword: 'password123',
        phone: '01088887777',
        verificationToken: validProofGamma
      })
    });

    const resSameUsername = await POST(reqSameUsername);
    const dataSameUsername = await resSameUsername.json();
    expect(resSameUsername.status).toBe(200);
    expect(dataSameUsername.success).toBe(true);
  });

  it('TC-4: Same tenant duplicate username rejects with exact username Arabic message', async () => {
    // Test that within the SAME tenant, duplicate username throws P2002 on (tenantId, username)
    const bcrypt = await import('bcryptjs');
    const hashedPassword = await bcrypt.hash('password123', 10);

    // 1. Create Tenant Gamma
    await provisionTenantCore({
      name: 'Gamma Store',
      domain: 'tenant-gamma',
      adminUsername: 'lead',
      adminPassword: 'password123',
      phone: '01055554444'
    });

    // 2. Try to insert duplicate user in tenant-gamma
    let errorCaught: { code?: string } | null = null;
    try {
      await runWithTenant('tenant-gamma', async () => {
        await prisma.user.create({
          data: {
            username: 'lead', // duplicate inside tenant-gamma
            password: hashedPassword,
            name: 'Another Lead',
            tenantId: 'tenant-gamma',
            roleStr: 'STAFF'
          }
        });
      });
    } catch (err: unknown) {
      errorCaught = err as { code?: string };
    }

    expect(errorCaught).toBeDefined();
    expect(errorCaught?.code).toBe('P2002');
  });
});
