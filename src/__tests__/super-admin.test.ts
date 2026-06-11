import { describe, it, expect, vi, beforeEach } from 'vitest';
import { changeSuperAdminPassword } from '../actions/super-admin';
import { prisma } from '../lib/prisma';
import { getSession } from '../lib/auth';
import bcrypt from 'bcryptjs';

// Mock dependencies
vi.mock('../lib/prisma', () => ({
    prisma: {
        storeSettings: {
            findUnique: vi.fn(),
            upsert: vi.fn(),
        },
        actionLog: {
            create: vi.fn(),
        },
    },
}));

vi.mock('../lib/auth', () => ({
    getSession: vi.fn(),
}));

vi.mock('../lib/csrf', () => ({
    verifyCSRFToken: vi.fn(() => Promise.resolve(true)),
}));

describe('Super Admin Password Management', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        process.env.SUPER_ADMIN_PASS = 'GenuineWise@92';
    });

    it('should reject changing password if not logged in as super-admin', async () => {
        vi.mocked(getSession).mockResolvedValue({
            user: { id: 'some-other-user', username: 'admin', role: 'ADMIN' }
        } as any);

        const result = await changeSuperAdminPassword({
            currentPassword: 'GenuineWise@92',
            newPassword: 'newPassword123',
            confirmPassword: 'newPassword123'
        });

        expect(result.success).toBe(false);
        expect(result.error).toContain('غير مصرح لك بتغيير الرقم السري');
    });

    it('should validate inputs using Zod', async () => {
        vi.mocked(getSession).mockResolvedValue({
            user: { id: 'super-admin', username: 'mocas', role: 'ADMIN' }
        } as any);

        // Mismatched passwords
        const mismatchRes = await changeSuperAdminPassword({
            currentPassword: 'GenuineWise@92',
            newPassword: 'newPassword123',
            confirmPassword: 'differentPassword'
        });
        expect(mismatchRes.success).toBe(false);
        expect(mismatchRes.error).toContain('الأرقام السرية غير متطابقة');

        // Too short new password
        const shortRes = await changeSuperAdminPassword({
            currentPassword: 'GenuineWise@92',
            newPassword: 'short',
            confirmPassword: 'short'
        });
        expect(shortRes.success).toBe(false);
        expect(shortRes.error).toContain('الرقم السري الجديد يجب أن يكون 8 حروف');
    });

    it('should verify current password and successfully hash and save new password', async () => {
        vi.mocked(getSession).mockResolvedValue({
            user: { id: 'super-admin', username: 'mocas', role: 'ADMIN', deviceFingerprint: 'test-fingerprint' }
        } as any);

        // Scenario 1: Initial state (no DB hash, compare against env fallback)
        (prisma.storeSettings.findUnique as any).mockResolvedValue(null);
        (prisma.storeSettings.upsert as any).mockResolvedValue({ id: 'settings' });

        const result = await changeSuperAdminPassword({
            currentPassword: 'GenuineWise@92',
            newPassword: 'newSuperPass123',
            confirmPassword: 'newSuperPass123'
        });

        expect(result.success).toBe(true);
        expect(prisma.storeSettings.upsert).toHaveBeenCalledWith(expect.objectContaining({
            where: { id: 'settings' },
            update: expect.objectContaining({
                superAdminHash: expect.any(String),
            }),
        }));

        // Verify action audit log was created
        expect(prisma.actionLog.create).toHaveBeenCalledWith(expect.objectContaining({
            data: expect.objectContaining({
                action: 'SUPER_ADMIN_PASSWORD_CHANGED',
                userId: 'super-admin',
            }),
        }));
    });

    it('should verify current password against DB-stored hash if available', async () => {
        vi.mocked(getSession).mockResolvedValue({
            user: { id: 'super-admin', username: 'mocas', role: 'ADMIN' }
        } as any);

        const hashedCurrent = await bcrypt.hash('DBPassword@123', 10);
        (prisma.storeSettings.findUnique as any).mockResolvedValue({
            id: 'settings',
            superAdminHash: hashedCurrent
        });

        // Test with incorrect current password
        const wrongRes = await changeSuperAdminPassword({
            currentPassword: 'wrongPassword',
            newPassword: 'newSuperPass123',
            confirmPassword: 'newSuperPass123'
        });
        expect(wrongRes.success).toBe(false);
        expect(wrongRes.error).toContain('الرقم السري الحالي غير صحيح');

        // Test with correct current password
        const correctRes = await changeSuperAdminPassword({
            currentPassword: 'DBPassword@123',
            newPassword: 'newSuperPass123',
            confirmPassword: 'newSuperPass123'
        });
        expect(correctRes.success).toBe(true);
    });
});
