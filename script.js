const btnMic = document.getElementById("btn-mic");
const rawText = document.getElementById("raw-text");
const ctxText = document.getElementById("ctx-text");
const result = document.getElementById("result");

let isListening = false;
let activeInput = rawText; // Par défaut, écrit dans les pièces

// Détecter quel champ l'utilisateur a cliqué
[ctxText, rawText].forEach(el => {
    el.addEventListener('focus', () => activeInput = el);
});

const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
let recognition = null;

if (SpeechRecognition) {
    recognition = new SpeechRecognition();
    recognition.lang = "fr-FR";
    recognition.continuous = true;
    recognition.interimResults = false; // Désactivé pour éviter les doublons visuels

    recognition.onresult = (e) => {
        let newText = "";
        for (let i = e.resultIndex; i < e.results.length; ++i) {
            if (e.results[i].isFinal) {
                newText += e.results[i][0].transcript;
            }
        }
        
        if (newText) {
            // Ajout propre sans répétition
            const currentVal = activeInput.value.trim();
            activeInput.value = currentVal ? currentVal + ", " + newText.trim() : newText.trim();
            runParse(); // Met à jour le rendu visuel
        }
    };

    recognition.onend = () => {
        if (isListening) recognition.start(); // Relance si coupure accidentelle
    };
}

btnMic.addEventListener("click", () => {
    if (!isListening) {
        isListening = true;
        recognition.start();
        btnMic.textContent = "🛑 Arrêter l'écoute";
        btnMic.classList.add("recording");
    } else {
        isListening = false;
        recognition.stop();
        btnMic.textContent = "🎤 Commencer la dictée";
        btnMic.classList.remove("recording");
    }
});

// PARSING SIMPLIFIÉ (car séparation des champs)
function runParse() {
    const piecesStr = rawText.value;
    const context = ctxText.value || "Non spécifié";
    
    // Nettoyage et découpage
    const rawPieces = piecesStr.replace(/\bet\b/gi, ",").split(/[,.]+/);
    
    // Utilisation de votre logique expandQuantities existante
    const expanded = expandQuantities(rawPieces.map(p => p.trim()).filter(p => p.length > 1));
    
    renderResult(context, expanded);
}

function renderResult(context, pieces) {
    result.innerHTML = `
        <div class="ctx">
            <div class="ctx-title">📍 ${context} <span class="badge">${pieces.length}</span></div>
            <ul>${pieces.map(p => `<li>${p}</li>`).join("")}</ul>
        </div>`;
}

// Récupération de votre fonction de quantité
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
                for (let i = 1; i <= qty; i++) out.push(base.charAt(0).toUpperCase() + base.slice(1) + " " + i);
            } else {
                out.push(label.charAt(0).toUpperCase() + label.slice(1));
            }
        } else {
            out.push(it.charAt(0).toUpperCase() + it.slice(1));
        }
    });
    return out;
}
