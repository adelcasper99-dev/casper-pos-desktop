const fs = require('fs');
const https = require('https');
const path = require('path');
const crypto = require('crypto');

// Direct download link for EnterpriseDB PostgreSQL 16 Windows x64 Installer
// Using the direct get.enterprisedb.com URL instead of getfile.jsp which expires.
const POSTGRES_URL = "https://get.enterprisedb.com/postgresql/postgresql-16.4-1-windows-x64.exe"; 
const EXPECTED_HASH = "f4bf0ac4b33471f18aad7d1d9cc52613003f3a3a612aae167366bf7f7840b2bc";


const DEST_DIR = path.join(__dirname, '..', 'build');
const DEST_FILE = path.join(DEST_DIR, 'postgresql-setup.exe');

if (!fs.existsSync(DEST_DIR)) {
    fs.mkdirSync(DEST_DIR, { recursive: true });
}

function verifyChecksum(filePath, expectedHash) {
    console.log(`[Setup] Verifying SHA-256 Checksum...`);
    const fileBuffer = fs.readFileSync(filePath);
    const hashSum = crypto.createHash('sha256');
    hashSum.update(fileBuffer);
    const hex = hashSum.digest('hex').toLowerCase();

    if (hex !== expectedHash.toLowerCase()) {
        console.error(`[Setup] SECURITY ERROR: Checksum mismatch!`);
        console.error(`[Setup] Expected: ${expectedHash}`);
        console.error(`[Setup] Actual:   ${hex}`);
        fs.unlinkSync(filePath);
        process.exit(1);
    }
    console.log(`[Setup] Checksum verified successfully.`);
}

if (fs.existsSync(DEST_FILE)) {
    console.log(`[Setup] PostgreSQL installer already exists at ${DEST_FILE}.`);
    verifyChecksum(DEST_FILE, EXPECTED_HASH);
    process.exit(0);
}

console.log(`[Setup] Downloading PostgreSQL installer from EnterpriseDB... (This may take a while depending on your connection)`);

const file = fs.createWriteStream(DEST_FILE);

function download(url) {
    https.get(url, (response) => {
        // Handle redirects
        if (response.statusCode >= 300 && response.statusCode < 400 && response.headers.location) {
            console.log(`[Setup] Following redirect to: ${response.headers.location}`);
            download(response.headers.location);
        } else if (response.statusCode === 200) {
            const totalBytes = parseInt(response.headers['content-length'], 10);
            let downloadedBytes = 0;

            response.on('data', (chunk) => {
                downloadedBytes += chunk.length;
                const percent = ((downloadedBytes / totalBytes) * 100).toFixed(1);
                process.stdout.write(`\r[Setup] Downloading... ${percent}%`);
            });

            response.pipe(file);

            file.on('finish', () => {
                file.close();
                console.log(`\n[Setup] Successfully downloaded PostgreSQL installer to ${DEST_FILE}`);
                verifyChecksum(DEST_FILE, EXPECTED_HASH);
            });
        } else {
            console.error(`\n[Setup] Failed to download. Status Code: ${response.statusCode}`);
            fs.unlinkSync(DEST_FILE);
            process.exit(1);
        }
    }).on('error', (err) => {
        fs.unlinkSync(DEST_FILE);
        console.error(`\n[Setup] Error downloading PostgreSQL installer: ${err.message}`);
        process.exit(1);
    });
}

download(POSTGRES_URL);
