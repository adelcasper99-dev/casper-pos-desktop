import { Redis } from '@upstash/redis';
import { SignJWT, jwtVerify } from 'jose';

export type UserSession = {
  id: string;
  username: string;
  name: string | null;
  role: string;
  permissions: string[];
  branchId?: string | null;
  branchName?: string;
  branchType?: string;
  rememberMe?: boolean; // Track if extended session
  lastActivity?: string; // ISO timestamp of last activity
  deviceFingerprint?: string; // Security: detect session hijacking
  expiresAt?: string; // ISO timestamp when session expires (server-provided)
};

// Redis client (only if credentials provided)
let redis: Redis | null = null;
let redisAvailable = true;

// Initialize Redis if credentials exist AND are valid (not placeholders)
const redisUrl = process.env.UPSTASH_REDIS_REST_URL;
const redisToken = process.env.UPSTASH_REDIS_REST_TOKEN;
const isPlaceholder = redisUrl?.includes('your-redis-url') || redisToken?.includes('your-redis-token');

if (redisUrl && redisToken && !isPlaceholder) {
  redis = new Redis({
    url: redisUrl,
    token: redisToken,
  });
  console.log('✅ Redis session storage enabled');
} else {
  if (isPlaceholder) {
    console.warn('⚠️ Redis credentials are placeholders - defaulting to local JWT session');
  }
  redisAvailable = false;
}

// JWT configuration (fallback)
const secretKey = process.env.JWT_SECRET || 'dev-secret-key-do-not-use-in-prod';
const key = new TextEncoder().encode(secretKey);

// Session TTL configurations
const SESSION_TTL = 31536000; // 365 days (default)
const EXTENDED_SESSION_TTL = 31536000; // 365 days (Remember Me)

// ===== REDIS SESSION FUNCTIONS =====

/**
 * Create a session in Redis and return session ID
 * @param userId - User ID
 * @param userData - Session data
 * @param ttl - Time to live in seconds
 */
async function createRedisSession(userId: string, userData: UserSession, ttl: number = SESSION_TTL): Promise<string> {
  if (!redis) throw new Error('Redis not initialized');

  const sessionId = crypto.randomUUID();
  const key = `session:${sessionId}`;
  const userSessionsKey = `user:sessions:${userId}`;

  // Calculate expiry timestamp
  const expiresAt = new Date(Date.now() + (ttl * 1000)).toISOString();

  // Add creation timestamp and expiry
  const sessionData = {
    ...userData,
    lastActivity: new Date().toISOString(),
    expiresAt: expiresAt,
  };

  const pipeline = redis.pipeline();
  pipeline.setex(key, ttl, JSON.stringify(sessionData));
  pipeline.sadd(userSessionsKey, sessionId);
  // Set expiry on the set as well (to match max possible session length)
  pipeline.expire(userSessionsKey, ttl);

  await pipeline.exec();

  return sessionId;
}

/**
 * Get session data from Redis with backward compatibility
 */
async function getRedisSession(sessionId: string): Promise<UserSession | null> {
  if (!redis) return null;

  const key = `session:${sessionId}`;
  const data = await redis.get<string>(key);

  if (!data) return null;

  const parsed = typeof data === 'string' ? JSON.parse(data) : data;

  // Backward compatibility: add missing fields for old sessions
  if (!parsed.expiresAt) {
    // Calculate expiry based on Remember Me (default to 24 hours if not set)
    const ttl = parsed.rememberMe ? EXTENDED_SESSION_TTL : SESSION_TTL;
    const lastActivity = parsed.lastActivity ? new Date(parsed.lastActivity).getTime() : Date.now();
    parsed.expiresAt = new Date(lastActivity + (ttl * 1000)).toISOString();
  }

  // deviceFingerprint can remain undefined for old sessions (handled in validation)

  return parsed;
}

/**
 * Refresh session with sliding expiration
 * Resets full TTL based on Remember Me preference
 * @param sessionId - Session ID to refresh
 * @returns true if refreshed successfully
 */
async function refreshRedisSession(sessionId: string): Promise<boolean> {
  if (!redis) return false;

  const key = `session:${sessionId}`;

  try {
    // Get session data to check Remember Me preference
    const sessionData = await redis.get<string>(key);
    if (!sessionData) return false;

    const parsed = typeof sessionData === 'string' ? JSON.parse(sessionData) : sessionData;
    const sessionTTL = parsed.rememberMe ? EXTENDED_SESSION_TTL : SESSION_TTL;

    // Reset full TTL (sliding window)
    const result = await redis.expire(key, sessionTTL);

    // Update last activity timestamp and expiry
    const expiresAt = new Date(Date.now() + (sessionTTL * 1000)).toISOString();
    parsed.lastActivity = new Date().toISOString();
    parsed.expiresAt = expiresAt;

    // Don't need to update set expiry every time, but could if we wanted to be precise

    await redis.set(key, JSON.stringify(parsed), { ex: sessionTTL });

    return result === 1;
  } catch (error) {
    console.error('Failed to refresh session:', error);
    return false;
  }
}

/**
 * Delete session from Redis
 */
async function deleteRedisSession(sessionId: string): Promise<void> {
  if (!redis) return;

  const key = `session:${sessionId}`;

  // Clean up from user set first (need to get user ID from session if possible, but we don't have it here efficiently without reading first)
  // To keep it simple for logout (where we just kill the session), we might leave a stale ID in the set.
  // The set is mostly for "force logout all", so it's okay if it has some extra dead IDs (Redis sets handle uniqueness).
  // Ideally, we'd read the session, get the userId, then remove from set.
  try {
    const sessionData = await redis.get<string>(key);
    if (sessionData) {
      const parsed = typeof sessionData === 'string' ? JSON.parse(sessionData) : sessionData;
      if (parsed.id) {
        await redis.srem(`user:sessions:${parsed.id}`, sessionId);
      }
    }
  } catch (e) {
    // Ignore read error, proceed to delete
  }

  await redis.del(key);
}

/**
 * Invalidate all sessions for a specific user
 * @param userId - The user ID to invalidate
 */
export async function invalidateUserSessions(userId: string): Promise<void> {
  if (!redis) return;

  const userSessionsKey = `user:sessions:${userId}`;

  try {
    // Get all session IDs
    const sessionIds = await redis.smembers(userSessionsKey);

    if (sessionIds.length === 0) return;

    const pipeline = redis.pipeline();

    // Delete all session keys
    for (const sessionId of sessionIds) {
      pipeline.del(`session:${sessionId}`);
    }

    // Delete the set itself
    pipeline.del(userSessionsKey);

    await pipeline.exec();
    console.log(`🔒 Invalidated ${sessionIds.length} sessions for user ${userId}`);
  } catch (error) {
    console.error(`Failed to invalidate sessions for user ${userId}:`, error);
  }
}

// ===== JWT FALLBACK FUNCTIONS =====

/**
 * Create JWT session (fallback when Redis unavailable)
 */
async function createJWTSession(userData: UserSession): Promise<string> {
  return await new SignJWT({ user: userData })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('365d') // Extended for JWT as well
    .sign(key);
}

/**
 * Verify and decode JWT
 */
async function decodeJWTSession(token: string): Promise<UserSession | null> {
  try {
    const { payload } = await jwtVerify(token, key, {
      algorithms: ['HS256'],
    });
    return (payload as any).user || null;
  } catch {
    return null;
  }
}

// ===== HYBRID PUBLIC API =====

/**
 * Create a new session (tries Redis first, falls back to JWT)
 * @param userId - User ID
 * @param userData - Session data
 * @param ttl - Time to live in seconds (default: 365 days)
 */
export async function createSession(userId: string, userData: UserSession, ttl: number = SESSION_TTL): Promise<string> {
  // Try Redis first if available
  if (redisAvailable && redis) {
    try {
      return await createRedisSession(userId, userData, ttl);
    } catch (error: any) {
      // Check for rate limit (429) or other Redis errors
      if (error?.status === 429 || error?.message?.includes('rate limit')) {
        console.warn('⚠️ Redis rate limit exceeded - falling back to JWT');
        redisAvailable = false;
      } else {
        console.error('❌ Redis error:', error.message);
      }
      // Fall through to JWT
    }
  }

  // Use JWT fallback
  console.log('🔄 Using JWT session (Redis unavailable)');
  return await createJWTSession(userData);
}

/**
 * Get session data (tries Redis first, then JWT decode)
 */
export async function getSession(sessionId: string): Promise<UserSession | null> {
  // Try Redis first if available
  if (redisAvailable && redis) {
    try {
      const session = await getRedisSession(sessionId);
      if (session) return session;
      // If not found in Redis, might be a JWT token
    } catch (error: any) {
      if (error?.status === 429) {
        console.warn('⚠️ Redis rate limit on read - falling back to JWT');
        redisAvailable = false;
      }
    }
  }

  // Try decoding as JWT (for backward compatibility or fallback)
  return await decodeJWTSession(sessionId);
}

/**
 * Refresh session TTL
 */
export async function refreshSession(sessionId: string): Promise<boolean> {
  // Try Redis first
  if (redisAvailable && redis) {
    try {
      const refreshed = await refreshRedisSession(sessionId);
      if (refreshed) return true;
    } catch (error: any) {
      if (error?.status === 429) {
        redisAvailable = false;
      }
    }
  }

  // For JWT, check if valid (no refresh needed - token has expiry)
  const session = await decodeJWTSession(sessionId);
  return session !== null;
}

/**
 * Delete session (logout)
 */
export async function deleteSession(sessionId: string): Promise<void> {
  // Try to delete from Redis (ignore errors)
  if (redis) {
    try {
      await deleteRedisSession(sessionId);
    } catch {
      // Ignore errors on logout
    }
  }

  // For JWT, deletion happens by cookie removal (stateless)
}

/**
 * Health check - test Redis connectivity
 */
export async function checkRedisHealth(): Promise<{ available: boolean; mode: 'redis' | 'jwt' }> {
  if (!redis) {
    return { available: false, mode: 'jwt' };
  }

  try {
    await redis.ping();
    redisAvailable = true;
    return { available: true, mode: 'redis' };
  } catch {
    redisAvailable = false;
    return { available: false, mode: 'jwt' };
  }
}

// Retry Redis connectivity every hour
if (typeof setInterval !== 'undefined') {
  setInterval(async () => {
    if (!redisAvailable && redis) {
      const health = await checkRedisHealth();
      if (health.available) {
        console.log('✅ Redis connection restored');
      }
    }
  }, 3600000); // 1 hour
}

// Export health check for monitoring
export { redisAvailable };
