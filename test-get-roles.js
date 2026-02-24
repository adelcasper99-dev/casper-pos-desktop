const { getRoles } = require('./src/actions/roles');

async function test() {
    console.log('Calling getRoles...');
    const res = await getRoles();
    console.log('Result:', JSON.stringify(res, null, 2));
}

test().catch(console.error);
