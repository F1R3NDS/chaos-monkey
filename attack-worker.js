const { parentPort, workerData } = require('worker_threads');
const axios = require('axios');

const { targetUrl, attackTypes } = workerData;
const results = [];

// Helper to log result
const logResult = (type, status, message) => {
    results.push({ type, status, message, timestamp: new Date().toISOString() });
};

const runAttacks = async () => {
    // Attack 1: Baseline
    try {
        await axios.post(targetUrl, { message: 'Baseline Check' });
        logResult('Baseline', 'Success', 'Standard request accepted');
    } catch (error) {
        logResult('Baseline', 'Failed', `Baseline request failed: ${error.message}`);
        // If baseline fails, maybe stop? For now we continue.
    }

    // Attack: Malformed JSON
    if (attackTypes.includes('malformed')) {
        try {
            await axios.post(targetUrl, '{ "broken": "json",, }', {
                headers: { 'Content-Type': 'application/json' }
            });
            logResult('Malformed JSON', 'Warning', 'Endpoint accepted broken JSON (should 400)');
        } catch (error) {
            if (error.response && error.response.status === 400) {
                logResult('Malformed JSON', 'Success', 'Endpoint correctly rejected broken JSON');
            } else {
                logResult('Malformed JSON', 'Failed', `Endpoint error: ${error.message}`);
            }
        }
    }

    // Attack: Missing Headers
    if (attackTypes.includes('missing-headers')) {
        try {
            await axios.post(targetUrl, { data: 'test' }, {
                headers: { 'Content-Type': null }
            });
            logResult('Missing Headers', 'Warning', 'Endpoint accepted request without Content-Type');
        } catch (error) {
            logResult('Missing Headers', 'Success', `Endpoint handled missing header: ${error.message}`);
        }
    }

    // Attack: Double Delivery
    if (attackTypes.includes('double-delivery')) {
        const payload = { event_id: `evt_${Date.now()}`, type: 'test_event' };
        try {
            const req1 = axios.post(targetUrl, payload);
            const req2 = axios.post(targetUrl, payload);
            await Promise.all([req1, req2]);
            logResult('Double Delivery', 'Info', 'Sent duplicate events. Check logs for duplicate processing.');
        } catch (error) {
            logResult('Double Delivery', 'Info', `Delivery finished: ${error.message}`);
        }
    }

    // Attack: SQL Injection Probe
    if (attackTypes.includes('sqli-probe')) {
        const probes = ["' OR 1=1--", "admin' --", "UNION SELECT 1,2,3--"];
        for (const probe of probes) {
            try {
                // Injecting into a typical field
                await axios.post(targetUrl, { username: probe, email: 'test@example.com' });
                logResult('SQL Injection', 'Info', `Sent probe: ${probe}. Check if DB errors occurred.`);
            } catch (error) {
                logResult('SQL Injection', 'Info', `Server reacted to ${probe}: ${error.message}`);
            }
        }
    }

    // Attack: XSS Payload
    if (attackTypes.includes('xss-payload')) {
        const xss = "<script>alert('XSS')</script>";
        try {
            await axios.post(targetUrl, { comment: xss });
            logResult('XSS Payload', 'Info', 'Sent XSS payload. Check if it was sanitized in storage/logs.');
        } catch (error) {
            logResult('XSS Payload', 'Info', `Server reaction: ${error.message}`);
        }
    }

    // Attack: Large Payload (2MB)
    if (attackTypes.includes('large-payload')) {
        try {
            const largeData = 'A'.repeat(2 * 1024 * 1024); // 2MB string
            await axios.post(targetUrl, { data: largeData });
            logResult('Large Payload', 'Warning', 'Endpoint accepted 2MB payload (Potential DoS risk if not capped)');
        } catch (error) {
            if (error.response && error.response.status === 413) {
                logResult('Large Payload', 'Success', 'Endpoint correctly returned 413 Payload Too Large');
            } else {
                logResult('Large Payload', 'Info', `Endpoint rejected massive payload: ${error.message}`);
            }
        }
    }

    // Attack: Method Fuzzing
    if (attackTypes.includes('method-fuzzing')) {
        const methods = ['GET', 'PUT', 'DELETE', 'PATCH'];
        for (const method of methods) {
            try {
                await axios({ method, url: targetUrl, data: { foo: 'bar' } });
                logResult('Method Fuzzing', 'Warning', `Endpoint accepted ${method} (Should likely be 405 Method Not Allowed)`);
            } catch (error) {
                if (error.response && error.response.status === 405) {
                    logResult('Method Fuzzing', 'Success', `Endpoint correctly rejected ${method}`);
                } else {
                    logResult('Method Fuzzing', 'Info', `${method} response: ${error.message}`);
                }
            }
        }
    }

    // Send all results back
    parentPort.postMessage({ status: 'done', results });
};

runAttacks();
