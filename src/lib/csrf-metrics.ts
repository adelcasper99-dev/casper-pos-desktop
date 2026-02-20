/**
 * CSRF Metrics & Monitoring
 * ✅ PHASE 3: Attack Pattern Detection and Metrics Tracking
 * 
 * Tracks validation failures and potential attacks
 */

interface CSRFMetric {
    timestamp: number;
    userId?: string;
    route: string;
    tokenProvided: boolean;
    validationPassed: boolean;
}

const metrics: CSRFMetric[] = [];
const MAX_METRICS = 1000; // Keep last 1000 events

/**
 * Record a CSRF validation attempt
 */
export function recordCSRFValidation(
    route: string,
    tokenProvided: boolean,
    validationPassed: boolean,
    userId?: string
) {
    metrics.push({
        timestamp: Date.now(),
        userId,
        route,
        tokenProvided,
        validationPassed,
    });

    // Keep only last 1000 metrics
    if (metrics.length > MAX_METRICS) {
        metrics.shift();
    }

    // Log potential attack patterns
    if (tokenProvided && !validationPassed) {
        console.warn('[CSRF] Validation failure detected', {
            route,
            userId,
            timestamp: new Date().toISOString(),
        });

        // Check for attack pattern (multiple failures from same user)
        if (userId) {
            const recentFailures = metrics.filter(
                m => m.userId === userId &&
                    m.validationPassed === false &&
                    Date.now() - m.timestamp < 60000 // Last minute
            );

            // ✅ PHASE 3: Attack detection (5+ failures in 1 minute)
            if (recentFailures.length >= 5) {
                console.error('[CSRF] ⚠️ POTENTIAL ATTACK DETECTED', {
                    userId,
                    failureCount: recentFailures.length,
                    routes: recentFailures.map(m => m.route),
                    timeWindow: '1 minute',
                    recommendation: 'Consider rate limiting or user investigation',
                });
            }
        }
    }
}

/**
 * Get CSRF metrics for monitoring dashboard
 */
export function getCSRFMetrics() {
    const now = Date.now();
    const last24h = metrics.filter(m => now - m.timestamp < 86400000); // 24 hours

    const totalValidations = last24h.length;
    const failures = last24h.filter(m => !m.validationPassed).length;
    const successes = totalValidations - failures;

    return {
        total: totalValidations,
        successes,
        failures,
        successRate: totalValidations > 0
            ? ((successes / totalValidations) * 100).toFixed(2) + '%'
            : 'N/A',
        last24h,
        summary: {
            healthy: failures < (totalValidations * 0.05), // <5% failure rate is healthy
            failureRate: totalValidations > 0
                ? ((failures / totalValidations) * 100).toFixed(2) + '%'
                : '0%',
        },
    };
}

/**
 * Clear metrics (for testing or reset)
 */
export function clearCSRFMetrics() {
    metrics.length = 0;
    console.log('[CSRF] Metrics cleared');
}
