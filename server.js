const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const { Worker } = require('worker_threads');
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const upload = multer({ dest: 'uploads/' });

const app = express();
const PORT = 3000;

// Security Middlewares
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const basicAuth = require('express-basic-auth');

// 1. Helmet: Secure HTTP Headers
app.use(helmet({
    contentSecurityPolicy: false, // Disabled for simple inline scripts in this MVP
}));

// 2. Rate Limiting: High threshold to allow Stress Tests (V8) but prevent total collapse
// "Maksimum isteği yükseltelim" -> 5000 requests per 15 min.
const limiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 5000,
    message: { error: 'Too many requests, please try again later.' }
});
app.use(limiter);

// 3. Basic Auth: Protect Dashboard APIs (excluding public webhook receiver)
// User: admin, Pass: chaos (In production, use env vars!)
const auth = basicAuth({
    users: { 'admin': 'chaos' },
    challenge: true,
    unauthorizedResponse: (req) => {
        return req.auth ? 'Credentials rejected' : 'No credentials provided';
    }
});

// Apply Auth ONLY to sensitive management endpoints, NOT the webhook receiver or static files
app.use('/api', (req, res, next) => {
    // Public endpoints that external tools/webhooks hit
    if (req.path === '/captured-requests' || req.path === '/replay') {
        // Captured requests might be public? No, viewing them should be private.
        // Receiving webhooks (/webhook-proxy) is definitely public (handled in app.all).
        // Sending commands like /attack or /stress should be private.

        // Let's protect ALL /api routes for now. 
        // If a separate public API is needed, we exclude it.
        return auth(req, res, next);
    }
    return auth(req, res, next);
});

app.use(cors());
app.use(bodyParser.json());
app.use(express.static('public')); // This might alert for auth if we protected root, but we only protected /api



// V4/V6: Endpoint Fuzzer Logic
const commonPaths = [
    '/api', '/api/v1', '/webhook', '/callback', '/login', '/admin',
    '/test', '/health', '/status', '/config', '/debug', '/console',
    '/v1', '/v2', '/swagger', '/docs', '/robots.txt'
];

app.post('/api/fuzz', (req, res) => {
    const { targetUrl, smartScan } = req.body;
    if (!targetUrl) return res.status(400).json({ error: 'URL required' });

    // Clean base URL
    const baseUrl = targetUrl.replace(/\/+$/, '');

    // Spawn Fuzzer Worker with Smart Scan Toggle
    const worker = new Worker(path.join(__dirname, 'fuzzer-worker.js'), {
        workerData: { baseUrl, paths: commonPaths, smartScan }
    });

    worker.on('message', (message) => {
        if (message.status === 'done') {
            res.json({ endpoints: message.results });
        }
    });

    worker.on('error', (err) => {
        console.error('Fuzzer worker error', err);
        res.status(500).json({ error: 'Fuzzer failed' });
    });
});

// V5: Static Code Analysis
app.post('/api/scan-code', upload.single('codeFile'), (req, res) => {
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });

    const filePath = req.file.path;
    const content = fs.readFileSync(filePath, 'utf-8');
    const vulnerabilities = [];

    const patterns = [
        { name: 'Dangerous Eval', regex: /eval\s*\(/g, level: 'Critical' },
        { name: 'System Cmd Execution', regex: /(exec|spawn|system|shell_exec)\s*\(/g, level: 'Critical' },
        { name: 'Hardcoded Password', regex: /(password|passwd|pwd|secret)\s*[:=]\s*['"][^'"]+['"]/i, level: 'High' },
        { name: 'Hardcoded API Key', regex: /(api_key|apikey|token)\s*[:=]\s*['"][^'"]+['"]/i, level: 'High' },
        { name: 'Inner HTML Injection', regex: /\.innerHTML\s*=/g, level: 'Medium' },
        { name: 'SQL Injection Risk', regex: /["']\s*\+\s*.*\s*\+\s*["']\s*(SELECT|INSERT|UPDATE|DELETE)/i, level: 'Critical' },
    ];

    const lines = content.split('\n');
    lines.forEach((line, index) => {
        patterns.forEach(pat => {
            if (pat.regex.test(line)) {
                vulnerabilities.push({
                    line: index + 1,
                    type: pat.name,
                    severity: pat.level,
                    code: line.trim()
                });
            }
        });
    });

    try { fs.unlinkSync(filePath); } catch (e) { }

    res.json({ vulnerabilities });
});

app.post('/api/attack', (req, res) => {
    const { targetUrl, attackTypes } = req.body;

    if (!targetUrl) {
        return res.status(400).json({ error: 'Target URL is required' });
    }

    // Spawn a new Worker for this attack request
    const worker = new Worker(path.join(__dirname, 'attack-worker.js'), {
        workerData: { targetUrl, attackTypes }
    });

    worker.on('message', (message) => {
        if (message.status === 'done') {
            res.json({ results: message.results });
        }
    });

    worker.on('error', (error) => {
        console.error('Worker error:', error);
        res.status(500).json({ error: 'Chaos Worker Crashed', details: error.message });
    });

    worker.on('exit', (code) => {
        if (code !== 0) {
            console.error(`Worker stopped with exit code ${code}`);
        }
    });
});

// V8: Stress Test Endpoint
app.post('/api/stress', (req, res) => {
    const { targetUrl, concurrency, duration } = req.body;

    if (!targetUrl) return res.status(400).json({ error: 'Target URL required' });

    // Spawn Stress Worker
    const worker = new Worker(path.join(__dirname, 'stress-worker.js'), {
        workerData: {
            targetUrl,
            concurrency: parseInt(concurrency) || 10,
            duration: parseInt(duration) || 10
        }
    });

    worker.on('message', (msg) => {
        if (msg.status === 'done') {
            res.json(msg.finalStats);
        }
    });

    worker.on('error', (err) => {
        console.error('Stress worker error', err);
        res.status(500).json({ error: 'Stress Worker Failed' });
    });
});

// V9: Logic Interceptor (Shadow Proxy)
const capturedRequests = [];

// 1. The Trap Endpoint (Webhook Proxy)
app.all('/webhook-proxy', (req, res) => {
    const timestamp = new Date().toLocaleTimeString();
    const headers = req.headers;
    const body = req.body;
    const method = req.method;

    // Save to memory
    const id = Date.now().toString();
    capturedRequests.unshift({ id, timestamp, method, headers, body });

    // Keep memory clean (max 50 items)
    if (capturedRequests.length > 50) capturedRequests.pop();

    console.log(`[Proxy] Captured ${method} request`);

    // Respond to the provider so they don't retry
    res.status(200).json({ status: 'Intercepted by Chaos Monkey', id });
});

// 2. Client API to get list
app.get('/api/captured-requests', (req, res) => {
    res.json(capturedRequests);
});

// 3. Replay Engine
app.post('/api/replay', async (req, res) => {
    const { requestId, targetUrl } = req.body;
    const originalReq = capturedRequests.find(r => r.id === requestId);

    if (!originalReq) return res.status(404).json({ error: 'Request not found in memory' });
    if (!targetUrl) return res.status(400).json({ error: 'Target URL required' });

    console.log(`[Replay] Resending request ${requestId} to ${targetUrl}`);

    try {
        // We use axios directly here since it's a single request, no need for worker
        const axios = require('axios'); // Ensure axios is required if not already global/top

        const response = await axios({
            method: originalReq.method,
            url: targetUrl,
            headers: {
                'Content-Type': 'application/json',
                'X-Replay-Id': requestId // Tag it for debugging
            },
            data: originalReq.body,
            timeout: 5000
        });

        res.json({ status: 'Replayed', originalId: requestId, targetStatus: response.status });
    } catch (e) {
        console.error('Replay Failed:', e.message);
        res.status(500).json({ error: 'Replay Failed', details: e.message });
    }
});

// V10: Mutation Attack Endpoint
app.post('/api/mutate-attack', (req, res) => {
    const { requestId, targetUrl } = req.body;
    const originalReq = capturedRequests.find(r => r.id === requestId);

    if (!originalReq) return res.status(404).json({ error: 'Request not found' });
    if (!targetUrl) return res.status(400).json({ error: 'Target URL required' });

    console.log(`[Mutation] Starting aggressive scan on ${targetUrl}`);

    // Create a live stream for updates? Simple SSE would be better but let's stick to worker messages for now 
    // Wait, typical pattern for this app is fire-and-forget or polling. 
    // Let's use a short-lived worker and return the "Job Started" signal.

    // We can reuse the socket approach or just console log for MVP.
    // For this implementation, we'll keep it simple: Client polls or waits? 
    // Actually, given the user wants "visuals", we should probably use a streaming response or store results.
    // Let's store results in memory tied to the requestId for simplicity.

    // But since we don't have a complex job queue, let's just make the worker run and log errors to console
    // and maybe return a "Batch ID" that the frontend can poll.

    // SIMPLIFIED: Just run it. The frontend won't get real-time progress in this specific architecture 
    // without SSE. I will use the console logs for now and maybe a global "mutationResults" array.

    const worker = new Worker(path.join(__dirname, 'mutation-worker.js'), {
        workerData: { originalReq, targetUrl }
    });

    const jobId = Date.now().toString();
    mutationJobs[jobId] = { status: 'running', logs: [], vulnerabilities: [] };

    worker.on('message', (msg) => {
        if (mutationJobs[jobId]) {
            if (msg.status === 'done') {
                mutationJobs[jobId].status = 'done';
                mutationJobs[jobId].summary = msg;
            } else if (msg.status === 'vulnerability') {
                mutationJobs[jobId].vulnerabilities.push(msg.data);
            } else if (msg.status === 'info' || msg.status === 'progress') {
                // Keep logs minimal/last status
                mutationJobs[jobId].progress = msg;
            }
        }
    });

    res.json({ status: 'Attack Started', jobId });
});

app.get('/api/mutation-status/:jobId', (req, res) => {
    const job = mutationJobs[req.params.jobId];
    if (!job) return res.status(404).json({ error: 'Job not found' });
    res.json(job);
});

const mutationJobs = {}; // In-memory store

// V12: AI Auto-Pilot Endpoint
app.post('/api/auto-pilot', (req, res) => {
    const { targetUrl } = req.body;
    if (!targetUrl) return res.status(400).json({ error: 'Target URL required' });

    console.log(`[AI Auto-Pilot] Engaging Autonomous Mode for ${targetUrl}`);

    const worker = new Worker(path.join(__dirname, 'auto-pilot-worker.js'), {
        workerData: { targetUrl }
    });

    const jobId = Date.now().toString();
    mutationJobs[jobId] = { status: 'running', logs: [], vulnerabilities: [] }; // Reuse mutationJobs storage for simplicity

    worker.on('message', (msg) => {
        if (mutationJobs[jobId]) {
            if (msg.status === 'done') {
                mutationJobs[jobId].status = 'done';
                mutationJobs[jobId].summary = msg;
            } else if (msg.status === 'vulnerability') {
                mutationJobs[jobId].vulnerabilities.push(msg.data);
            } else if (msg.status === 'info') {
                mutationJobs[jobId].logs.push(msg.message); // Store logs for streaming
            }
        }
    });

    res.json({ status: 'AI Protocol Initiated', jobId });
});

app.listen(PORT, () => {
    console.log(`Chaos Monkey (V2 Multithreaded) listening at http://localhost:${PORT}`);
});
