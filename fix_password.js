const fs = require('fs');
const content = fs.readFileSync('server/index.js', 'utf8');

const oldBlock = `        let isMatch = false;
        try {
                isMatch = true;
            }
        } catch (err) {
            console.error("Argon2 Verify Error:", err);
            return res.status(500).json({ error: 'Authentication service error' });
        }`;

const newBlock = `        let isMatch = false;
        try {
            const storedHash = user.password_hash;
            if (storedHash.startsWith('$argon2')) {
                isMatch = await argon2.verify(storedHash, password);
            } else if (storedHash.startsWith('$2')) {
                isMatch = await bcrypt.compare(password, storedHash);
            } else {
                try {
                    const decryptedHash = decrypt(storedHash);
                    if (decryptedHash.startsWith('$argon2')) {
                        isMatch = await argon2.verify(decryptedHash, password);
                    } else if (decryptedHash.startsWith('$2')) {
                        isMatch = await bcrypt.compare(password, decryptedHash);
                    }
                } catch (decErr) {
                    console.error("Password hash format unknown:", storedHash.substring(0, 20) + '...');
                }
            }
            // Auto-migrate to argon2 on successful login
            if (isMatch && !storedHash.startsWith('$argon2')) {
                try {
                    const newHash = await argon2.hash(password);
                    await pool.request()
                        .input('ph', sql.NVarChar, newHash)
                        .input('id', sql.UniqueIdentifier, user.user_id)
                        .query('UPDATE system_users SET password_hash = @ph WHERE user_id = @id');
                    console.log('[Auth] Auto-migrated password to Argon2 for user:', user.user_id);
                } catch (migrateErr) {
                    console.error('[Auth] Auto-migrate error:', migrateErr.message);
                }
            }
        } catch (err) {
            console.error("Password Verify Error:", err);
            return res.status(500).json({ error: 'Authentication service error' });
        }`;

if (content.includes(oldBlock)) {
    const newContent = content.replace(oldBlock, newBlock);
    fs.writeFileSync('server/index.js', newContent);
    console.log('SUCCESS: Password verification block replaced!');
} else {
    console.log('ERROR: Could not find the target block. Trying alternative...');
    // Try line-based approach
    const lines = content.split('\n');
    const startIdx = lines.findIndex(l => l.trim() === 'let isMatch = false;');
    if (startIdx !== -1) {
        console.log('Found isMatch at line', startIdx + 1);
        // Find the catch block end
        let endIdx = startIdx;
        for (let i = startIdx; i < lines.length; i++) {
            if (lines[i].includes("'Authentication service error'")) {
                // Find the closing }
                for (let j = i; j < lines.length; j++) {
                    if (lines[j].trim() === '}') {
                        endIdx = j;
                        break;
                    }
                }
                break;
            }
        }
        console.log('End at line', endIdx + 1);
        const newLines = [...lines.slice(0, startIdx), ...newBlock.split('\n'), ...lines.slice(endIdx + 1)];
        fs.writeFileSync('server/index.js', newLines.join('\n'));
        console.log('SUCCESS via line-based approach!');
    } else {
        console.log('FAILED: Could not find isMatch');
    }
}
