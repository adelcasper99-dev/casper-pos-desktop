import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { generateKeyPairSync } from 'crypto';
import jwt from 'jsonwebtoken';
import { TrueTime } from '../lib/license/true-time';
import { Hardware } from '../lib/license/hardware';
import { AsarIntegrity } from '../lib/license/asar-integrity';
import { LicenseVerifier } from '../lib/license/verify';
import { prisma } from '@/lib/prisma';
import os from 'os';
import { exec } from 'child_process';

// Mock Prisma client
vi.mock('@/lib/prisma', () => ({
    prisma: {
        storeSettings: {
            findUnique: vi.fn(),
            update: vi.fn(),
            create: vi.fn()
        }
    }
}));

// Mock Child Process & OS
vi.mock('child_process', () => ({
    exec: vi.fn()
}));

vi.mock('os', () => ({
    default: {
        platform: vi.fn()
    }
}));

// Generate key pair for testing (RS256 requires min 2048 bits in newer Node/OpenSSL)
const { publicKey, privateKey } = generateKeyPairSync('rsa', {
    modulusLength: 2048,
    publicKeyEncoding: { type: 'pkcs1', format: 'pem' },
    privateKeyEncoding: { type: 'pkcs1', format: 'pem' }
});

describe('Casper POS License & TrueTime Tests', () => {
    const mockMachineId = 'TEST-HARDWARE-UUID-1234';

    beforeEach(() => {
        vi.resetAllMocks();
        process.env.LICENSE_PUBLIC_KEY = publicKey;
        
        // Reset TrueTime static properties to prevent cross-test state pollution
        (TrueTime as any).memoryServerNow = null;
        (TrueTime as any).memoryLocalTicks = null;
        
        // Default mock behaviors
        vi.spyOn(AsarIntegrity, 'checkIntegrity').mockResolvedValue(true);
        vi.spyOn(Hardware, 'getMachineId').mockResolvedValue(mockMachineId);
    });

    afterEach(() => {
        delete process.env.LICENSE_PUBLIC_KEY;
    });

    describe('Hardware ID Discovery', () => {
        it('resolves UUID on Windows using wmic', async () => {
            vi.mocked(os.platform).mockReturnValue('win32');
            const mockExec = vi.mocked(exec);
            mockExec.mockImplementation((cmd, cb: any) => {
                cb(null, 'UUID\nTEST-WINDOWS-UUID-9999\n');
                return {} as any;
            });

            // Restore original Hardware.getMachineId spy
            vi.spyOn(Hardware, 'getMachineId').mockRestore();

            const hwId = await Hardware.getMachineId();
            expect(hwId).toBe('TEST-WINDOWS-UUID-9999');
        });
    });

    describe('TrueTime Secure Baseline Clock', () => {
        it('synchronizes time successfully from WorldTimeAPI', async () => {
            const mockTime = new Date('2026-07-01T12:00:00Z').getTime();
            
            // Mock fetch
            const mockFetch = vi.fn().mockResolvedValue({
                ok: true,
                json: async () => ({ utc_datetime: '2026-07-01T12:00:00Z' })
            });
            global.fetch = mockFetch;

            await TrueTime.initialize();
            const now = await TrueTime.getNow();
            
            expect(now).toBeGreaterThanOrEqual(mockTime);
            expect(prisma.storeSettings.update).toHaveBeenCalledWith(expect.objectContaining({
                where: { id: 'settings' },
                data: expect.objectContaining({
                    lastServerNow: mockTime
                })
            }));
        });

        it('falls back to DB when offline', async () => {
            const mockTime = new Date('2026-06-25T10:00:00Z').getTime();
            global.fetch = vi.fn().mockRejectedValue(new Error('Network error'));
            
            vi.mocked(prisma.storeSettings.findUnique).mockResolvedValue({
                id: 'settings',
                name: 'Casper Store',
                taxRate: 0,
                currency: 'USD',
                receiptFooter: '',
                updatedAt: new Date(),
                lastServerNow: mockTime,
                localUptimeTicks: performance.now(),
                paperSize: '80mm',
                features: '{}',
                allowNegativeStock: false,
                blindCloseEnabled: true,
                licenseJwt: null
            } as any);

            await TrueTime.initialize();
            const now = await TrueTime.getNow();
            expect(now).toBeGreaterThanOrEqual(mockTime);
        });

        it('throws error when offline and uninitialized', async () => {
            global.fetch = vi.fn().mockRejectedValue(new Error('Network error'));
            vi.mocked(prisma.storeSettings.findUnique).mockResolvedValue(null);

            await TrueTime.initialize();
            await expect(TrueTime.getNow()).rejects.toThrow('Secure time baseline is missing');
        });
    });

    describe('LicenseVerifier Validation', () => {
        it('validates a correct, active license token', async () => {
            const payload = {
                tenant_id: 'tenant-123',
                status: 'active',
                trial_ends_at: '2026-12-31T23:59:59Z',
                server_now: '2026-07-01T00:00:00Z',
                machine_id: mockMachineId
            };
            const token = jwt.sign(payload, privateKey, { algorithm: 'RS256' });

            vi.mocked(prisma.storeSettings.findUnique).mockResolvedValue({
                id: 'settings',
                name: 'Casper Store',
                taxRate: 0,
                currency: 'USD',
                receiptFooter: '',
                updatedAt: new Date(),
                licenseJwt: token,
                lastServerNow: null,
                localUptimeTicks: null,
                paperSize: '80mm',
                features: '{}',
                allowNegativeStock: false,
                blindCloseEnabled: true
            } as any);

            // Mock TrueTime to return valid mock time
            vi.spyOn(TrueTime, 'getNow').mockResolvedValue(new Date('2026-07-01T12:00:00Z').getTime());

            const result = await LicenseVerifier.verify();
            expect(result.status).toBe('VALID');
            expect(result.expiresAt).toBeDefined();
        });

        it('blocks expired license tokens', async () => {
            const payload = {
                tenant_id: 'tenant-123',
                status: 'active',
                trial_ends_at: '2026-06-01T00:00:00Z',
                server_now: '2026-05-01T00:00:00Z',
                machine_id: mockMachineId
            };
            const token = jwt.sign(payload, privateKey, { algorithm: 'RS256' });

            vi.mocked(prisma.storeSettings.findUnique).mockResolvedValue({
                id: 'settings',
                name: 'Casper Store',
                taxRate: 0,
                currency: 'USD',
                receiptFooter: '',
                updatedAt: new Date(),
                licenseJwt: token,
                lastServerNow: null,
                localUptimeTicks: null,
                paperSize: '80mm',
                features: '{}',
                allowNegativeStock: false,
                blindCloseEnabled: true
            } as any);

            vi.spyOn(TrueTime, 'getNow').mockResolvedValue(new Date('2026-07-01T12:00:00Z').getTime());

            const result = await LicenseVerifier.verify();
            expect(result.status).toBe('EXPIRED');
            expect(result.errorCode).toBe('EXP-01');
        });

        it('detects hardware binding changes', async () => {
            const payload = {
                tenant_id: 'tenant-123',
                status: 'active',
                trial_ends_at: '2026-12-31T23:59:59Z',
                server_now: '2026-07-01T00:00:00Z',
                machine_id: 'ANOTHER-HARDWARE-UUID'
            };
            const token = jwt.sign(payload, privateKey, { algorithm: 'RS256' });

            vi.mocked(prisma.storeSettings.findUnique).mockResolvedValue({
                id: 'settings',
                name: 'Casper Store',
                taxRate: 0,
                currency: 'USD',
                receiptFooter: '',
                updatedAt: new Date(),
                licenseJwt: token,
                lastServerNow: null,
                localUptimeTicks: null,
                paperSize: '80mm',
                features: '{}',
                allowNegativeStock: false,
                blindCloseEnabled: true
            } as any);

            const result = await LicenseVerifier.verify();
            expect(result.status).toBe('HARDWARE_INVALIDATED');
            expect(result.errorCode).toBe('HWD-01');
        });

        it('detects signature tampering', async () => {
            const payload = {
                tenant_id: 'tenant-123',
                status: 'active',
                trial_ends_at: '2026-12-31T23:59:59Z',
                server_now: '2026-07-01T00:00:00Z',
                machine_id: mockMachineId
            };
            // Sign with a completely different key to trigger signature mismatch
            const differentKey = generateKeyPairSync('rsa', { modulusLength: 2048 }).privateKey;
            const tamperedToken = jwt.sign(payload, differentKey, { algorithm: 'RS256' });

            vi.mocked(prisma.storeSettings.findUnique).mockResolvedValue({
                id: 'settings',
                name: 'Casper Store',
                taxRate: 0,
                currency: 'USD',
                receiptFooter: '',
                updatedAt: new Date(),
                licenseJwt: tamperedToken,
                lastServerNow: null,
                localUptimeTicks: null,
                paperSize: '80mm',
                features: '{}',
                allowNegativeStock: false,
                blindCloseEnabled: true
            } as any);

            const result = await LicenseVerifier.verify();
            expect(result.status).toBe('TAMPERED');
            expect(result.errorCode).toBe('SIG-01');
        });
    });
});
