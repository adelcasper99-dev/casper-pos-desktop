/**
 * Environment variable configuration and validation
 * All environment variables should be accessed through this module
 */

export const env = {
  // Database
  DATABASE_URL: process.env.DATABASE_URL!,

  // Authentication
  JWT_SECRET: process.env.JWT_SECRET!,

  // Redis (Optional)
  REDIS_HOST: process.env.REDIS_HOST,
  REDIS_PORT: process.env.REDIS_PORT ? parseInt(process.env.REDIS_PORT) : 6379,
  REDIS_PASSWORD: process.env.REDIS_PASSWORD,
  REDIS_DATABASE: process.env.REDIS_DATABASE ? parseInt(process.env.REDIS_DATABASE) : 0,

  // Sentry (Optional)
  SENTRY_DSN: process.env.NEXT_PUBLIC_SENTRY_DSN,
  SENTRY_AUTH_TOKEN: process.env.SENTRY_AUTH_TOKEN,

  // Application
  NODE_ENV: process.env.NODE_ENV || 'development',
  // ✅ PRODUCTION FIX: No localhost fallback in production
  APP_URL: process.env.NEXT_PUBLIC_APP_URL || (
    process.env.NODE_ENV === 'production'
      ? '' // Production MUST set NEXT_PUBLIC_APP_URL
      : 'http://localhost:3000' // Development fallback
  ),

  // Feature Flags (Optional)
  ENABLE_ANALYTICS: process.env.ENABLE_ANALYTICS === 'true',
  ENABLE_WEBSOCKETS: process.env.ENABLE_WEBSOCKETS === 'true',

  // Computed
  IS_PRODUCTION: process.env.NODE_ENV === 'production',
  IS_DEVELOPMENT: process.env.NODE_ENV === 'development',
  IS_TEST: process.env.NODE_ENV === 'test',
} as const;

// Validate required variables on module load
// ✅ PRODUCTION FIX: Add NEXT_PUBLIC_APP_URL validation for production
const requiredVars = [
  'DATABASE_URL',
  'JWT_SECRET',
  ...(process.env.NODE_ENV === 'production' ? ['NEXT_PUBLIC_APP_URL' as const] : [])
] as const;

for (const key of requiredVars) {
  if (!process.env[key]) {
    throw new Error(`❌ Missing required environment variable: ${key}`);
  }
}

// Warn about optional but recommended variables
if (!env.REDIS_HOST && env.IS_PRODUCTION) {
  console.warn('⚠️  REDIS_HOST not set - using JWT fallback (not horizontally scalable)');
}

if (!env.SENTRY_DSN && env.IS_PRODUCTION) {
  console.warn('⚠️  SENTRY_DSN not set - error tracking disabled');
}

// Log startup configuration (non-sensitive)
if (env.IS_DEVELOPMENT) {
  console.log('🔧 Environment Configuration:', {
    NODE_ENV: env.NODE_ENV,
    APP_URL: env.APP_URL,
    REDIS: env.REDIS_HOST ? 'Configured' : 'Disabled',
    SENTRY: env.SENTRY_DSN ? 'Configured' : 'Disabled',
  });
}
