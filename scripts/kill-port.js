/**
 * scripts/kill-port.js
 * --------------------
 * Native, cross-platform port killer with zero npx/external dependencies.
 * Parses netstat line-by-line with boundary-safe regex to prevent false matches.
 *
 * Usage: node scripts/kill-port.js <port>
 */

const { execSync } = require('child_process');

function killPort(port = 3001) {
    const targetPort = parseInt(port, 10);
    if (isNaN(targetPort) || targetPort <= 0 || targetPort > 65535) {
        console.error(`❌ [kill-port] Invalid port: "${port}"`);
        process.exit(1);
    }

    try {
        if (process.platform === 'win32') {
            let stdout = '';
            try {
                stdout = execSync('netstat -ano -p tcp', {
                    encoding: 'utf8',
                    stdio: ['pipe', 'pipe', 'ignore'],
                    windowsHide: true
                });
            } catch (e) {
                // No matching network connections found
                return;
            }

            const pids = parseListeningPids(stdout, targetPort);
            if (pids.length === 0) {
                return;
            }

            for (const pid of pids) {
                try {
                    execSync(`taskkill /F /PID ${pid}`, { stdio: 'ignore', windowsHide: true });
                    console.log(`[kill-port] Killed process on port ${targetPort} (PID: ${pid})`);
                } catch (e) {
                    // Process may have already exited
                }
            }
        } else {
            // macOS / Linux
            try {
                execSync(`lsof -ti:${targetPort} | xargs kill -9`, { stdio: 'ignore' });
                console.log(`[kill-port] Killed process on port ${targetPort}`);
            } catch (e) {
                // No process on port
            }
        }
    } catch (err) {
        // Safe exit
    }
}

function parseListeningPids(netstatOutput, targetPort) {
    if (!netstatOutput || typeof netstatOutput !== 'string') return [];
    const lines = netstatOutput.split(/\r?\n/);
    const pids = new Set();
    const lineRegex = new RegExp(`^\\s*TCP\\s+(?:(?:\\d{1,3}\\.){3}\\d{1,3}|\\[[^\\]]+\\]):${targetPort}\\s+.*?\\s+LISTENING\\s+(\\d+)$`, 'i');

    for (const line of lines) {
        const match = line.match(lineRegex);
        if (match && match[1] && match[1] !== '0') {
            pids.add(match[1]);
        }
    }
    return Array.from(pids);
}

// Export for unit testing
if (typeof module !== 'undefined') {
    module.exports = { killPort, parseListeningPids };
}

// Run CLI if invoked directly
if (require.main === module) {
    const portArg = process.argv[2] || 3001;
    killPort(portArg);
}
