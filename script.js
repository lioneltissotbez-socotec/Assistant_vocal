/* =====================================================
   TEST SAISIE VOCALE – PIÈCES (2 COLONNES)
   - Contexte (bâtiment/logement/appartement) ≠ quantités
   - Quantités uniquement si explicites: "deux chambres", "3 bureaux"
   - Pas de liste fermée de pièces
   ===================================================== */

const btnMic = document.getElementById("btn-mic");
const btnParse = document.getElementById("btn-parse");
const btnClear = document.getElementById("btn-clear");
const btnCopy = document.getElementById("btn-copy");

const rawText = document.getElementById("raw-text");
const result = document.getElementById("result");

/* ===== RECONNAISSANCE VOCALE ===== */
const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;

let recognition = null;

if (SpeechRecognition) {
  recognition = new SpeechRecognition();
  recognition.lang = "fr-FR";
  recognition.interimResults = false;
  recognition.continuous = false;

  recognition.onresult = (e) => {
    const texte = e.results[0][0].transcript || "";
    rawText.value = texte;
    runParse();
  };

  recognition.onerror = (e) => {
    alert("Erreur dictée : " + (e.error || "inconnue"));
  };
} else {
  btnMic.disabled = true;
  btnMic.textContent = "🎤 Dictée non supportée";
}

/* ===== UI actions ===== */
btnMic.addEventListener("click", () => recognition && recognition.start());
btnParse.addEventListener("click", runParse);
btnClear.addEventListener("click", () => {
  rawText.value = "";
  result.innerHTML = "";
});

btnCopy.addEventListener("click", async () => {
  const items = parseVoiceToBatimentPieces(rawText.value || "");
  const grouped = groupByBatiment(items);
  const payload = { items, grouped };
  try {
    await navigator.clipboard.writeText(JSON.stringify(payload, null, 2));
    btnCopy.textContent = "✅ Copié";
    setTimeout(() => (btnCopy.textContent = "📋 Copier JSON"), 900);
  } catch {
    alert("Copie impossible (droits navigateur).");
  }
});

function runParse() {
  const items = parseVoiceToBatimentPieces(rawText.value || "");
  renderTwoLevels(items);
}

/* =========================================================
   PARSING : 2 colonnes { batiment, piece }
   ========================================================= */
function parseVoiceToBatimentPieces(text) {
  if (!text || typeof text !== "string") return [];

  const original = text.trim();
  const lower = original.toLowerCase();

  // 1) Contexte (bâtiment / logement / appartement / lot) — chiffres ici NE sont PAS des quantités
  const ctx = extractContext(lower);

  // 2) Partie "liste des pièces" (après déclencheurs)
  const listPart = extractListPart(lower, original);

  // 3) Découpage générique en segments "pièces"
  const rawPieces = splitPieces(listPart);

  // 4) Expansion des quantités uniquement si collées à une pièce ("2 chambres", "deux chambres")
  const expanded = expandQuantities(rawPieces);

  // 5) Sortie finale 2 colonnes
  return expanded
    .map(cleanLabel)
    .filter(Boolean)
    .map(piece => ({ batiment: ctx, piece }));
}

/* ===== Contexte ===== */
function extractContext(lower) {
  const parts = [];

  // bâtiment A / bâtiment 1
  const bat = lower.match(/\b(bâtiment|batiment)\s+([a-z0-9]+)/i);
  if (bat) parts.push(`Bâtiment ${String(bat[2]).toUpperCase()}`);

  const log = lower.match(/\blogement\s+([a-z0-9]+)/i);
  if (log) parts.push(`logement ${String(log[1])}`);

  const apt = lower.match(/\bappartement\s+([a-z0-9]+)/i);
  if (apt) parts.push(`Appartement ${String(apt[1])}`);

  const lot = lower.match(/\blot\s+([a-z0-9]+)/i);
  if (lot) parts.push(`Lot ${String(lot[1])}`);

  return parts.length ? parts.join(", ") : "Non communiqué";
}

/* ===== Zone liste pièces ===== */
function extractListPart(lower, original) {
  const triggers = [
    "nous avons",
    "il y a",
    "on a",
    "on trouve",
    "comprend",
    "contient",
    ":"
  ];

  let idx = -1;
  let trigLen = 0;

  triggers.forEach(t => {
    const i = lower.lastIndexOf(t);
    if (i > idx) { idx = i; trigLen = t.length; }
  });

  if (idx === -1) return original;
  return original.slice(idx + trigLen).trim();
}

/* ===== Split items ===== */
function splitPieces(listPart) {
  if (!listPart) return [];

  let s = listPart;
  s = s.replace(/\bet\b/gi, ",");

  const chunks = s.split(/[,.;\n]+/).map(x => x.trim()).filter(Boolean);
  return chunks.map(c => c.replace(/^(une|un|des|du|de la|de l’|de l'|d’|d')\s+/i, "").trim());
}

/* ===== Quantités (strict) ===== */
function expandQuantities(items) {
  const out = [];

  const wordsToNum = {
    "un": 1, "une": 1,
    "deux": 2,
    "trois": 3,
    "quatre": 4,
    "cinq": 5,
    "six": 6,
    "sept": 7,
    "huit": 8,
    "neuf": 9,
    "dix": 10
  };

  items.forEach(it => {
    const t = it.trim();
    if (!t) return;

    // ignore segments that are actually context
    if (/\b(bâtiment|batiment|logement|appartement|lot)\b/i.test(t)) return;

    // quantité uniquement au début du segment
    const m = t.match(/^\s*(\d+|un|une|deux|trois|quatre|cinq|six|sept|huit|neuf|dix)\s+(.+)\s*$/i);

    if (m) {
      const qRaw = String(m[1]).toLowerCase();
      const labelRaw = String(m[2]).trim();
      if (!labelRaw) return;

      const qty = /^\d+$/.test(qRaw) ? parseInt(qRaw, 10) : (wordsToNum[qRaw] || 1);

      if (qty > 1) {
        const base = singularize(labelRaw);
        for (let i = 1; i <= qty; i++) out.push(`${base} ${i}`);
      } else {
        out.push(labelRaw);
      }
      return;
    }

    out.push(t);
  });

  return out;
}

function singularize(label) {
  const s = label.trim();
  if (s.endsWith("s") && s.length > 3) return s.slice(0, -1);
  return s;
}

function cleanLabel(s) {
  return String(s || "")
    .replace(/\s+/g, " ")
    .replace(/^\-+/, "")
    .trim();
}

/* =========================================================
   AFFICHAGE 2 NIVEAUX
   ========================================================= */
function groupByBatiment(items) {
  const grouped = {};
  items.forEach(it => {
    if (!grouped[it.batiment]) grouped[it.batiment] = [];
    grouped[it.batiment].push(it.piece);
  });
  return grouped;
}

function renderTwoLevels(items) {
  result.innerHTML = "";

  if (!items || items.length === 0) {
    result.innerHTML = "<div class='ctx'><div class='ctx-title'>Aucun résultat</div><div>Dicte ou colle une phrase contenant “nous avons …”</div></div>";
    return;
  }

  const grouped = groupByBatiment(items);

  Object.keys(grouped).forEach(ctx => {
    const div = document.createElement("div");
    div.className = "ctx";

    const pieces = grouped[ctx] || [];
    div.innerHTML = `
      <div class="ctx-title">${escapeHtml(ctx)} <span class="badge">${pieces.length}</span></div>
      <ul>
        ${pieces.map(p => `<li>${escapeHtml(p)}</li>`).join("")}
      </ul>
    `;
    result.appendChild(div);
  });
}

function escapeHtml(s) {
  return String(s)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
