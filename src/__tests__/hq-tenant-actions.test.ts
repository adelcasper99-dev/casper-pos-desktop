import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renewLicense, revokeLicense } from '../actions/hq-tenant-actions';
import { prisma } from '../lib/prisma';
import { getSession } from '../lib/auth';

vi.mock('../lib/prisma', () => ({
  prisma: {
    license: {
      findUnique: vi.fn(),
      update: vi.fn(),
    },
    tenant: {
      update: vi.fn(),
    },
    $transaction: vi.fn((promises) => Promise.all(promises)),
  },
}));

vi.mock('../lib/auth', () => ({
  getSession: vi.fn(),
}));

vi.mock('../lib/csrf', () => ({
  verifyCSRFToken: vi.fn(() => Promise.resolve(true)),
}));

describe('HQ Tenant Actions - License Management & Security Guards', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getSession).mockResolvedValue({
      user: { id: 'admin-1', username: 'superadmin', isGlobalAdmin: true }
    } as any);
  });

  describe('renewLicense', () => {
    it('should extend active license by specified integer days', async () => {
      const futureDate = new Date(Date.now() + 10 * 86400 * 1000);
      vi.mocked(prisma.license.findUnique).mockResolvedValue({
        id: 'lic-1',
        expiresAt: futureDate,
        status: 'ACTIVE',
        tenantId: 'tenant-1'
      } as any);

      vi.mocked(prisma.license.update).mockResolvedValue({} as any);

      const res = await renewLicense({
        licenseId: 'lic-1',
        durationDays: 30
      });

      expect(res.success).toBe(true);
      expect(prisma.license.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'lic-1' },
          data: expect.objectContaining({
            status: 'ACTIVE'
          })
        })
      );
    });

    it('should reject non-integer durationDays input', async () => {
      const res = await renewLicense({
        licenseId: 'lic-1',
        durationDays: 14.5 as any
      });

      expect(res.success).toBe(false);
      expect(res.error).toBeDefined();
    });

    it('should not mutate DB for Lifetime licenses (expiresAt > 2090)', async () => {
      const lifetimeDate = new Date('2099-12-31T23:59:59.000Z');
      vi.mocked(prisma.license.findUnique).mockResolvedValue({
        id: 'lic-lifetime',
        expiresAt: lifetimeDate,
        status: 'ACTIVE',
        tenantId: 'tenant-1'
      } as any);

      const res = await renewLicense({
        licenseId: 'lic-lifetime',
        durationDays: 30
      });

      expect(res.success).toBe(true);
      expect(res.newExpiresAt).toBe(lifetimeDate.toISOString());
      expect(prisma.license.update).not.toHaveBeenCalled();
    });
  });

  describe('revokeLicense - IDOR & Security Enforcement', () => {
    it('should revoke license and deactivate tenant when IDs match', async () => {
      vi.mocked(prisma.license.findUnique).mockResolvedValue({
        id: 'lic-10',
        tenantId: 'tenant-10'
      } as any);

      const res = await revokeLicense({
        licenseId: 'lic-10',
        tenantId: 'tenant-10'
      });

      expect(res.success).toBe(true);
      expect(prisma.$transaction).toHaveBeenCalled();
      expect(prisma.license.update).toHaveBeenCalledWith({
        where: { id: 'lic-10' },
        data: { status: 'REVOKED' }
      });
      expect(prisma.tenant.update).toHaveBeenCalledWith({
        where: { id: 'tenant-10' },
        data: { isActive: false }
      });
    });

    it('should reject revocation if licenseId does not belong to tenantId (IDOR Protection)', async () => {
      vi.mocked(prisma.license.findUnique).mockResolvedValue({
        id: 'lic-10',
        tenantId: 'tenant-ACTUAL-OWNER'
      } as any);

      const res = await revokeLicense({
        licenseId: 'lic-10',
        tenantId: 'tenant-TARGET-VICTIM'
      });

      expect(res.success).toBe(false);
      expect(res.error).toContain('License does not belong to the specified tenant');
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it('should throw error if license does not exist', async () => {
      vi.mocked(prisma.license.findUnique).mockResolvedValue(null);

      const res = await revokeLicense({
        licenseId: 'non-existent',
        tenantId: 'tenant-1'
      });

      expect(res.success).toBe(false);
      expect(res.error).toContain('License not found');
    });
  });
});
