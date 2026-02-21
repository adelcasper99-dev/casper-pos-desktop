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
  rememberMe?: boolean;
  lastActivity?: string;
  expiresAt?: string;
};

// JWT configuration
const secretKey = process.env.JWT_SECRET || 'dev-secret-key-casper-pos-desktop';
const key = new TextEncoder().encode(secretKey);

// Session TTL configurations
const SESSION_TTL = 31536000; // 365 days

/**
 * Create a new session (strictly JWT for offline desktop use)
 */
export async function createSession(_userId: string, userData: UserSession, _ttl: number = SESSION_TTL): Promise<string> {
  return await new SignJWT({ user: userData })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('365d')
    .sign(key);
}

/**
 * Get session data from JWT
 */
export async function getSession(token: string): Promise<UserSession | null> {
  try {
    const { payload } = await jwtVerify(token, key, {
      algorithms: ['HS256'],
    });
    return (payload as any).user || null;
  } catch {
    return null;
  }
}

/**
 * Refresh session (No-op for JWT as it is stateless and long-lived)
 */
export async function refreshSession(token: string): Promise<boolean> {
  const session = await getSession(token);
  return session !== null;
}

/**
 * Delete session (handled by cookie removal in client)
 */
export async function deleteSession(_token: string): Promise<void> {
  // Stateless
}

/**
 * Invalidate all sessions (Not possible with stateless JWT without a blacklist, 
 * but for single-user desktop app, deleting cookie is sufficient)
 */
export async function invalidateUserSessions(_userId: string): Promise<void> {
  // Not applicable for stateless JWT in this context
}

export const redisAvailable = false;
