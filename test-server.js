const express = require('express');
const bodyParser = require('body-parser');

const app = express();
const PORT = 3333;

// Log everything
app.use((req, res, next) => {
    console.log(`[${new Date().toLocaleTimeString()}] ${req.method} ${req.url}`);
    console.log('Headers:', JSON.stringify(req.headers, null, 2));
    next();
});

// Middleware that might fail on bad JSON
app.use((req, res, next) => {
    bodyParser.json()(req, res, (err) => {
        if (err) {
            console.error('❌ Body Parser Error (Malformed JSON caught):', err.message);
            return res.status(400).json({ error: 'Invalid JSON', details: err.message });
        }
        next();
    });
});

app.post('/webhook', (req, res) => {
    console.log('✅ Valid Webhook Received:', req.body);
    res.status(200).send('Webhook Processed');
});

app.listen(PORT, () => {
    console.log(`🎯 Test/Victim Server listening on port ${PORT}`);
    console.log(`   Internal URL: http://localhost:${PORT}/webhook`);
});
