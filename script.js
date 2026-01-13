/* =====================================================
   LOGIQUE DE SAISIE TERRAIN - LICIEL
   ===================================================== */

const btnMic = document.getElementById("btn-mic");
const btnAdd = document.getElementById("btn-add");
const rawText = document.getElementById("raw-text");
const ctxText = document.getElementById("ctx-text");
const tableBody = document.getElementById("table-body");

let isListening = false;
let activeInput = rawText; 

// Gestion du focus
[ctxText, rawText].forEach(el => {
    el.addEventListener('focus', () => activeInput = el);
});

/* ===== MOTEUR VOCAL (Correction répétitions) ===== */
const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
let recognition = null;

if (SpeechRecognition) {
    recognition = new SpeechRecognition();
    recognition.lang = "fr-FR";
    recognition.continuous = true;
    recognition.interimResults = false;

    recognition.onresult = (e) => {
        let transcript = "";
        for (let i = e.resultIndex; i < e.results.length; ++i) {
            if (e.results[i].isFinal) transcript += e.results[i][0].transcript;
        }
        if (transcript) {
            const currentVal = activeInput.value.trim();
            const sep = (activeInput === rawText && currentVal) ? ", " : " ";
            activeInput.value = currentVal ? currentVal + sep + transcript.trim() : transcript.trim();
        }
    };

    recognition.onend = () => { if (isListening) recognition.start(); };
}

/* ===== ACTIONS ===== */

btnMic.addEventListener("click", () => {
    isListening = !isListening;
    if (isListening) {
        recognition && recognition.start();
        btnMic.textContent = "🛑 Arrêter l'écoute";
        btnMic.classList.add("recording");
    } else {
        recognition && recognition.stop();
        btnMic.textContent = "🎤 Commencer la dictée";
        btnMic.classList.remove("recording");
    }
});

// Vider un champ spécifique
function clearField(id) {
    document.getElementById(id).value = "";
}

// Ajouter les données au tableau (Cumulatif)
btnAdd.addEventListener("click", () => {
    const rawContext = ctxText.value.trim();
    const rawPiecesText = rawText.value.trim();

    if (!rawContext || !rawPiecesText) {
        alert("Veuillez remplir le bâtiment et au moins une pièce.");
        return;
    }

    // 1. Formatage du contexte (Bâtiment A - Logement 2)
    const formattedContext = formatContext(rawContext);

    // 2. Parsing des pièces et quantités
    const piecesList = rawPiecesText.replace(/\bet\b/gi, ",").split(/[,.]+/);
    const expandedPieces = expandQuantities(piecesList.map(p => p.trim()).filter(p => p.length > 0));

    // 3. Ajout au tableau (append)
    expandedPieces.forEach(piece => {
        const row = document.createElement("tr");
        row.innerHTML = `
            <td contenteditable="true">${formattedContext}</td>
            <td contenteditable="true">${piece}</td>
            <td class="cell-actions">
                <button class="btn-tool" onclick="this.parentElement.parentElement.remove()">🗑️</button>
                <button class="btn-tool">🎙️</button>
            </td>
        `;
        tableBody.appendChild(row);
    });

    // Nettoyage automatique du champ pièces après ajout (on garde souvent le bâtiment)
    rawText.value = "";
});

/* ===== HELPERS DE FORMATAGE ===== */

function formatContext(text) {
    // Transforme "Batiment A logement 2 rez de chaussée" en "Bâtiment A - Logement 2 - Rez-de-chaussée"
    return text
        .replace(/\b(bâtiment|batiment)\b/gi, "Bâtiment")
        .replace(/\b(logement)\b/gi, "- Logement")
        .replace(/\b(rez de chaussée|rdc|rez-de-chaussée)\b/gi, "- RDC")
        .replace(/\b(appartement|apt)\b/gi, "- Apt")
        .replace(/\s+-\s+/g, " - ") // Nettoie les doubles espaces autour des tirets
        .replace(/^- /, "") // Enlever tiret initial si présent
        .trim();
}

function expandQuantities(items) {
    const out = [];
    const wordsToNum = { "un": 1, "une": 1, "deux": 2, "trois": 3, "quatre": 4, "cinq": 5 };

    items.forEach(it => {
        const t = it.toLowerCase();
        // Capture : (chiffre ou mot) + (nom de la pièce)
        const m = t.match(/^(\d+|un|une|deux|trois|quatre|cinq)\s+(.+)$/i);

        if (m) {
            const qty = /^\d+$/.test(m[1]) ? parseInt(m[1]) : (wordsToNum[m[1]] || 1);
            const label = m[2].trim();
            if (qty > 1) {
                const base = label.endsWith('s') ? label.slice(0, -1) : label;
                for (let i = 1; i <= qty; i++) out.push(capitalize(base) + " " + i);
            } else {
                out.push(capitalize(label));
            }
        } else {
            out.push(capitalize(it));
        }
    });
    return out;
}

function capitalize(s) { return s.charAt(0).toUpperCase() + s.slice(1); }

function exportToJSON() {
    const rows = Array.from(tableBody.querySelectorAll("tr"));
    const data = rows.map(r => ({
        location: r.cells[0].innerText,
        piece: r.cells[1].innerText
    }));
    console.log(data);
    alert("Données prêtes pour l'export console");
}
