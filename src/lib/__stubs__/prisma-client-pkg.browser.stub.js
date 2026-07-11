/**
 * Browser stub for the @prisma/client PACKAGE.
 *
 * Injected by webpack resolve.alias in next.config.js for client builds only.
 * Bare package names (@prisma/client) are always intercepted by webpack's alias
 * system BEFORE any path-alias plugin (like Next.js's JsConfigPathsPlugin) runs,
 * so this stub reliably prevents Prisma from being bundled into the browser chunk.
 *
 * Exports empty objects — PrismaClient and Prisma will be `undefined` / `{}` in the
 * browser. This is safe because prisma.ts guards all instantiation behind
 * `typeof window === 'undefined'`.
 */
module.exports = {};
