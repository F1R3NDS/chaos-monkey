const { parentPort, workerData } = require('worker_threads');
const axios = require('axios');
const xml2js = require('xml2js');

const { baseUrl, paths, smartScan } = workerData;
const results = [];
const parser = new xml2js.Parser();

// Helper: Clean URL
const cleanBase = baseUrl.replace(/\/+$/, '');

// Axios Instance with headers to avoid basic blocking
const client = axios.create({
    validateStatus: () => true, // Accept all status codes
    timeout: 5000,
    headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8'
    }
});

const checkPaths = async () => {
    // Basic Mode: Brute force common paths
    for (const p of paths) {
        const fullUrl = cleanBase + p;
        try {
            const res = await client.get(fullUrl);
            if (res.status !== 404) {
                // If 403/401, it suggests existence too
                results.push({ path: p, status: res.status, url: fullUrl, type: 'endpoint' });
            }
        } catch (err) {
            // Network error (DNS, Connection Refused)
        }
    }
    parentPort.postMessage({ status: 'done', results });
};

const runSmartRecon = async () => {
    try {
        // 1. Fetch robots.txt
        const robotsUrl = cleanBase + '/robots.txt';
        try {
            const res = await client.get(robotsUrl);

            if (res.status === 200) {
                results.push({ path: '/robots.txt', status: 200, url: robotsUrl, type: 'file' });

                const lines = res.data.split('\n');
                const sitemaps = [];

                // Parse robots.txt for hidden paths and sitemaps
                lines.forEach(line => {
                    const lower = line.toLowerCase().trim();
                    if (lower.startsWith('disallow:')) {
                        const path = line.split(':')[1].trim();
                        if (path && path !== '/') {
                            results.push({ path: path, status: 'Detected', url: cleanBase + path, type: 'hidden' });
                        }
                    }
                    if (lower.startsWith('sitemap:')) {
                        // Handle key:value format correctly
                        const parts = line.split(/sitemap:/i);
                        if (parts.length > 1) {
                            sitemaps.push(parts[1].trim());
                        }
                    }
                });

                // 2. Process Sitemaps
                for (const smUrl of sitemaps) {
                    try {
                        const smRes = await client.get(smUrl);
                        if (smRes.status === 200) {
                            results.push({ path: 'Sitemap XML', status: 200, url: smUrl, type: 'sitemap' });

                            // Parse XML
                            try {
                                const result = await parser.parseStringPromise(smRes.data);
                                // Handle standard sitemap (<urlset><url><loc>...)
                                if (result.urlset && result.urlset.url) {
                                    result.urlset.url.forEach(u => {
                                        if (u.loc) {
                                            results.push({ path: 'Target', status: 200, url: u.loc[0], type: 'target' });
                                        }
                                    });
                                }
                                // Handle sitemap index (<sitemapindex><sitemap><loc>...)
                                if (result.sitemapindex && result.sitemapindex.sitemap) {
                                    result.sitemapindex.sitemap.forEach(s => {
                                        if (s.loc) {
                                            results.push({ path: 'Sub-Sitemap', status: 200, url: s.loc[0], type: 'sitemap' });
                                        }
                                    });
                                }
                            } catch (parseErr) {
                                console.error('XML Parse Error:', parseErr.message);
                            }
                        }
                    } catch (e) {
                        console.error('Sitemap Fetch Error:', e.message);
                    }
                }
            }
        } catch (robotsErr) {
            // Robots.txt not found or blocked
        }
    } catch (err) {
        console.error('Smart Scan Fatal Error:', err.message);
    }

    parentPort.postMessage({ status: 'done', results });
};

// Main Entry Point
if (smartScan) {
    runSmartRecon();
} else {
    checkPaths();
}
