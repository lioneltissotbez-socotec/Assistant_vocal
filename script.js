/* =====================================================
   LOGIQUE DE SAISIE TERRAIN - LICIEL
   ===================================================== */

const btnMic = document.getElementById("btn-mic");
const btnClear = document.getElementById("btn-clear");
const rawText = document.getElementById("raw-text");
const ctxText = document.getElementById("ctx-text");
const tableBody = document.getElementById("table-body");

let isListening = false;
let activeInput = rawText; 

// Sélection du champ actif
[ctxText, rawText].forEach(el => {
    el.addEventListener('focus', () => {
        activeInput = el;
        // Animation visuelle simple pour le champ actif
        el.style.borderColor = "#2563eb";
    });
    el.addEventListener('blur', () => el.style.borderColor = "#d1d5db");
    el.addEventListener('input', runParse); // Met à jour le tableau en temps réel
});

/* ===== MOTEUR DE RECONNAISSANCE ===== */
const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
let recognition = null;

if (SpeechRecognition) {
    recognition = new SpeechRecognition();
    recognition.lang = "fr-FR";
    recognition.continuous = true;
    recognition.interimResults = false;

    recognition.onresult = (e) => {
        let finalSegment = "";
        for (let i = e.resultIndex; i < e.results.length; ++i) {
            if (e.results[i].isFinal) {
                finalSegment += e.results[i][0].transcript;
            }
        }
        
        if (finalSegment) {
            const currentVal = activeInput.value.trim();
            // On ajoute une virgule si c'est la liste des pièces
            const separator = (activeInput === rawText && currentVal) ? ", " : " ";
            activeInput.value = currentVal ? currentVal + separator + finalSegment.trim() : finalSegment.trim();
            runParse();
        }
    };

    recognition.onerror = (err) => console.error("Erreur Speech:", err.error);
    recognition.onend = () => { if (isListening) recognition.start(); };
}

btnMic.addEventListener("click", () => {
    if (!isListening) {
        isListening = true;
        recognition && recognition.start();
        btnMic.textContent = "🛑 Arrêter l'écoute";
        btnMic.classList.add("recording");
    } else {
        isListening = false;
        recognition && recognition.stop();
        btnMic.textContent = "🎤 Commencer la dictée";
        btnMic.classList.remove("recording");
    }
});

btnClear.addEventListener("click", () => {
    if(confirm("Voulez-vous tout effacer ?")) {
        rawText.value = "";
        ctxText.value = "";
        runParse();
    }
});

/* ===== PARSING & RENDU ===== */
function runParse() {
    const context = ctxText.value.trim() || "Non défini";
    const text = rawText.value || "";
    
    // Nettoyage et split (par virgule, point, ou "et")
    const rawPieces = text.replace(/\bet\b/gi, ",").split(/[,.]+/);
    const cleanedPieces = rawPieces.map(p => p.trim()).filter(p => p.length > 1);
    
    // Expansion des quantités (ex: 2 chambres -> Chambre 1, Chambre 2)
    const expanded = expandQuantities(cleanedPieces);
    
    renderTable(context, expanded);
}

function expandQuantities(items) {
    const out = [];
    const wordsToNum = { "un": 1, "une": 1, "deux": 2, "trois": 3, "quatre": 4, "cinq": 5 };

    items.forEach(it => {
        const t = it.toLowerCase().trim();
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

function renderTable(context, pieces) {
    tableBody.innerHTML = "";
    pieces.forEach((piece, index) => {
        const row = document.createElement("tr");
        row.innerHTML = `
            <td contenteditable="true" onblur="updateFromTable()">${context}</td>
            <td contenteditable="true" onblur="updateFromTable()">${piece}</td>
            <td class="cell-actions">
                <button title="Ajouter descriptif" class="btn-tool">🎙️</button>
                <button title="Modifier" class="btn-tool">✏️</button>
            </td>
        `;
        tableBody.appendChild(row);
    });
}

// Fonction pour synchroniser les changements manuels du tableau vers les champs (optionnel)
function updateFromTable() {
    // Cette fonction peut être étendue pour sauvegarder les modifs manuelles dans un objet JS
    console.log("Tableau mis à jour manuellement");
}

function capitalize(s) { return s.charAt(0).toUpperCase() + s.slice(1); }
