const express = require('express');
const fs = require('fs');
const app = express();
const port = 3000;

app.use(express.json());

const users = JSON.parse(fs.readFileSync('C:/Users/kiana/WebstormProjects/BruteForce/TEST_DATA/users.json', 'utf8'));

// Map für Fehlversuche und Verzögerung pro Benutzer
const loginAttempts = {}; // { username: { count: Number, lastFail: timestamp } }
const BASE_DELAY = 2000; // 2 Sekunden
const MAX_DELAY = 32000; // 32 Sekunden

app.post('/login', async (req, res) => {
    const { username, password } = req.body;
    const user = users.find(u => u.username === username && u.password === password);

    if (user) {
        // Bei Erfolg: Fehlversuche zurücksetzen
        if (loginAttempts[username]) {
            delete loginAttempts[username];
        }
        return res.json({ ok: true });
    } else {
        // Fehlversuch zählen und Verzögerung berechnen
        if (!loginAttempts[username]) {
            loginAttempts[username] = { count: 1, lastFail: Date.now() };
        } else {
            loginAttempts[username].count += 1;
            loginAttempts[username].lastFail = Date.now();
        }
        // Exponentielle Verzögerung, maximal MAX_DELAY
        const delay = Math.min(BASE_DELAY * Math.pow(2, loginAttempts[username].count - 1), MAX_DELAY);
        await new Promise(r => setTimeout(r, delay));
        return res.status(401).json({ ok: false, error: `Falscher Benutzername oder Passwort. Wartezeit: ${delay / 1000}s` });
    }
});

app.get('/login', (req, res) => {
    res.sendFile(__dirname + '/index.html');
});

app.listen(port, () => {
    console.log(`läuft http://localhost:${port}/login`);
});
