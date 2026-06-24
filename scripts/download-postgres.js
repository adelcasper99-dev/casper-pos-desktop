const fs = require('fs');
const https = require('https');
const path = require('path');

// Direct download link for EnterpriseDB PostgreSQL 16 Windows x64 Installer
// Using the direct get.enterprisedb.com URL instead of getfile.jsp which expires.
const POSTGRES_URL = "https://get.enterprisedb.com/postgresql/postgresql-16.4-1-windows-x64.exe"; 
const DEST_DIR = path.join(__dirname, '..', 'build');
const DEST_FILE = path.join(DEST_DIR, 'postgresql-setup.exe');

if (!fs.existsSync(DEST_DIR)) {
    fs.mkdirSync(DEST_DIR, { recursive: true });
}

if (fs.existsSync(DEST_FILE)) {
    console.log(`[Setup] PostgreSQL installer already exists at ${DEST_FILE}. Skipping download.`);
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
