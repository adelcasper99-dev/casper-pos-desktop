const crypto = require('crypto');
const fs = require('fs');
const envPath = '.env';

let envContent = '';
if (fs.existsSync(envPath)) {
    envContent = fs.readFileSync(envPath, 'utf8');
}

if (!envContent.includes('LICENSE_PRIVATE_KEY')) {
    const { privateKey, publicKey } = crypto.generateKeyPairSync('rsa', {
        modulusLength: 2048,
        publicKeyEncoding: { type: 'spki', format: 'pem' },
        privateKeyEncoding: { type: 'pkcs8', format: 'pem' }
    });

    const privKeyStr = privateKey.replace(/\n/g, '\\n');
    const pubKeyStr = publicKey.replace(/\n/g, '\\n');

    fs.appendFileSync(envPath, "\nLICENSE_PRIVATE_KEY=\"" + privKeyStr + "\"\nLICENSE_PUBLIC_KEY=\"" + pubKeyStr + "\"\n");
    console.log('✅ Successfully generated and appended RSA keys to .env');
} else {
    console.log('✅ Keys already exist in .env');
}
