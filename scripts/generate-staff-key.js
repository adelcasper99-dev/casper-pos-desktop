/**
 * CASPER POS - Staff Override Key Generator
 * 
 * Usage:
 *   node scripts/generate-staff-key.js <challenge_code> <machine_id>
 */

require('dotenv').config();
const jwt = require('jsonwebtoken');
const crypto = require('crypto');

const challenge = process.argv[2];
const machineId = process.argv[3];

if (!challenge || !machineId) {
    console.error("Error: Missing parameters.");
    console.error("Usage: node scripts/generate-staff-key.js <challenge_code> <machine_id>");
    process.exit(1);
}

const privateKey = process.env.LICENSE_PRIVATE_KEY;

if (!privateKey) {
    console.error("Error: LICENSE_PRIVATE_KEY is not defined in your .env file.");
    process.exit(1);
}

// Generate unique ID for replay attack protection
const jti = crypto.randomUUID();

// Define Expiry (5 minutes from now)
const exp = Math.floor(Date.now() / 1000) + 300;

// Shape must match LicensePayload in verify.ts
const payload = {
    tenant_id: "staff-override",
    status: "active",
    trial_ends_at: new Date(Date.now() + 10 * 365 * 24 * 60 * 60 * 1000).toISOString(), // 10 years
    server_now: new Date().toISOString(),
    machine_id: machineId.toUpperCase(),
    challenge: challenge.toUpperCase(),
    jti: jti,
    exp: exp
};

try {
    const token = jwt.sign(payload, privateKey.replace(/\\n/g, '\n'), { algorithm: 'RS256' });
    console.log("\n=================== CASPER STAFF OVERRIDE KEY ===================");
    console.log("Challenge:", challenge);
    console.log("Machine ID:", machineId);
    console.log("Expires in: 5 minutes");
    console.log("-----------------------------------------------------------------");
    console.log(token);
    console.log("=================================================================\n");
} catch (error) {
    console.error("Signing failed:", error.message);
    process.exit(1);
}
