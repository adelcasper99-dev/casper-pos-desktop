const http = require('http');

console.log('================================================================');
console.log('⚡ BENCHMARKING AUTHENTICATED ROUTE COMPILATION & RENDERING (HTTP 200)');
console.log('================================================================\n');

function measureUrl(url, cookie = '') {
    return new Promise((resolve, reject) => {
        const start = Date.now();
        const urlObj = new URL(url);
        const options = {
            hostname: urlObj.hostname,
            port: urlObj.port,
            path: urlObj.pathname + urlObj.search,
            method: 'GET',
            headers: {
                'Cookie': cookie,
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Benchmark'
            }
        };

        const req = http.request(options, (res) => {
            let body = '';
            res.on('data', chunk => body += chunk);
            res.on('end', () => {
                const elapsed = Date.now() - start;
                resolve({
                    statusCode: res.statusCode,
                    location: res.headers['location'] || null,
                    elapsed,
                    size: body.length
                });
            });
        });
        req.on('error', (err) => reject(err));
        req.setTimeout(60000, () => {
            req.destroy();
            reject(new Error('Timeout after 60s'));
        });
        req.end();
    });
}

async function runBenchmarks() {
    // Exact cookies required by Casper POS middleware to render authenticated pages
    const authCookie = 'nodeRole=STANDALONE; session=super-admin-token-benchmark; tenantId=default; csrf-token=benchmark-csrf';

    const routes = [
        { name: 'POS Route (Full Page Component Tree)', url: 'http://127.0.0.1:3001/pos', cookie: authCookie },
        { name: 'Inventory Route (Full Page Component Tree)', url: 'http://127.0.0.1:3001/inventory', cookie: authCookie },
        { name: 'Reports Route (Full Page Component Tree with Recharts)', url: 'http://127.0.0.1:3001/reports', cookie: authCookie },
        { name: 'Network Setup Page (Standalone Setup)', url: 'http://127.0.0.1:3001/network-setup', cookie: 'nodeRole=UNCONFIGURED' }
    ];

    let all200 = true;

    for (const r of routes) {
        try {
            console.log(`▶ [${r.name}] Requesting ${r.url}...`);
            const res = await measureUrl(r.url, r.cookie);
            console.log(`   Status: HTTP ${res.statusCode} | Payload Size: ${(res.size / 1024).toFixed(1)} KB | Full Compile & HTML Render Time: ${res.elapsed}ms`);
            if (res.location) {
                console.log(`   Redirect Location: ${res.location}`);
            }
            console.log('');
            if (res.statusCode !== 200) {
                all200 = false;
            }
        } catch (err) {
            all200 = false;
            console.error(`   ❌ Failed to fetch ${r.url}: ${err.message}\n`);
        }
    }

    if (all200) {
        console.log('✅ ALL PAGES RETURNED HTTP 200 OK — FULL HTML COMPILED & RENDERED SUCCESSFULLY.');
    } else {
        console.log('⚠️ Some routes returned non-200 status.');
        process.exit(1);
    }
}

runBenchmarks();
