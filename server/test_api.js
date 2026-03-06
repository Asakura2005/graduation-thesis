async function test() {
    try {
        console.log("Logging in...");
        const loginRes = await fetch('http://localhost:5001/api/auth/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username: 'admin', password: 'password123' })
        });

        if (!loginRes.ok) throw new Error(`Login status: ${loginRes.status}`);
        const loginData = await loginRes.json();
        const token = loginData.token;
        console.log("Login success.");

        const headers = { Authorization: `Bearer ${token}` };

        // Test Logs
        console.log("\nTesting GET /api/audit-logs...");
        const logsRes = await fetch('http://localhost:5001/api/audit-logs', { headers });
        if (logsRes.ok) {
            const logs = await logsRes.json();
            console.log("Logs count:", logs.length);
            if (logs.length > 0) console.log("First Log Details:", logs[0].details);
        } else {
            console.log("Logs Error:", logsRes.status);
        }

        // Test Shipments
        console.log("\nTesting GET /api/shipments...");
        const shipRes = await fetch('http://localhost:5001/api/shipments', { headers });
        if (shipRes.ok) {
            const ships = await shipRes.json();
            console.log("Shipments count:", ships.length);
            // console.log(ships[0]);
        } else {
            console.log("Shipments Error:", shipRes.status);
            const txt = await shipRes.text();
            console.log(txt);
        }

    } catch (e) { console.error(e); }
}
test();
