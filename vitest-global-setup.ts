import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';

export async function setup() {
    const schemaPath = path.resolve(process.cwd(), 'prisma', 'schema.prisma');
    const testSchemaPath = path.resolve(process.cwd(), 'prisma', 'schema.test.prisma');
    
    if (fs.existsSync(schemaPath)) {
        const originalSchema = fs.readFileSync(schemaPath, 'utf8');
        
        // Create an isolated schema for tests
        const patchedSchema = originalSchema.replace(
            /provider\s*=\s*"postgresql"/g,
            'provider = "sqlite"'
        );
        fs.writeFileSync(testSchemaPath, patchedSchema, 'utf8');
        
        console.log('[Global Setup] Generating Prisma Client for SQLite...');
        try {
            execSync('npx prisma generate --schema=prisma/schema.test.prisma', { stdio: 'inherit' });
        } catch (e) {
            console.error('Failed to generate Prisma client for SQLite:', e);
        }
    }
}

export async function teardown() {
    const testSchemaPath = path.resolve(process.cwd(), 'prisma', 'schema.test.prisma');
    
    if (fs.existsSync(testSchemaPath)) {
        fs.unlinkSync(testSchemaPath);
        
        console.log('[Global Teardown] Restoring Prisma Client for PostgreSQL...');
        try {
            execSync('npx prisma generate', { stdio: 'inherit' });
        } catch (e) {
            console.error('Failed to restore Prisma client:', e);
        }
    }
}
