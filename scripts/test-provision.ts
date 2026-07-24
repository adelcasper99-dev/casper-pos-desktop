import { provisionTenantCore } from '../src/actions/hq-tenant-actions';

async function test() {
  try {
    console.log('Testing provisionTenantCore...');
    const res = await provisionTenantCore({
      name: '77778_test',
      domain: '777779_test',
      adminUsername: '7777771_test',
      adminPassword: 'password123',
      adminRole: 'ADMIN',
      duration: '14_DAYS'
    });
    console.log('SUCCESS:', res);
  } catch (err: any) {
    console.error('PROVISION ERROR CODE:', err.code);
    console.error('PROVISION ERROR META:', err.meta);
    console.error('PROVISION ERROR MESSAGE:', err.message);
    console.error('FULL ERROR:', err);
  }
}

test();
