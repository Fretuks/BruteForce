const express = require('express');
const fs = require('fs');
const path = require('path');
const app = express();
const port = 3000;
const axios = require('axios');
const HCAPTCHA_SECRET = '0x0000000000000000000000000000000000000000';
app.use(express.json());
const LOG_FILE = path.join(__dirname, 'login.log');
const users = JSON.parse(fs.readFileSync('TEST_DATA/users.json', 'utf8'));
const LINEAR_DELAY_MS = 1000;
const PROGRESSIVE_DELAYS = [10000, 60000, 300000];
const LOCKOUT_THRESHOLD = 5;
const LOCKOUT_DURATION = 15 * 60 * 1000;
const loginAttempts = {};

function logAttempt(username, status, ip, extra = '') {
    const timestamp = new Date().toISOString();
    const logLine = `[${timestamp}] [${ip}] [${username}] [${status}] ${extra}\n`;
    fs.appendFileSync(LOG_FILE, logLine);
    console.log(logLine.trim());
}

app.post('/login', async (req, res) => {
    const {username, password, captcha} = req.body;
    const ip = req.ip || req.connection.remoteAddress;
    const user = users.find(u => u.username === username && u.password === password);
    const now = Date.now();

    if (!loginAttempts[username]) {
        loginAttempts[username] = {
            count: 0,
            lockedUntil: null,
            lastFail: null,
            requiresCaptcha: false,
            cooldownUntil: null
        };
    }

    const state = loginAttempts[username];

    // 🔹 Lockout aktiv?
    if (state.lockedUntil && now < state.lockedUntil) {
        const remaining = Math.ceil((state.lockedUntil - now) / 1000);
        logAttempt(username, 'LOCKED', ip, `Noch gesperrt: ${remaining}s`);
        return res.status(423).json({
            ok: false,
            error: `Benutzer gesperrt. Bitte in ${remaining}s erneut versuchen.`
        });
    }

    // 🔹 Cooldown aktiv?
    if (state.cooldownUntil && now < state.cooldownUntil) {
        const remaining = Math.ceil((state.cooldownUntil - now) / 1000);
        logAttempt(username, 'COOLDOWN', ip, `Wartezeit noch ${remaining}s`);
        return res.status(429).json({
            ok: false,
            error: `Bitte ${remaining}s warten, bevor du es erneut versuchst.`,
            requiresCaptcha: state.requiresCaptcha
        });
    }

    // 🔹 Captcha-Prüfung (falls aktiv)
    if (state.requiresCaptcha) {
        if (!captcha || typeof captcha !== 'string') {
            logAttempt(username, 'CAPTCHA_MISSING', ip);
            return res.status(403).json({
                ok: false,
                error: 'Captcha fehlt',
                requiresCaptcha: true
            });
        }
        try {
            const verify = await axios.post(
                'https://hcaptcha.com/siteverify',
                new URLSearchParams({
                    secret: HCAPTCHA_SECRET,
                    response: captcha,
                    remoteip: req.ip
                })
            );
            if (!verify.data.success) {
                logAttempt(username, 'CAPTCHA_FAIL', ip);
                return res.status(403).json({
                    ok: false,
                    error: 'Captcha ungültig',
                    requiresCaptcha: true
                });
            }
        } catch (e) {
            console.error('Captcha-Überprüfung fehlgeschlagen:', e.message);
            return res.status(500).json({
                ok: false,
                error: 'Captcha-Fehler',
                requiresCaptcha: true
            });
        }
    }
    if (user) {
        delete loginAttempts[username];
        logAttempt(username, 'SUCCESS', ip);
        return res.json({ok: true, message: 'Login erfolgreich'});
    }
    state.count++;
    state.lastFail = now;
    logAttempt(username, 'FAIL', ip, `Fehlversuche: ${state.count}`);
    if (state.count >= 3) {
        state.requiresCaptcha = true;
    }
    if (state.count >= LOCKOUT_THRESHOLD) {
        state.lockedUntil = now + LOCKOUT_DURATION;
        state.count = 0;
        logAttempt(username, 'LOCKOUT', ip);
        return res.status(423).json({
            ok: false,
            error: `Zu viele Fehlversuche. Benutzer für 15 Minuten gesperrt.`
        });
    }
    const delay = PROGRESSIVE_DELAYS[state.count - 1] || LINEAR_DELAY_MS;
    state.cooldownUntil = now + delay;
    return res.status(401).json({
        ok: false,
        error: `Falscher Benutzername oder Passwort. Wartezeit: ${delay / 1000}s`,
        requiresCaptcha: state.requiresCaptcha
    });
});

// Einfaches Frontend für Tests
app.get('/login', (req, res) => {
    res.sendFile(__dirname + '/index.html');
});

app.listen(port, () => {
    console.log(`Sicherer Login-Server läuft auf http://localhost:${port}/login`);
});