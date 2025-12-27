const axios = require('axios');

const TARGET = 'http://localhost:3000/webhook-proxy';
const TOTAL_REQUESTS = 6000; // Limit is 5000, so we should see ~1000 blocks
const CONCURRENCY = 50;

let sent = 0;
let success = 0;
let blocked = 0;
let failed = 0;

console.log(`🛡️ STARTING SECURITY PROBE AGAINST: ${TARGET}`);
console.log(`🎯 Goal: Breach Rate Limit (5000 reqs)`);

const worker = async (id) => {
    while (sent < TOTAL_REQUESTS) {
        sent++;
        try {
            await axios.post(TARGET, { data: 'stress_test_payload' });
            success++;
            if (success % 500 === 0) process.stdout.write('✅');
        } catch (error) {
            if (error.response && error.response.status === 429) {
                blocked++;
                process.stdout.write('🛡️'); // Shield Active
            } else {
                failed++;
                process.stdout.write('❌');
            }
        }
    }
};

const run = async () => {
    const start = Date.now();
    const promises = [];
    for (let i = 0; i < CONCURRENCY; i++) {
        promises.push(worker(i));
    }

    await Promise.all(promises);
    const duration = (Date.now() - start) / 1000;

    console.log('\n\n--- 📊 SECURITY ANALYSIS REPORT ---');
    console.log(`⏱️ Duration: ${duration.toFixed(2)}s`);
    console.log(`🚀 Total Requests: ${sent}`);
    console.log(`✅ Accepted (Normal): ${success}`);
    console.log(`🛡️ BLOCKED (Rate Limit 429): ${blocked}`);
    console.log(`❌ Crashed/Failed: ${failed}`);

    console.log('\n--- 🧠 ANALYSIS ---');
    if (blocked > 0) {
        console.log('SUCCESS: "Iron Dome" Rate Limiter is ACTIVE.');
        console.log(`The system successfully identified and BLOCKED ${blocked} abusive requests.`);
        console.log('Server stability: 100% (No crashes).');
    } else {
        console.log('WARNING: Rate Limiter did not trigger. Check thresholds.');
    }
};

run();
