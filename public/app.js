const startBtn = document.getElementById('startBtn');
const targetInput = document.getElementById('targetUrl');
const logsDiv = document.getElementById('logs');

const downloadBtn = document.getElementById('downloadBtn');
let sessionLogs = []; // Store logs for report

// Knowledge Base for Remediation
const remediationMap = {
    'Malformed JSON': 'Use a robust JSON parser with error handling (try-catch). In Express, `body-parser` usually handles this by returning 400 Bad Request automatically.',
    'Missing Headers': 'Ensure your endpoint checks for `Content-Type: application/json` before parsing. Reject unknown types with 415 Unsupported Media Type.',
    'Double Delivery': 'Implement Idempotency. Store processed Event IDs in a Redis/Database. If an ID exists, return 200 OK immediately without processing again.',
    'SQL Injection': 'NEVER concatenate strings in queries. Use Parameterized Queries (Prepared Statements) or an ORM (Sequelize, TypeORM) which handles escaping automatically.',
    'XSS Payload': 'Sanitize all inputs using a library like DOMPurify or validator.js. encoding output is also critical to prevent execution of injected scripts.',
    'Large Payload': 'Limit the body size. In Express: `app.use(bodyParser.json({ limit: "1mb" }))`. This prevents memory exhaustion attacks.',
    'Method Fuzzing': 'Explicitly define allowed methods (POST only). Return 405 Method Not Allowed for others. Express `app.post(...)` does this by default, but check your middleware.',
    'Baseline': 'Your endpoint failed the most basic test. Check if the server is running, the URL is correct, and it is accessible from the internet/localhost.'
};

const logMessage = (msg, type = 'info', category = '') => {
    const div = document.createElement('div');
    const timestamp = new Date().toLocaleTimeString();

    let colorClass = 'text-slate-300';
    if (type === 'error') colorClass = 'text-red-400';
    if (type === 'success') colorClass = 'text-emerald-400';
    if (type === 'warning') colorClass = 'text-amber-400';

    // Main Log Line
    div.className = `${colorClass} font-mono border-b border-slate-800 pb-1 mb-1`;
    div.innerHTML = `<span class="opacity-50">[${timestamp}]</span> ${msg}`;

    if (category && remediationMap[category] && (type === 'warning' || type === 'info')) {
        const adviceDiv = document.createElement('div');
        adviceDiv.className = 'text-xs text-sky-400 ml-6 mt-1 mb-2 bg-slate-900 p-2 rounded border-l-2 border-sky-500';
        adviceDiv.innerHTML = `<strong>💡 Pro Tip:</strong> ${remediationMap[category]}`;
        div.appendChild(adviceDiv);
    }

    logsDiv.appendChild(div);
    logsDiv.scrollTop = logsDiv.scrollHeight;

    // Add to session logs for export
    sessionLogs.push(`[${timestamp}] [${type.toUpperCase()}] ${msg} \n   >>> Advice: ${remediationMap[category] || 'N/A'}`);
};

startBtn.addEventListener('click', async () => {
    const targetUrl = targetInput.value.trim();
    if (!targetUrl) {
        logMessage('Error: Please enter a target URL.', 'error');
        return;
    }

    sessionLogs = []; // Reset logs
    downloadBtn.classList.add('hidden');
    logsDiv.innerHTML = ''; // Clear visual logs

    const checkboxes = document.querySelectorAll('input[type="checkbox"]:checked');
    const attackTypes = Array.from(checkboxes).map(cb => cb.value);

    startBtn.disabled = true;
    startBtn.innerText = 'Attacking... 🌩️';
    logMessage(`Starting Chaos V2 run against: ${targetUrl}`, 'info');

    try {
        const response = await fetch('/api/attack', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ targetUrl, attackTypes })
        });

        const data = await response.json();

        if (data.results) {
            data.results.forEach(res => {
                let type = 'info';
                if (res.status === 'Success') type = 'success';
                if (res.status === 'Failed') type = 'error';
                if (res.status === 'Warning') type = 'warning';

                logMessage(`[${res.type}] ${res.message}`, type, res.type);
            });
            logMessage('Chaos run completed.', 'success');
            downloadBtn.classList.remove('hidden'); // Show download button
        } else {
            logMessage(`Server error: ${data.error}`, 'error');
        }

    } catch (error) {
        logMessage(`Network error: ${error.message}`, 'error');
    } finally {
        startBtn.disabled = false;
        startBtn.innerText = 'Unleash the Monkey 🚀';
    }
});

downloadBtn.addEventListener('click', () => {
    const reportHTML = generateHTMLReport(sessionLogs, targetInput.value);
    const blob = new Blob([reportHTML], { type: 'text/html' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `Security-Audit-${new Date().toISOString().split('T')[0]}.html`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
});

function generateHTMLReport(logs, target) {
    // 1. Calculate Stats & Risk Score
    let totalIssues = 0;
    let criticals = 0;
    let warnings = 0;
    let passed = 0;

    logs.forEach(l => {
        if (l.includes('[ERROR]')) { totalIssues++; criticals++; }
        else if (l.includes('[WARNING]')) { totalIssues++; warnings++; }
        else if (l.includes('[SUCCESS]')) passed++;
    });

    const totalTests = logs.length;
    // Simple Scoring Algorithm: Start at 100, deduct for findings
    let riskScore = 100 - (criticals * 15) - (warnings * 5);
    if (riskScore < 0) riskScore = 0;

    let grade = 'A';
    if (riskScore < 90) grade = 'B';
    if (riskScore < 70) grade = 'C';
    if (riskScore < 50) grade = 'D';
    if (riskScore < 30) grade = 'F';

    // Chart Data Preparation
    const chartData = {
        labels: ['Passed', 'Warnings', 'Critical Failures'],
        data: [passed, warnings, criticals]
    };

    return `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <title>Security Audit Report - ${target}</title>
    <script src="https://cdn.tailwindcss.com"></script>
    <script src="https://cdn.jsdelivr.net/npm/chart.js"></script>
    <style>
        @media print { .no-print { display: none; } }
        body { background: #f8fafc; color: #334155; }
        .score-circle { width: 120px; height: 120px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 3rem; font-weight: bold; color: white; }
    </style>
</head>
<body class="p-8 max-w-5xl mx-auto">
    
    <!-- Executive Summary -->
    <div class="bg-white rounded-xl shadow-lg p-8 mb-8 border border-slate-200">
        <div class="flex justify-between items-start border-b border-slate-100 pb-6 mb-6">
            <div>
                <h1 class="text-3xl font-bold text-slate-800 mb-2">Security Audit Report</h1>
                <p class="text-slate-500">Target: <code class="bg-slate-100 px-2 py-1 rounded text-slate-700">${target}</code></p>
                <p class="text-slate-500">Date: ${new Date().toLocaleString()}</p>
            </div>
            <div class="text-right">
                <div class="text-xs font-bold text-slate-400 uppercase tracking-widest mb-1">Generated By</div>
                <div class="text-emerald-600 font-bold text-xl">Webhook Chaos Monkey</div>
            </div>
        </div>

        <div class="grid grid-cols-1 md:grid-cols-3 gap-8 items-center">
            <!-- Score Card -->
            <div class="flex flex-col items-center">
                <div class="score-circle shadow-xl mb-4 ${getGradeColor(grade)}">
                    ${grade}
                </div>
                <div class="text-2xl font-bold text-slate-700">${riskScore}/100</div>
                <div class="text-sm text-slate-400 uppercase tracking-wide">Security Score</div>
            </div>

            <!-- Stats -->
            <div class="space-y-4">
                <div class="flex justify-between items-center bg-red-50 p-3 rounded-lg border border-red-100">
                    <span class="font-medium text-red-700">Critical Issues</span>
                    <span class="font-bold text-2xl text-red-600">${criticals}</span>
                </div>
                <div class="flex justify-between items-center bg-amber-50 p-3 rounded-lg border border-amber-100">
                    <span class="font-medium text-amber-700">Warnings</span>
                    <span class="font-bold text-2xl text-amber-600">${warnings}</span>
                </div>
                <div class="flex justify-between items-center bg-green-50 p-3 rounded-lg border border-green-100">
                    <span class="font-medium text-green-700">Passed Tests</span>
                    <span class="font-bold text-2xl text-green-600">${passed}</span>
                </div>
            </div>

            <!-- Chart -->
            <div class="h-48">
                <canvas id="auditChart"></canvas>
            </div>
        </div>
    </div>

    <!-- Remediation Plan -->
    <div class="bg-white rounded-xl shadow-lg p-8 mb-8 border border-slate-200">
        <h2 class="text-xl font-bold text-slate-800 mb-6 flex items-center">
            <span class="bg-blue-100 text-blue-600 p-2 rounded mr-3">🛠️</span> Remediation Actions
        </h2>
        <div class="space-y-4">
            ${logs.filter(l => l.includes('Advice:')).map(log => {
        const parts = log.split('>>> Advice:');
        const issue = parts[0].replace(/\[.*?\]/g, '').trim();
        const advice = parts[1].trim();
        return `
                <div class="flex gap-4 p-4 rounded-lg bg-slate-50 border border-slate-200">
                    <div class="flex-shrink-0 mt-1">
                        <svg class="w-6 h-6 text-amber-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"></path></svg>
                    </div>
                    <div>
                        <h4 class="font-bold text-slate-700 text-sm mb-1">${issue}</h4>
                        <p class="text-slate-600 text-sm italic">"${advice}"</p>
                    </div>
                </div>`;
    }).join('') || '<p class="text-slate-400 italic">No specific remediation actions required.</p>'}
        </div>
    </div>

    <!-- Scan Log -->
    <div class="bg-slate-900 rounded-xl shadow-lg p-8 text-slate-300 font-mono text-sm overflow-hidden">
        <h3 class="text-emerald-400 font-bold mb-4 border-b border-slate-700 pb-2">Significant Events Log (Success/Failures)</h3>
        <div class="max-h-96 overflow-y-auto space-y-1">
            ${logs
            .filter(l => !l.includes('[INFO]'))
            .map(l => `<div><span class="opacity-50">${l.split('] ')[0]}]</span> ${l.split('] ')[1]}</div>`)
            .join('')}
        </div>
    </div>

    <script>
        // Initialize Chart
        const ctx = document.getElementById('auditChart').getContext('2d');
        new Chart(ctx, {
            type: 'doughnut',
            data: {
                labels: ${JSON.stringify(chartData.labels)},
                datasets: [{
                    data: ${JSON.stringify(chartData.data)},
                    backgroundColor: ['#22c55e', '#f59e0b', '#ef4444'],
                    borderWidth: 0
                }]
            },
            options: {
                plugins: { legend: { display: false } },
                cutout: '70%'
            }
        });
    </script>
</body>
</html>
    `;
}

function getGradeColor(grade) {
    if (grade === 'A') return 'bg-emerald-500';
    if (grade === 'B') return 'bg-blue-500';
    if (grade === 'C') return 'bg-amber-500';
    if (grade === 'D') return 'bg-orange-500';
    return 'bg-red-600';
}

// V4/V6: Fuzzer Logic
const fuzzBtn = document.getElementById('fuzzBtn');
const fuzzResultsFn = document.getElementById('fuzzResults');

fuzzBtn.addEventListener('click', async () => {
    const targetUrl = targetInput.value.trim();
    const isSmart = document.getElementById('smartScanToggle').checked;

    if (!targetUrl) return logMessage('Enter URL for fuzzing', 'error');

    logMessage(`Starting ${isSmart ? 'SMART ' : ''}Endpoint Discovery...`, 'info');
    fuzzBtn.disabled = true;
    fuzzBtn.innerText = 'Scanning...';
    fuzzResultsFn.classList.remove('hidden');
    fuzzResultsFn.innerHTML = '<div class="text-yellow-400 animate-pulse">Scanning...</div>';

    try {
        const res = await fetch('/api/fuzz', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ targetUrl, smartScan: isSmart })
        });
        const data = await res.json();

        fuzzResultsFn.innerHTML = '';

        if (data.endpoints && data.endpoints.length > 0) {
            logMessage(`Discovery: Found ${data.endpoints.length} items!`, 'success');
            data.endpoints.forEach(ep => {
                let color = 'text-slate-300';
                let icon = '📍';

                if (ep.type === 'target') { color = 'text-amber-400'; icon = '🎯'; }
                else if (ep.type === 'hidden') { color = 'text-red-400 font-bold'; icon = '🕵️'; }
                else if (ep.type === 'sitemap') { color = 'text-blue-400'; icon = '🗺️'; }
                else if (ep.type === 'file') { color = 'text-white'; icon = '📄'; }
                else if (ep.status === 200) { color = 'text-green-400'; }

                const div = document.createElement('div');
                div.className = `flex justify-between items-center mb-1 pb-1 border-b border-white/5 last:border-0 ${color} cursor-pointer hover:bg-white/5 transition px-1 rounded`;
                div.innerHTML = `
                    <span class="truncate w-3/4 text-[10px] font-mono" title="${ep.url}">${icon} ${ep.path || ep.url}</span>
                    <span class="text-[10px] opacity-70">${ep.status}</span>
                `;

                // Quick Attack Click Handler
                div.addEventListener('click', () => {
                    // If it's a full URL, stick it in. If it's a path, append to clean base
                    const baseUrl = targetUrl.split('?')[0].replace(/\/+$/, '');
                    targetInput.value = ep.url.startsWith('http') ? ep.url : baseUrl + ep.path;

                    // Visual Feedback
                    targetInput.classList.add('ring-2', 'ring-emerald-500');
                    setTimeout(() => targetInput.classList.remove('ring-2', 'ring-emerald-500'), 500);
                    logMessage(`Selected target: ${targetInput.value}`, 'info');
                });

                fuzzResultsFn.appendChild(div);

                // Detailed log for special finds
                if (ep.type === 'hidden' || ep.type === 'sitemap') {
                    logMessage(`Found ${ep.type}: ${ep.path}`, 'success');
                }
            });
        } else {
            logMessage('Discovery: No items found.', 'warning');
            fuzzResultsFn.innerHTML = '<div class="text-slate-500">No endpoints found.</div>';
        }
    } catch (e) {
        logMessage(`Fuzz Error: ${e.message}`, 'error');
        fuzzResultsFn.innerHTML = '<div class="text-red-500">Error</div>';
    } finally {
        fuzzBtn.disabled = false;
        fuzzBtn.innerText = 'Auto-Scan';
    }
});

// V5: Static Analysis Logic
const codeUploadKey = document.getElementById('codeUpload');
const scanResultsFn = document.getElementById('scanResults');

codeUploadKey.addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    logMessage(`Uploading ${file.name} for Static Analysis...`, 'info', 'Static Analysis');
    const formData = new FormData();
    formData.append('codeFile', file);

    try {
        const res = await fetch('/api/scan-code', {
            method: 'POST',
            body: formData
        });
        const data = await res.json();

        scanResultsFn.classList.remove('hidden');
        scanResultsFn.innerHTML = '';

        if (data.vulnerabilities && data.vulnerabilities.length > 0) {
            logMessage(`Analysis: Found ${data.vulnerabilities.length} issues in code.`, 'error');
            data.vulnerabilities.forEach(vuln => {
                const div = document.createElement('div');
                div.className = 'border-b border-slate-600 py-1 text-red-300';
                div.innerHTML = `<strong>${vuln.type}</strong> (L${vuln.line}): <code>${vuln.code.substring(0, 30)}...</code>`;
                scanResultsFn.appendChild(div);

                logMessage(`[CODE AUDIT] Line ${vuln.line}: ${vuln.type}`, 'warning');
                sessionLogs.push(`[CODE AUDIT] ${file.name}:${vuln.line} - ${vuln.type} \n    Snippet: ${vuln.code}`);
            });
        } else {
            logMessage('Analysis: Clean code! No obvious patterns found.', 'success');
            scanResultsFn.innerHTML = '<span class="text-emerald-400">No vulnerabilities found.</span>';
        }

    } catch (e) {
        logMessage(`Upload Error: ${e.message}`, 'error');
    } finally {
        codeUploadKey.value = ''; // Reset
    }
});

// V8: Stress Test Logic
const stressBtn = document.getElementById('stressBtn');
const stressResultsDiv = document.getElementById('stressResults');

stressBtn.addEventListener('click', async () => {
    const targetUrl = targetInput.value.trim();
    const concurrency = document.getElementById('concurrencyInput').value || 10;
    const duration = document.getElementById('durationInput').value || 5;

    if (!targetUrl) return logMessage('Enter Target URL first!', 'error');

    logMessage(`Starting Stress Test: ${concurrency} threads for ${duration}s...`, 'warning');
    stressBtn.disabled = true;
    stressBtn.innerText = 'Stressing...';
    stressResultsDiv.classList.remove('hidden');
    stressResultsDiv.innerHTML = '<span class="animate-pulse text-yellow-500">Firing requests...</span>';

    try {
        const res = await fetch('/api/stress', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ targetUrl, concurrency, duration })
        });
        const stats = await res.json();

        // Calculate RPS
        const rps = (stats.requestsSent / duration).toFixed(1);

        stressResultsDiv.innerHTML = `
            <div class="grid grid-cols-2 gap-1">
                <div class="text-slate-400">Total Req:</div> <div class="text-right text-white">${stats.requestsSent}</div>
                <div class="text-slate-400">RPS:</div> <div class="text-right text-yellow-400 font-bold">${rps}</div>
                <div class="text-slate-400">Success:</div> <div class="text-right text-green-400">${stats.successCount}</div>
                <div class="text-slate-400">Failed:</div> <div class="text-right text-red-400">${stats.failCount}</div>
                <div class="text-slate-400">Rate Ltd:</div> <div class="text-right text-orange-400">${stats.rateLimitCount}</div>
            </div>
        `;

        logMessage(`Stress Test Done: ${rps} Req/Sec. Failed: ${stats.failCount}`, stats.failCount > 0 ? 'error' : 'success');

        if (stats.failCount > 0) {
            logMessage('Server struggled under load! Optimization needed.', 'warning', 'Baseline');
        }

    } catch (e) {
        logMessage(`Stress Error: ${e.message}`, 'error');
        stressResultsDiv.innerHTML = 'Error';
    } finally {
        stressBtn.disabled = false;
        stressBtn.innerText = 'Start Load Test';
    }
});

// V12: AI Auto-Pilot Logic
const aiPilotBtn = document.getElementById('aiPilotBtn');
if (aiPilotBtn) {
    aiPilotBtn.addEventListener('click', async () => {
        const targetUrl = targetInput.value.trim();
        if (!targetUrl) return logMessage('Enter Target URL first!', 'error');

        logMessage('🚀 Engaging AI Auto-Pilot...', 'warning', 'SYSTEM');
        aiPilotBtn.classList.add('animate-pulse');

        try {
            const res = await fetch('/api/auto-pilot', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ targetUrl })
            });
            const data = await res.json();

            // Poll for AI logs
            pollMutationStatus(data.jobId, { innerText: '' }, true); // Reuse poller with isAi flag

        } catch (e) {
            logMessage('AI Pilot Failed to Launch', 'error');
            aiPilotBtn.classList.remove('animate-pulse');
        }
    });
}

// V11: Mock Data Generator
const simulateBtn = document.getElementById('simulateBtn');
simulateBtn.addEventListener('click', async () => {
    const templates = [
        {
            method: 'POST',
            body: {
                type: 'payment_intent.succeeded',
                data: {
                    object: { amount: 2000, currency: 'usd', status: 'succeeded' }
                }
            }
        },
        {
            method: 'POST',
            body: {
                ref: 'refs/heads/main',
                repository: { name: 'chaos-monkey-v1', stars: 9999 }
            }
        },
        {
            method: 'POST',
            body: {
                email: 'admin@corp.com',
                password: 'SuperSecretPassword123!',
                role: 'admin'
            }
        }
    ];

    // Pick a random template
    const randomTemplate = templates[Math.floor(Math.random() * templates.length)];

    try {
        simulateBtn.innerText = 'Sending...';
        await fetch('/webhook-proxy', {
            method: randomTemplate.method,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(randomTemplate.body)
        });

        logMessage('Mock Data Injected! Check Interceptor.', 'success', 'V11 Simulator');
        setTimeout(() => simulateBtn.innerText = '⚡ Simulate', 1000);

        // Trigger generic refresh
        checkProxyTraffic();
    } catch (e) {
        console.error(e);
        simulateBtn.innerText = 'Error';
    }
});

// V9: Interceptor / Proxy Logic
const interceptorList = document.getElementById('interceptorList');
const refreshProxyBtn = document.getElementById('refreshProxyBtn');
let lastProxyCount = 0;

async function checkProxyTraffic() {
    try {
        const res = await fetch('/api/captured-requests');
        const requests = await res.json();

        if (requests.length === 0) return;
        if (requests.length === lastProxyCount) return; // No new data

        lastProxyCount = requests.length;
        interceptorList.innerHTML = '';

        requests.forEach(req => {
            const div = document.createElement('div');
            div.className = 'flex items-center text-xs border-b border-white/5 pb-1 hover:bg-white/5 p-1 rounded transition';

            const payloadPreview = JSON.stringify(req.body).substring(0, 40) + '...';

            div.innerHTML = `
                <span class="w-20 text-slate-400 font-mono">${req.timestamp}</span>
                <span class="w-12 font-bold text-emerald-400">${req.method}</span>
                <span class="flex-1 text-slate-300 font-mono opacity-80" title='${JSON.stringify(req.body, null, 2)}'>${payloadPreview}</span>
                <button class="replay-btn w-16 bg-sky-700 hover:bg-sky-600 text-white rounded px-2 py-0.5" data-id="${req.id}">
                    Replay
                </button>
            `;
            interceptorList.appendChild(div);
        });

        // Attach Replay Listeners
        document.querySelectorAll('.replay-btn').forEach(btn => {
            btn.addEventListener('click', async (e) => {
                const id = e.target.dataset.id;
                const targetUrl = targetInput.value.trim();

                if (!targetUrl) return logMessage('Enter Target URL above to Replay', 'error');

                e.target.innerText = 'Sending...';
                try {
                    const replayRes = await fetch('/api/replay', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ requestId: id, targetUrl })
                    });
                    const result = await replayRes.json();

                    if (replayRes.ok) {
                        logMessage(`Replay Success! Target responded with ${result.targetStatus}`, 'success', 'Replay');
                        e.target.innerText = 'Done';
                        setTimeout(() => e.target.innerText = 'Replay', 2000);
                    } else {
                        throw new Error(result.error);
                    }
                } catch (err) {
                    logMessage(`Replay Failed: ${err.message}`, 'error');
                    e.target.innerText = 'Failed';
                }
            });
        });

        refreshProxyBtn.innerText = `Captured ${requests.length} Requests`;

    } catch (e) {
        console.error('Proxy Polling Error:', e);
    }
}

// Poll every 2 seconds
setInterval(checkProxyTraffic, 2000);

async function checkProxyTraffic() {
    try {
        const res = await fetch('/api/captured-requests');
        const requests = await res.json();

        if (requests.length === 0) return;
        if (requests.length === lastProxyCount) return; // No new data

        lastProxyCount = requests.length;
        interceptorList.innerHTML = '';

        requests.forEach(req => {
            const div = document.createElement('div');
            div.className = 'flex items-center text-xs border-b border-white/5 pb-1 hover:bg-white/5 p-1 rounded transition';

            const payloadPreview = JSON.stringify(req.body).substring(0, 30) + '...';

            div.innerHTML = `
                <span class="w-16 text-slate-400 font-mono">${req.timestamp}</span>
                <span class="w-10 font-bold text-emerald-400">${req.method}</span>
                <span class="flex-1 text-slate-300 font-mono opacity-80 truncate px-2" title='${JSON.stringify(req.body, null, 2)}'>${payloadPreview}</span>
                <div class="flex space-x-1">
                    <button class="replay-btn bg-sky-700 hover:bg-sky-600 text-white rounded px-2 py-0.5" data-id="${req.id}">
                        Replay
                    </button>
                    <button class="mutate-btn bg-red-900/80 hover:bg-red-700 text-white rounded px-2 py-0.5 border border-red-700" data-id="${req.id}">
                        ☢️ Attack
                    </button>
                </div>
            `;
            interceptorList.appendChild(div);
        });

        // Attach Listeners
        document.querySelectorAll('.replay-btn').forEach(btn => {
            btn.addEventListener('click', async (e) => {
                handleReplay(e.target.dataset.id, e.target);
            });
        });

        document.querySelectorAll('.mutate-btn').forEach(btn => {
            btn.addEventListener('click', async (e) => {
                const id = e.target.dataset.id;
                const targetUrl = targetInput.value.trim();
                if (!targetUrl) return logMessage('Enter Target URL first!', 'error');

                if (!confirm('WARNING: This will define and fire 50+ aggressive payloads (SQLi, RCE, XSS) at the target. Do you have permission?')) return;

                e.target.innerText = 'Firing...';

                try {
                    const res = await fetch('/api/mutate-attack', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ requestId: id, targetUrl })
                    });
                    const data = await res.json();
                    logMessage(`Mutation Attack Started (Job: ${data.jobId})`, 'warning', 'V10 Engine');

                    // Poll for status
                    pollMutationStatus(data.jobId, e.target);

                } catch (err) {
                    logMessage(`Attack Failed: ${err.message}`, 'error');
                    e.target.innerText = 'Failed';
                }
            });
        });

        refreshProxyBtn.innerText = `Captured ${requests.length} Requests`;

    } catch (e) {
        console.error('Proxy Polling Error:', e);
    }
}

async function handleReplay(id, btn) {
    const targetUrl = targetInput.value.trim();
    if (!targetUrl) return logMessage('Enter Target URL first!', 'error');

    btn.innerText = '...';
    try {
        const res = await fetch('/api/replay', {
            method: 'POST',
            body: JSON.stringify({ requestId: id, targetUrl }),
            headers: { 'Content-Type': 'application/json' }
        });
        if (res.ok) {
            logMessage('Replay Success', 'success');
            btn.innerText = 'OK';
        } else {
            throw new Error('Failed');
        }
    } catch (e) {
        logMessage('Replay Error', 'error');
        btn.innerText = 'Err';
    }
    setTimeout(() => btn.innerText = 'Replay', 2000);
}

async function pollMutationStatus(jobId, btn, isAi = false) {
    const interval = setInterval(async () => {
        try {
            const res = await fetch(`/api/mutation-status/${jobId}`);
            const job = await res.json();

            // Stream logs
            if (job.progress && job.progress.message) {
                // Check if we already logged this exact message to avoid spam? 
                // Simple hack: just log it. relying on backend to only send "progress" updates.
            }
            if (job.logs && job.logs.length > 0) {
                // In a real app we would track last index. For now just show last.
                const lastLog = job.logs[job.logs.length - 1];
                if (btn.lastLog !== lastLog) {
                    logMessage(lastLog, 'info', isAi ? '🧠 AI-CORE' : 'MUTATION');
                    btn.lastLog = lastLog;
                }
            }

            if (job.status === 'done') {
                clearInterval(interval);
                if (btn.innerText) btn.innerText = 'Done';
                if (isAi) document.getElementById('aiPilotBtn').classList.remove('animate-pulse');

                const vulns = job.summary.vulnerabilitiesFound || (job.summary.message && job.summary.message.match(/(\d+) Vulnerabilities/)[1]);

                logMessage(`Mission Complete. ${vulns} Issues Found.`, vulns > 0 ? 'error' : 'success', isAi ? '🧠 AI-CORE' : 'SYSTEM');

                if (job.vulnerabilities && job.vulnerabilities.length > 0) {
                    job.vulnerabilities.forEach(v => {
                        logMessage(`[VULN] ${v.type} :: ${v.status} :: ${v.payload}`, 'error');
                    });
                }
            }
        } catch (e) { clearInterval(interval); }
    }, 1000);
}
