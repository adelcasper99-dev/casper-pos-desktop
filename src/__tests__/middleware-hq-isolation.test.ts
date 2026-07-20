import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { NextRequest } from 'next/server';
import { middleware } from '../middleware';

describe('Middleware HQ Domain Isolation', () => {
    const originalEnv = process.env.NODE_ROLE;

    beforeEach(() => {
        process.env.NODE_ROLE = 'STANDALONE';
    });

    afterEach(() => {
        process.env.NODE_ROLE = originalEnv;
    });

    it('redirects unauthenticated hq.casper-erp.com/onboarding to /login', () => {
        const req = new NextRequest('https://hq.casper-erp.com/onboarding');
        const res = middleware(req);
        expect(res.status).toBe(307);
        expect(res.headers.get('location')).toBe('https://hq.casper-erp.com/login');
    });

    it('redirects authenticated hq.casper-erp.com/onboarding to /casper-hq', () => {
        const req = new NextRequest('https://hq.casper-erp.com/onboarding', {
            headers: {
                cookie: 'session=test-token-123',
            },
        });
        const res = middleware(req);
        expect(res.status).toBe(307);
        expect(res.headers.get('location')).toBe('https://hq.casper-erp.com/casper-hq');
    });

    it('blocks regular tenant domain from accessing /casper-hq with 403', () => {
        const req = new NextRequest('https://store1.casper-erp.com/casper-hq');
        const res = middleware(req);
        expect(res.status).toBe(403);
    });

    it('allows tenant domain to access /onboarding without redirecting to /login', () => {
        const req = new NextRequest('https://store1.casper-erp.com/onboarding');
        const res = middleware(req);
        expect(res.status).toBe(200);
    });

    it('rewrites HQ root / request for hq.casper-erp.com to /casper-hq', () => {
        const req = new NextRequest('https://hq.casper-erp.com/', {
            headers: {
                cookie: 'session=valid-session',
            },
        });
        const res = middleware(req);
        const rewriteHeader = res.headers.get('x-middleware-rewrite');
        expect(rewriteHeader).toBeTruthy();
        expect(rewriteHeader).toContain('/casper-hq');
    });
});
