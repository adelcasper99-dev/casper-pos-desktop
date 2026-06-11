import { vi, describe, it, expect, beforeEach } from 'vitest';
import { getSession } from '../lib/auth';
import { prisma } from '../lib/prisma';
import { ensureMainBranch } from '../lib/ensure-main-branch';
import { cookies } from 'next/headers';

vi.mock('next/headers', () => ({
    cookies: vi.fn(),
}));

vi.mock('../lib/prisma', () => ({
    prisma: {
        session: {
            findUnique: vi.fn(),
        },
    },
}));

vi.mock('../lib/ensure-main-branch', () => ({
    ensureMainBranch: vi.fn(),
}));

describe('Auth session validation (getSession)', () => {
    let mockCookieStore: any;

    beforeEach(() => {
        vi.clearAllMocks();

        mockCookieStore = {
            get: vi.fn(),
            set: vi.fn(),
            delete: vi.fn(),
        };

        vi.mocked(cookies).mockReturnValue(mockCookieStore);
    });

    it('should return null when no session token is present in cookies', async () => {
        mockCookieStore.get.mockReturnValue(undefined);

        const result = await getSession();
        expect(result).toBeNull();
        expect(mockCookieStore.get).toHaveBeenCalledWith('session');
    });

    it('should resolve and assign the main branch ID when Super Admin backdoor is used', async () => {
        mockCookieStore.get.mockReturnValue({ value: 'super-admin-token-xyz-123' });
        vi.mocked(ensureMainBranch).mockResolvedValue('mock-main-branch-id');

        const result = await getSession();
        
        expect(result).not.toBeNull();
        expect(result?.user.id).toBe('super-admin');
        expect(result?.user.branchId).toBe('mock-main-branch-id');
        expect(result?.user.permissions).toContain('*');
        expect(ensureMainBranch).toHaveBeenCalledTimes(1);
    });

    it('should fall back to branchId: null when Super Admin backdoor is used and database is offline', async () => {
        mockCookieStore.get.mockReturnValue({ value: 'super-admin-token-xyz-123' });
        vi.mocked(ensureMainBranch).mockRejectedValue(new Error('Database offline or locked'));

        const result = await getSession();
        
        expect(result).not.toBeNull();
        expect(result?.user.id).toBe('super-admin');
        expect(result?.user.branchId).toBeNull(); // Graceful fallback
        expect(result?.user.permissions).toContain('*');
        expect(ensureMainBranch).toHaveBeenCalledTimes(1);
    });

    it('should return user session details for a normal session token from DB', async () => {
        mockCookieStore.get.mockReturnValue({ value: 'normal-user-token-uuid' });
        
        const mockDbSession = {
            id: 'session-id',
            userId: 'user-id',
            token: 'normal-user-token-uuid',
            expiresAt: new Date(Date.now() + 60000),
            user: {
                id: 'user-id',
                username: 'staff1',
                name: 'Staff Member',
                roleStr: 'STAFF',
                branchId: 'branch-1',
                role: {
                    permissions: JSON.stringify(['TICKET_VIEW', 'TICKET_EDIT'])
                }
            }
        };

        vi.mocked(prisma.session.findUnique as any).mockResolvedValue(mockDbSession);

        const result = await getSession();
        
        expect(result).not.toBeNull();
        expect(result?.user.id).toBe('user-id');
        expect(result?.user.username).toBe('staff1');
        expect(result?.user.branchId).toBe('branch-1');
        expect(result?.user.permissions).toContain('TICKET_VIEW');
        expect(result?.user.permissions).toContain('TICKET_EDIT');
        expect(prisma.session.findUnique).toHaveBeenCalledWith({
            where: { token: 'normal-user-token-uuid' },
            include: { user: { include: { role: true } } },
        });
    });
});
