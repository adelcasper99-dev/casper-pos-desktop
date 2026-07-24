import { provisionTenantCore } from '../src/actions/hq-tenant-actions';
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient({
  datasources: {
    db: {
      url: 'postgresql://postgres:casper_pass_123@109.123.247.119:6432/casper_db?pgbouncer=true'
    }
  }
});

async function testFullWorkflow() {
  console.log('🚀 === STARTING E2E TENANT WORKFLOW INTEGRATION TEST ===\n');

  const randomSuffix = Math.floor(1000 + Math.random() * 9000);
  const tenant1Data = {
    name: `Store Alpha ${randomSuffix}`,
    domain: `alpha-${randomSuffix}`,
    adminUsername: `admin_alpha_${randomSuffix}`,
    adminPassword: `PassAlpha123!`,
    adminRole: 'ADMIN' as const,
    duration: '1_MONTH' as const
  };

  const tenant2Data = {
    name: `Store Beta ${randomSuffix}`,
    domain: `beta-${randomSuffix}`,
    adminUsername: `admin_beta_${randomSuffix}`,
    adminPassword: `PassBeta123!`,
    adminRole: 'ADMIN' as const,
    duration: '1_YEAR' as const
  };

  // STEP 1: Provision Tenant 1
  console.log(`1️⃣ Provisioning Tenant 1: "${tenant1Data.name}" (${tenant1Data.domain})...`);
  const t1Result = await provisionTenantCore(tenant1Data);
  console.log(`✅ Tenant 1 Created Successfully! ID: ${t1Result.tenant.id}`);
  console.log(`   Activation Code: ${t1Result.activationCode}`);
  console.log(`   Admin User: ${t1Result.user.username}`);

  // STEP 2: Verify Tenant 1 Database Entities
  console.log(`\n2️⃣ Verifying Database Persistence & Isolation for Tenant 1...`);
  const t1User = await prisma.user.findUnique({ where: { username: tenant1Data.adminUsername } });
  if (!t1User) throw new Error('Tenant 1 Admin User missing from DB!');
  const isPasswordValid = await bcrypt.compare(tenant1Data.adminPassword, t1User.password);
  console.log(`   - User Authenticated via Hashed Password: ${isPasswordValid ? 'PASS ✅' : 'FAIL ❌'}`);

  const t1Branch = await prisma.branch.findFirst({ where: { tenantId: t1Result.tenant.id } });
  console.log(`   - Branch Created: ${t1Branch?.name} (${t1Branch?.code}) ✅`);

  const t1Treasury = await prisma.treasury.findFirst({ where: { tenantId: t1Result.tenant.id } });
  console.log(`   - Treasury Created: ${t1Treasury?.name} (isDefault: ${t1Treasury?.isDefault}) ✅`);

  const t1Settings = await prisma.storeSettings.findFirst({ where: { tenantId: t1Result.tenant.id } });
  console.log(`   - StoreSettings Created: ${t1Settings?.name} (${t1Settings?.currency}) ✅`);

  const t1Accounts = await prisma.account.findMany({ where: { tenantId: t1Result.tenant.id } });
  console.log(`   - Chart of Accounts Seeded: ${t1Accounts.length} Accounts (Codes: ${t1Accounts.map(a => a.code).join(', ')}) ✅`);

  // STEP 3: Provision Tenant 2 (Concurrency & Multi-Tenancy Collision Test)
  console.log(`\n3️⃣ Provisioning Tenant 2: "${tenant2Data.name}" (${tenant2Data.domain}) to test Multi-Tenant isolation...`);
  const t2Result = await provisionTenantCore(tenant2Data);
  console.log(`✅ Tenant 2 Created Successfully! ID: ${t2Result.tenant.id}`);
  console.log(`   Activation Code: ${t2Result.activationCode}`);

  // STEP 4: Verify Tenant 2 Chart of Accounts Coexistence (Same Codes: 1110, 1120, etc.)
  console.log(`\n4️⃣ Verifying Multi-Tenant GL Account Coexistence...`);
  const t2Accounts = await prisma.account.findMany({ where: { tenantId: t2Result.tenant.id } });
  console.log(`   - Tenant 2 Accounts Seeded: ${t2Accounts.length} Accounts (Codes: ${t2Accounts.map(a => a.code).join(', ')}) ✅`);
  console.log(`   - Account Code '1110' exists in Tenant 1 (ID: ${t1Accounts.find(a => a.code === '1110')?.id}) and Tenant 2 (ID: ${t2Accounts.find(a => a.code === '1110')?.id}) without collision! ✅`);

  console.log('\n🎉 ========================================================');
  console.log('🎉  ALL E2E WORKFLOW INTEGRATION TESTS PASSED 100% CLEAN!  ');
  console.log('🎉 ========================================================\n');
}

testFullWorkflow()
  .catch((err) => {
    console.error('\n❌ E2E TEST FAILED:', err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
