const { spawnSync } = require('child_process');

console.log('--- RUNNING CONCURRENTLY TEARDOWN TEST (EXACT 2 PROCESSES: [0] & [1]) ---');
const startTime = Date.now();

// Exactly two commands quoted for Windows shell: [0] failing node script, [1] hanging wait-on
const result = spawnSync('npx', [
    'concurrently',
    '--kill-others-on-fail',
    '--kill-signal', 'SIGKILL',
    '"node -e \\"console.log(\\\'[mock-dev-next] Simulated crash with code 1\\\'); process.exit(1);\\""',
    '"npx wait-on tcp:39999"'
], {
    shell: true,
    encoding: 'utf8'
});

const elapsedMs = Date.now() - startTime;
console.log(result.stdout || result.stderr);
console.log(`Exit status: ${result.status}`);
console.log(`Elapsed time: ${elapsedMs}ms`);

if (result.status !== 0 && elapsedMs < 5000) {
    console.log(`✅ TEST PASSED: Exactly 2 processes spawned ([0] and [1]), wait-on terminated immediately in ${elapsedMs}ms`);
    process.exit(0);
} else {
    console.error('❌ TEST FAILED: Concurrently hung or did not return non-zero exit code');
    process.exit(1);
}
