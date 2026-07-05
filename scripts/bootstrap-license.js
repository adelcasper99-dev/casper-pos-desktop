/**
 * CASPER POS - First-Time License Bootstrap Script
 *
 * Problem: On fresh install the app redirects to /activate with no way
 * to generate a code (settings are locked). This script breaks the
 * circular dependency by writing a valid signed JWT directly into the
 * StoreSettings table in the database.
 *
 * Usage:
 *   node scripts/bootstrap-license.js [--days 365] [--plan premium] [--tenant "My Store"]
 *
 * Requirements:
 *   - DATABASE_URL in .env (or environment)
 *   - LICENSE_PRIVATE_KEY in .env (RS256 PEM private key)
 *
 * After running:
 *   Restart `npm run dev` - the app will be unlocked and show the dashboard.
 */

require('dotenv').config();

const { PrismaClient } = require('@prisma/client');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const os = require('os');
const { execSync } = require('child_process');

const prisma = new PrismaClient();

function getArg(flag, defaultValue) {
    const idx = process.argv.indexOf(flag);
    return idx !== -1 && process.argv[idx + 1] ? process.argv[idx + 1] : defaultValue;
}

const DAYS        = parseInt(getArg('--days',   '365'), 10);
const PLAN        = getArg('--plan',   'premium');
const TENANT_NAME = getArg('--tenant', 'Casper Store');

function getMachineId() {
    try {
        if (process.platform === 'win32') {
            const out = execSync('wmic csproduct get UUID /value', { stdio: ['pipe','pipe','ignore'] }).toString();
            const match = out.match(/UUID=([^\r\n]+)/i);
            if (match && match[1].trim()) return match[1].trim().toUpperCase();
        }
        if (process.platform === 'linux') {
            return execSync('cat /etc/machine-id').toString().trim().toUpperCase();
        }
        if (process.platform === 'darwin') {
            return execSync("ioreg -rd1 -c IOPlatformExpertDevice | awk '/IOPlatformUUID/ {print $NF}'",
                { stdio: ['pipe','pipe','ignore'] }).toString().replace(/"/g,'').trim().toUpperCase();
        }
    } catch (_) {}
    return crypto.createHash('sha256').update(os.hostname()).digest('hex').toUpperCase().slice(0, 36);
}

async function main() {
    console.log('\n CASPER POS - License Bootstrap\n');

    const rawKey = process.env.LICENSE_PRIVATE_KEY;
    if (!rawKey) {
        console.error('ERROR: LICENSE_PRIVATE_KEY not found in .env');
        process.exit(1);
    }
    const privateKey = rawKey.replace(/\\n/g, '\n');

    const machineId = getMachineId();
    console.log('Machine ID  :', machineId);

    const trialEndsAt = new Date(Date.now() + DAYS * 24 * 60 * 60 * 1000);

    const tenant = await prisma.tenant.upsert({
        where:  { id: 'bootstrap-tenant' },
        create: { id: 'bootstrap-tenant', clientName: TENANT_NAME, planType: PLAN, status: 'active', trialEndsAt, machineId, activationCode: null },
        update: { clientName: TENANT_NAME, planType: PLAN, status: 'active', trialEndsAt, machineId, activationCode: null },
    });
    console.log('Tenant      :', tenant.clientName, '(' + tenant.id + ')');
    console.log('Expires     :', trialEndsAt.toDateString(), '(+' + DAYS + ' days)');

    const payload = {
        tenant_id:     tenant.id,
        status:        tenant.status,
        trial_ends_at: tenant.trialEndsAt.toISOString(),
        server_now:    new Date().toISOString(),
        machine_id:    machineId,
    };

    let token;
    try {
        token = jwt.sign(payload, privateKey, { algorithm: 'RS256' });
    } catch (err) {
        console.error('JWT signing failed. Is LICENSE_PRIVATE_KEY a valid RS256 PEM?');
        console.error(err.message);
        process.exit(1);
    }
    console.log('JWT signed  :', token.slice(0, 40) + '...');

    await prisma.storeSettings.upsert({
        where:  { id: 'settings' },
        create: { id: 'settings', name: TENANT_NAME, licenseJwt: token, lastServerNow: Date.now() },
        update: { licenseJwt: token, lastServerNow: Date.now() },
    });

    console.log('\n License written to database!');
    console.log('  Restart npm run dev -- the dashboard will open directly.\n');
    console.log('-'.repeat(60));
    console.log('Full JWT (copy this to re-apply on another machine):');
    console.log(token);
    console.log('-'.repeat(60) + '\n');
}

main()
    .catch(err => { console.error('Bootstrap failed:', err.message); process.exit(1); })
    .finally(async () => { await prisma.$disconnect(); });
