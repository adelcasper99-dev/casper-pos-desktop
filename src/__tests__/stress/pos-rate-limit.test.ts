import { describe, it, expect, vi, beforeEach } from 'vitest';
import { rateLimit } from '@/lib/rate-limit';

describe('POS Rate Limit Stress Test', () => {
    const identifier = 'clerk_001';
    const options = {
        keyPrefix: 'stress-test',
        limit: 5,
        windowSeconds: 60
    };

    beforeEach(() => {
        // Clear global cache if possible, but since it's a closure in the module,
        // we use a unique prefix for each test to avoid interference.
        vi.useFakeTimers();
    });

    it('should allow exactly <limit> requests in a concurrent burst', async () => {
        const burstSize = 20;
        const testKey = `burst_${Date.now()}`;
        
        // Simulating 20 concurrent requests hitting the rate limiter
        const results = await Promise.all(
            Array.from({ length: burstSize }).map(() => 
                rateLimit(identifier, { ...options, keyPrefix: testKey })
            )
        );

        const successes = results.filter(r => r.success).length;
        const failures = results.filter(r => !r.success).length;

        expect(successes).toBe(options.limit);
        expect(failures).toBe(burstSize - options.limit);
        
        // Verify the first failure message or status
        const firstFailure = results.find(r => !r.success);
        expect(firstFailure?.remaining).toBe(0);
    });

    it('should reset limits after the window expires', async () => {
        const testKey = `reset_${Date.now()}`;
        
        // Consume all limits
        await Promise.all(
            Array.from({ length: options.limit }).map(() => 
                rateLimit(identifier, { ...options, keyPrefix: testKey })
            )
        );

        // Next one should fail
        const failResult = await rateLimit(identifier, { ...options, keyPrefix: testKey });
        expect(failResult.success).toBe(false);

        // Advance time by window + 1s
        vi.advanceTimersByTime((options.windowSeconds + 1) * 1000);

        // Should succeed again
        const successResult = await rateLimit(identifier, { ...options, keyPrefix: testKey });
        expect(successResult.success).toBe(true);
        expect(successResult.remaining).toBe(options.limit - 1);
    });

    it('should maintain independent limits for different users', async () => {
        const userA = 'user_A';
        const userB = 'user_B';
        const testKey = `multi_${Date.now()}`;

        // User A consumes all
        await Promise.all(
            Array.from({ length: options.limit }).map(() => 
                rateLimit(userA, { ...options, keyPrefix: testKey })
            )
        );

        // User A next one fails
        const resultA = await rateLimit(userA, { ...options, keyPrefix: testKey });
        expect(resultA.success).toBe(false);

        // User B should still succeed
        const resultB = await rateLimit(userB, { ...options, keyPrefix: testKey });
        expect(resultB.success).toBe(true);
    });
});
