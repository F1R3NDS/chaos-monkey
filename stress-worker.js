const { parentPort, workerData } = require('worker_threads');
const http = require('http');
const https = require('https');

const { targetUrl, duration, concurrency } = workerData;

const durationMs = duration * 1000;
const endTime = Date.now() + durationMs;
let requestsSent = 0;
let successCount = 0;
let failCount = 0; // 500s
let rateLimitCount = 0; // 429s

const isHttps = targetUrl.startsWith('https');
const agent = isHttps ? new https.Agent({ keepAlive: true }) : new http.Agent({ keepAlive: true });
const requestLib = isHttps ? https : http;

const sendRequest = () => {
    if (Date.now() > endTime) return;

    const req = requestLib.get(targetUrl, { agent, timeout: 2000 }, (res) => {
        requestsSent++;
        if (res.statusCode >= 200 && res.statusCode < 300) {
            successCount++;
        } else if (res.statusCode === 429) {
            rateLimitCount++;
        } else if (res.statusCode >= 500) {
            failCount++;
        }
        // Consume data to free memory
        res.on('data', () => { });
        res.on('end', () => {
            // Safety Pacing: Wait 10ms to prevent CPU starvation on local machine
            setTimeout(sendRequest, 10);
        });
    });

    req.on('error', (e) => {
        requestsSent++;
        // Network errors (refused, timeout) often mean server is down/overloaded
        failCount++;
        // Smart Backoff: If server is dying, don't hammer it instantly. Wait 100ms.
        // This prevents the "Infinite Error Loop" that freezes your PC.
        setTimeout(sendRequest, 100);
    });

    req.end();
};

// Start Workers
for (let i = 0; i < concurrency; i++) {
    sendRequest();
}

// Status Reporter Interval
const interval = setInterval(() => {
    if (Date.now() > endTime) {
        clearInterval(interval);
        parentPort.postMessage({
            status: 'done',
            finalStats: { requestsSent, successCount, failCount, rateLimitCount }
        });
    } else {
        parentPort.postMessage({
            status: 'running',
            stats: { requestsSent, successCount, failCount, rateLimitCount }
        });
    }
}, 500);
