import { PrismaClient } from '@prisma/client';
import crypto from 'crypto';

const prisma = new PrismaClient();

async function main() {
    const args = process.argv.slice(2);
    const tenantName = args[0];
    const tenantSlug = args[1];
    const days = parseInt(args[2] || '365', 10);

    if (!tenantName || !tenantSlug) {
        console.error('Usage: npx tsx scripts/provision-tenant.ts "<Tenant Name>" <slug> [days=365]');
        process.exit(1);
    }

    // Create Tenant
    const tenant = await prisma.tenant.create({
        data: {
            name: tenantName,
            slug: tenantSlug,
            isActive: true,
            sequences: {
                create: [
                    { prefix: 'INV' },
                    { prefix: 'RCP' },
                    { prefix: 'PO' },
                    { prefix: 'RET' }
                ]
            }
        }
    });

    // Generate License Key (e.g. XXXX-XXXX-XXXX-XXXX)
    const rawKey = crypto.randomBytes(8).toString('hex').toUpperCase();
    const licenseKey = `${rawKey.slice(0,4)}-${rawKey.slice(4,8)}-${rawKey.slice(8,12)}-${rawKey.slice(12,16)}`;
    
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + days);

    const license = await prisma.license.create({
        data: {
            key: licenseKey,
            macAddress: '',
            expiresAt,
            tenantId: tenant.id
        }
    });

    console.log('\n✅ Tenant Provisioned Successfully!');
    console.log('-----------------------------------');
    console.log(`ID:      ${tenant.id}`);
    console.log(`Name:    ${tenant.name}`);
    console.log(`Slug:    ${tenant.slug}`);
    console.log(`License: ${license.key}`);
    console.log(`Expires: ${expiresAt.toISOString()}`);
    console.log('-----------------------------------\n');
}

main()
  .catch(e => {
      console.error(e);
      process.exit(1);
  })
  .finally(async () => {
      await prisma.$disconnect();
  });
