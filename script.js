/* =====================================================
   LOGIQUE DE SAISIE VOCALE – MULTI-BATIMENT
   ===================================================== */

const btnMic = document.getElementById("btn-mic");
const btnParse = document.getElementById("btn-parse");
const btnClear = document.getElementById("btn-clear");
const btnCopy = document.getElementById("btn-copy");
const rawText = document.getElementById("raw-text");
const result = document.getElementById("result");

let isListening = false;
const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
let recognition = null;

if (SpeechRecognition) {
    recognition = new SpeechRecognition();
    recognition.lang = "fr-FR";
    recognition.interimResults = true; // Pour voir le texte s'afficher en direct
    recognition.continuous = true;    // Reste actif

    recognition.onresult = (e) => {
        let finalTranscript = "";
        for (let i = e.resultIndex; i < e.results.length; ++i) {
            if (e.results[i].isFinal) finalTranscript += e.results[i][0].transcript;
        }
        if (finalTranscript) {
            rawText.value += (rawText.value ? " " : "") + finalTranscript;
            runParse();
        }
    };

    recognition.onend = () => {
        if (isListening) recognition.start(); // Relance auto si crash mobile
    };
}

/* Interaction Micro */
btnMic.addEventListener("click", () => {
    if (!isListening) {
        isListening = true;
        recognition && recognition.start();
        btnMic.textContent = "🛑 Stop";
        btnMic.classList.add("recording");
    } else {
        isListening = false;
        recognition && recognition.stop();
        btnMic.textContent = "🎤 Dicter";
        btnMic.classList.remove("recording");
    }
});

/* ===== PARSING MULTI-CONTEXTE ===== */
function runParse() {
    const text = rawText.value || "";
    const segments = splitByContext(text);
    renderTwoLevels(segments);
}

/**
 * Découpe le texte par changement de bâtiment/logement
 * Retourne [{ context: "Bat A", pieces: [...] }]
 */
function splitByContext(text) {
    if (!text) return [];

    // On cherche les points de rupture (Bâtiment, Logement, etc.)
    const contextRegex = /\b(bâtiment|batiment|logement|appartement|lot)\b/gi;
    const lower = text.toLowerCase();
    
    let matches = [];
    let match;
    while ((match = contextRegex.exec(lower)) !== null) {
        matches.push(match.index);
    }

    // Si aucun contexte trouvé au début, on crée un contexte par défaut
    if (matches.length === 0 || matches[0] > 10) {
        matches.unshift(0);
    }

    const blocks = [];
    for (let i = 0; i < matches.length; i++) {
        const start = matches[i];
        const end = matches[i + 1] || text.length;
        const chunk = text.slice(start, end).trim();
        
        if (chunk) {
            const context = extractContext(chunk.toLowerCase()) || "Contexte non défini";
            const listPart = extractListPart(chunk.toLowerCase(), chunk);
            const rawPieces = splitPieces(listPart);
            const expanded = expandQuantities(rawPieces);
            
            blocks.push({
                context: context,
                pieces: expanded.map(cleanLabel).filter(Boolean)
            });
        }
    }
    return blocks;
}

function extractContext(text) {
    const parts = [];
    const bat = text.match(/\b(bâtiment|batiment)\s+([a-z0-9]+)/i);
    if (bat) parts.push(`Bâtiment ${bat[2].toUpperCase()}`);
    const log = text.match(/\blogement\s+([a-z0-9]+)/i);
    if (log) parts.push(`Logement ${log[1]}`);
    const apt = text.match(/\bappartement\s+([a-z0-9]+)/i);
    if (apt) parts.push(`Apt ${apt[1]}`);
    return parts.length ? parts.join(", ") : null;
}

function extractListPart(lower, original) {
    const triggers = ["nous avons", "il y a", "on a", "comprend", "contient", "avec", ":"];
    let idx = -1;
    let trigLen = 0;

    triggers.forEach(t => {
        const i = lower.indexOf(t);
        if (i !== -1 && (idx === -1 || i < idx)) { 
            idx = i; 
            trigLen = t.length; 
        }
    });

    if (idx === -1) return original.replace(/\b(bâtiment|logement|appartement)\s+[a-z0-9]+\b/gi, "");
    return original.slice(idx + trigLen).trim();
}

function splitPieces(text) {
    // Sépare par "et", virgule, point-virgule, ou point
    return text
        .replace(/\bet\b/gi, ",")
        .split(/[,.;\n]+/)
        .map(x => x.trim())
        .filter(x => x.length > 2)
        .map(c => c.replace(/^(une|un|des|du|de la|de l'|le|la)\s+/i, ""));
}

function expandQuantities(items) {
    const out = [];
    const wordsToNum = { "un": 1, "une": 1, "deux": 2, "trois": 3, "quatre": 4, "cinq": 5 };

    items.forEach(it => {
        const m = it.match(/^\s*(\d+|un|une|deux|trois|quatre|cinq)\s+(.+)\s*$/i);
        if (m) {
            const qRaw = m[1].toLowerCase();
            const labelRaw = m[2].trim();
            const qty = /^\d+$/.test(qRaw) ? parseInt(qRaw, 10) : (wordsToNum[qRaw] || 1);
            
            if (qty > 1) {
                const base = labelRaw.endsWith("s") ? labelRaw.slice(0, -1) : labelRaw;
                for (let i = 1; i <= qty; i++) out.push(`${base} ${i}`);
            } else {
                out.push(labelRaw);
            }
        } else {
            out.push(it);
        }
    });
    return out;
}

function cleanLabel(s) { return s.trim().charAt(0).toUpperCase() + s.trim().slice(1); }

function renderTwoLevels(blocks) {
    result.innerHTML = "";
    if (!blocks.length) return;

    blocks.forEach(block => {
        const div = document.createElement("div");
        div.className = "ctx";
        div.innerHTML = `
            <div class="ctx-title">📍 ${block.context} <span class="badge">${block.pieces.length}</span></div>
            <ul>${block.pieces.map(p => `<li>${p}</li>`).join("")}</ul>
        `;
        result.appendChild(div);
    });
}

/* Actions UI restants */
btnClear.addEventListener("click", () => { rawText.value = ""; result.innerHTML = ""; });
btnParse.addEventListener("click", runParse);
