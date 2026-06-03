const fs = require('fs');
const lines = fs.readFileSync('server/index.js', 'utf8').split('\n');
const splitIdx = lines.findIndex(l => l.includes('// --- TLS SESSION RESUMPTION IMPLEMENTATION ---'));
const top = lines.slice(0, splitIdx);

// Append missing routing for health and frontend + '0.0.0.0' for app.listen
const bottom = [
    '// Health check endpoint (for Railway / Render deployment)',
    'app.get(\'/api/health\', (req, res) => {',
    '    res.json({ status: \'ok\', timestamp: new Date().toISOString() });',
    '});',
    '',
    '// Catch-all: serve React frontend for any non-API route (SPA support)',
    'app.get(\'*\', (req, res) => {',
    '    res.sendFile(path.join(__dirname, \'..\', \'client\', \'dist\', \'index.html\'));',
    '});',
    '',
    '// Disable local HTTPS for Render completely',
    'console.log(\'[SECURITY] Local HTTPS disabled for Render to prevent startup hanging\');'
];

// Wait, I need to make sure app.listen binds to 0.0.0.0
// Let's modify the line with app.listen
for (let i = 0; i < top.length; i++) {
    if (top[i].includes('app.listen(PORT, () => console.log(')) {
        top[i] = top[i].replace('app.listen(PORT, () => console.log(', 'app.listen(PORT, \'0.0.0.0\', () => console.log(');
    }
}

fs.writeFileSync('server/index.js', top.concat(bottom).join('\n'));
