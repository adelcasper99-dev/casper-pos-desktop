import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { generateKeyPairSync } from 'crypto';
import jwt from 'jsonwebtoken';
import { POST } from '../app/api/license/ping/route';
import { prisma } from '@/lib/prisma';
import { SyncService } from '../lib/sync-service';
import { offlineDB } from '../lib/offline-db';

vi.mock('@/lib/prisma', () => ({
    isPostgres: false,
    prisma: {
        license: {
            findFirst: vi.fn(),
        },
        storeSettings: {
            findUnique: vi.fn(),
            upsert: vi.fn(),
            update: vi.fn(),
        }
    }
}));

vi.mock('../lib/offline-db', () => ({
    offlineDB: {
        isOpen: vi.fn().mockReturnValue(true),
        storeSettings: {
            get: vi.fn().mockResolvedValue({ id: 'settings', licenseJwt: 'old' }),
            put: vi.fn(),
        }
    }

}));

vi.mock('@/utils/cloudConfigManager', () => ({
    CloudConfigManager: {
        getCloudConfig: vi.fn().mockResolvedValue({
            enabled: true,
            cloudUrl: 'https://hq.casperpos.com',
            syncSecret: 'secret123',
            branchId: 'branch-1'
        })
    }
}));

vi.mock('../lib/license/hardware', () => ({
    Hardware: {
        getMachineId: vi.fn().mockResolvedValue('TEST-MACHINE-UUID-999')
    }
}));

import { CloudConfigManager } from '@/utils/cloudConfigManager';

const { publicKey, privateKey } = generateKeyPairSync('rsa', {
    modulusLength: 2048,
    publicKeyEncoding: { type: 'pkcs1', format: 'pem' },
    privateKeyEncoding: { type: 'pkcs1', format: 'pem' }
});

describe('License Auto Renewal & Ping Endpoint', () => {
    const mockMachineId = 'TEST-MACHINE-UUID-999';

    beforeEach(() => {
        vi.clearAllMocks();
        process.env.LICENSE_PUBLIC_KEY = publicKey;
        process.env.LICENSE_PRIVATE_KEY = privateKey;

        vi.spyOn(CloudConfigManager, 'getCloudConfig').mockResolvedValue({
            enabled: true,
            cloudUrl: 'https://hq.casperpos.com',
            syncSecret: 'secret123',
            branchId: 'branch-1'
        });
    });


    afterEach(() => {
        delete process.env.LICENSE_PUBLIC_KEY;
        delete process.env.LICENSE_PRIVATE_KEY;
    });

    it('should return valid and issue renewed RS256 JWT when Cloud DB expiresAt is further in the future', async () => {
        const oldExpiry = new Date('2026-06-01T00:00:00Z');
        const newExpiry = new Date('2027-06-01T00:00:00Z');

        const oldToken = jwt.sign({
            tenant_id: 'tenant-100',
            status: 'ACTIVE',
            trial_ends_at: oldExpiry.toISOString(),
            machine_id: mockMachineId
        }, privateKey, { algorithm: 'RS256' });

        (prisma.license.findFirst as any).mockResolvedValue({
            id: 'lic-1',
            tenantId: 'tenant-100',
            macAddress: mockMachineId,
            expiresAt: newExpiry,
            status: 'ACTIVE',
            tenant: {
                id: 'tenant-100',
                isActive: true,
                status: 'ACTIVE',
                branchId: 'branch-1'
            }
        });

        const req = new Request('http://localhost/api/license/ping', {
            method: 'POST',
            body: JSON.stringify({
                machineId: mockMachineId,
                licenseJwt: oldToken
            })
        });

        const response = await POST(req);
        const data = await response.json();

        expect(response.status).toBe(200);
        expect(data.valid).toBe(true);
        expect(data.renewedJwt).toBeTruthy();

        const decoded = jwt.verify(data.renewedJwt, publicKey, { algorithms: ['RS256'] }) as any;
        expect(decoded.trial_ends_at).toBe(newExpiry.toISOString());
        expect(decoded.tenant_id).toBe('tenant-100');
    });

    it('should return valid=false reason=suspended when tenant is inactive or revoked', async () => {
        (prisma.license.findFirst as any).mockResolvedValue({
            id: 'lic-1',
            tenantId: 'tenant-100',
            macAddress: mockMachineId,
            status: 'REVOKED',
            tenant: {
                id: 'tenant-100',
                isActive: false
            }
        });

        const req = new Request('http://localhost/api/license/ping', {
            method: 'POST',
            body: JSON.stringify({ machineId: mockMachineId })
        });

        const response = await POST(req);
        const data = await response.json();

        expect(data.valid).toBe(false);
        expect(data.reason).toBe('suspended');
    });

    it('should gracefully return valid=true without renewedJwt if private key is missing on cloud env', async () => {
        delete process.env.LICENSE_PRIVATE_KEY;

        const oldExpiry = new Date('2026-06-01T00:00:00Z');
        const newExpiry = new Date('2027-06-01T00:00:00Z');

        const oldToken = jwt.sign({
            tenant_id: 'tenant-100',
            trial_ends_at: oldExpiry.toISOString(),
            machine_id: mockMachineId
        }, privateKey, { algorithm: 'RS256' });

        (prisma.license.findFirst as any).mockResolvedValue({
            id: 'lic-1',
            tenantId: 'tenant-100',
            macAddress: mockMachineId,
            expiresAt: newExpiry,
            tenant: { id: 'tenant-100', isActive: true }
        });

        const req = new Request('http://localhost/api/license/ping', {
            method: 'POST',
            body: JSON.stringify({ machineId: mockMachineId, licenseJwt: oldToken })
        });

        const response = await POST(req);
        const data = await response.json();

        expect(data.valid).toBe(true);
        expect(data.renewedJwt).toBeNull();
    });

    it('should update local Prisma SQLite & Dexie IndexedDB when checkLicenseRenewal receives renewedJwt', async () => {
        const renewedToken = 'mock-renewed-jwt-token';
        
        global.fetch = vi.fn().mockResolvedValue({
            ok: true,
            json: async () => ({ valid: true, renewedJwt: renewedToken })
        } as any);

        await SyncService.checkLicenseRenewal();

        expect(prisma.storeSettings.upsert).toHaveBeenCalledWith(
            expect.objectContaining({
                create: expect.objectContaining({ licenseJwt: renewedToken }),
                update: expect.objectContaining({ licenseJwt: renewedToken })
            })
        );
    });
});
