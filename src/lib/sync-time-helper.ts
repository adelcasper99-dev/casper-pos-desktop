import { logger } from './logger';

export function getBoundedTimestamp(
    createdAt: string | number | Date | undefined,
    isSuspiciousInput: boolean = false
): { createdAt: Date; isTimeSuspicious: boolean } {
    const now = Date.now();
    const thirtyDaysAgo = now - 30 * 24 * 60 * 60 * 1000;
    const oneDayFuture = now + 24 * 60 * 60 * 1000;

    let finalIsTimeSuspicious = isSuspiciousInput;

    if (!createdAt) {
        return { createdAt: new Date(), isTimeSuspicious: finalIsTimeSuspicious };
    }

    const clientDate = new Date(createdAt);
    
    // Check for invalid date parsed
    if (isNaN(clientDate.getTime())) {
        logger.warn(`[Sync:TimeHelper] Invalid date format received: ${createdAt}. Falling back to server time.`);
        return { createdAt: new Date(), isTimeSuspicious: true };
    }

    if (clientDate.getTime() >= thirtyDaysAgo && clientDate.getTime() <= oneDayFuture) {
        return { createdAt: clientDate, isTimeSuspicious: finalIsTimeSuspicious };
    } else {
        logger.warn(`[Sync:TimeHelper] Skewed client timestamp: ${clientDate.toISOString()} is out of bounds [30d ago, 24h future]. Falling back to server time.`);
        return { createdAt: new Date(), isTimeSuspicious: true };
    }
}
