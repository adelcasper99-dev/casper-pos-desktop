import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';

export async function setup() {
    const schemaPath = path.resolve(process.cwd(), 'prisma', 'schema.base.prisma');
    const testSchemaPath = path.resolve(process.cwd(), 'prisma', 'schema.test.prisma');
    
    if (fs.existsSync(schemaPath)) {
        const originalSchema = fs.readFileSync(schemaPath, 'utf8');
        
        // Create an isolated schema for tests with a custom client output path
        let patchedSchema = originalSchema.replace(
            /provider\s*=\s*"base"/g,
            'provider = "sqlite"'
        );
        
        patchedSchema = patchedSchema.replace(
            /generator client \{[\s\S]*?\}/,
            `generator client {\n  provider = "prisma-client-js"\n  output   = "../node_modules/.prisma-test/client"\n}`
        );
        
        fs.writeFileSync(testSchemaPath, patchedSchema, 'utf8');
        
        console.log('[Global Setup] Generating Prisma Client for SQLite (isolated)...');
        try {
            execSync('npx prisma generate --schema=prisma/schema.test.prisma', { stdio: 'ignore' });
        } catch (e) {
            console.error('Failed to generate Prisma client for SQLite:', e);
        }
    }
}

export async function teardown() {
    const testSchemaPath = path.resolve(process.cwd(), 'prisma', 'schema.test.prisma');
    
    if (fs.existsSync(testSchemaPath)) {
        fs.unlinkSync(testSchemaPath);
        console.log('[Global Teardown] Cleaned up test schema file.');
    }
}
