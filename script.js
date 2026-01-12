const btn = document.getElementById("btn-mic");
const rawText = document.getElementById("raw-text");
const result = document.getElementById("result");

/* ===== RECONNAISSANCE VOCALE ===== */
const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;

if (!SpeechRecognition) {
  alert("Reconnaissance vocale non supportée sur ce navigateur");
}

const recognition = new SpeechRecognition();
recognition.lang = "fr-FR";
recognition.interimResults = false;
recognition.continuous = false;

btn.onclick = () => recognition.start();

recognition.onresult = (e) => {
  const texte = e.results[0][0].transcript;
  rawText.value = texte;

  const items = parseVoiceToBatimentPieces(texte); // [{batiment, piece}, ...]
  renderTwoLevels(items);
};

/* =========================================================
   PARSING GÉNÉRIQUE : 2 colonnes { batiment, piece }
   - pas de liste prédéfinie de pièces
   - quantités uniquement si "2 X" ou "deux X"
   - "logement 2" ne doit jamais impacter les quantités
   ========================================================= */

function parseVoiceToBatimentPieces(text) {
  // 1) Normalisation douce (on garde accents, utile pour l’affichage)
  const original = (text || "").trim();
  const lower = original.toLowerCase();

  // 2) Contexte "bâtiment / logement / appartement / lot / étage" => 1 seule chaîne
  const ctx = extractContext(lower, original); // retourne une string déjà "propre"

  // 3) On récupère la partie “liste des pièces” (après verbes type "il y a", "nous avons"...)
  const listPart = extractListPart(lower, original);

  // 4) On découpe la liste en items (générique)
  const rawPieces = splitPieces(listPart);

  // 5) Expansion des quantités, uniquement si explicite "2 chambres" / "deux chambres"
  const expanded = expandQuantities(rawPieces);

  // 6) Sortie finale (2 colonnes)
  return expanded
    .map(p => cleanPieceLabel(p))
    .filter(Boolean)
    .map(piece => ({ batiment: ctx, piece }));
}

/* ====== CONTEXTE ======
   On veut une sortie du style :
   - "Bâtiment A, logement 2"
   - "Appartement 12"
   - "Lot 5, Étage 2"
   - "Bâtiment B, RDC"
*/
function extractContext(lower, original) {
  const parts = [];

  // bâtiment A / bâtiment 1
  const bat = lower.match(/\bb[âa]timent\s+([a-z0-9]+)/i);
  if (bat) parts.push(`Bâtiment ${bat[1].toUpperCase()}`);

  // logement 2
  const log = lower.match(/\blogement\s+([0-9a-z]+)/i);
  if (log) parts.push(`logement ${log[1]}`);

  // appartement 12
  const apt = lower.match(/\bappartement\s+([0-9a-z]+)/i);
  if (apt) parts.push(`Appartement ${apt[1]}`);

  // lot 5
  const lot = lower.match(/\blot\s+([0-9a-z]+)/i);
  if (lot) parts.push(`Lot ${lot[1]}`);

  // niveau / étage (optionnel)
  const niv = normalizeLevel(lower);
  if (niv) parts.push(niv);

  // fallback si rien
  if (!parts.length) return "Contexte NC";

  // cas où on a bâtiment + appartement : on garde les 2 si dictée comme ça
  // ex: "bâtiment A appartement 12" -> "Bâtiment A, Appartement 12"
  // On assemble avec virgules pour correspondre à ton attente.
  return parts.join(", ");
}

function normalizeLevel(lower) {
  // on n’utilise PAS de liste de bâtiments, seulement des patterns très génériques
  if (/\brez[-\s]?de[-\s]?chauss[ée]e\b|\brez\b|\brdc\b|\brez de jardin\b/i.test(lower)) return "RDC";
  const rplus = lower.match(/\br\+\s*([0-9]+)/i);
  if (rplus) return `Étage ${rplus[1]}`;
  const etageNum = lower.match(/\b[ée]tage\s*([0-9]+)/i);
  if (etageNum) return `Étage ${etageNum[1]}`;
  if (/\bpremier\b.*\b[ée]tage\b|\b1er\b.*\b[ée]tage\b/i.test(lower)) return "Étage 1";
  if (/\bdeuxi[èe]me\b.*\b[ée]tage\b|\b2e\b.*\b[ée]tage\b/i.test(lower)) return "Étage 2";
  if (/\btroisi[èe]me\b.*\b[ée]tage\b|\b3e\b.*\b[ée]tage\b/i.test(lower)) return "Étage 3";
  return "";
}

/* ====== EXTRACTION LISTE PIÈCES ======
   On cherche la partie après des déclencheurs :
   "nous avons", "il y a", "on a", "on trouve", "comprend", ":"...
*/
function extractListPart(lower, original) {
  // on découpe sur des déclencheurs, on prend ce qu’il y a après le dernier trouvé
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

  if (idx === -1) return original; // pas de déclencheur => on tente tout

  return original.slice(idx + trigLen).trim();
}

/* ====== SPLIT LISTE EN PIÈCES (générique) ======
   - coupe sur virgules, points, "et", ";"
   - garde les groupes utiles
*/
function splitPieces(listPart) {
  if (!listPart) return [];

  // On remplace " et " par virgule pour uniformiser
  let s = listPart.replace(/\bet\b/gi, ",");
  // On coupe sur ponctuation
  const chunks = s.split(/[,.;\n]+/).map(x => x.trim()).filter(Boolean);

  // enlève des stopwords de début type "une", "un", "des" pour améliorer l’affichage
  return chunks.map(c => c.replace(/^(une|un|des|du|de la|de l’|de l'|d’|d')\s+/i, "").trim());
}

/* ====== QUANTITÉS ======
   IMPORTANT : on n’emploie un nombre QUE si il est juste devant un nom de pièce.
   Ex: "2 chambres" => OK
   Ex: "logement 2" => ne passe jamais ici (car c’est dans le contexte, pas dans la liste)
*/
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
    // pattern explicite "2 chambres" ou "deux chambres"
    // -> quantité = 2, libellé = "chambres" -> "Chambre 1", "Chambre 2"
    const m = it.match(/^\s*(\d+|un|une|deux|trois|quatre|cinq|six|sept|huit|neuf|dix)\s+(.+)\s*$/i);

    if (m) {
      const qRaw = m[1].toLowerCase();
      const labelRaw = m[2].trim();

      const qty = /^\d+$/.test(qRaw) ? parseInt(qRaw, 10) : (wordsToNum[qRaw] || 1);

      // si qty > 1 : on numérote, sinon on garde tel quel
      if (qty > 1) {
        const singular = singularize(labelRaw);
        for (let i = 1; i <= qty; i++) out.push(`${singular} ${i}`);
      } else {
        out.push(labelRaw);
      }
      return;
    }

    // pas de quantité explicite => pièce simple
    out.push(it);
  });

  return out;
}

/* singularisation simple (suffisant pour chambre(s), bureau(x), etc.)
   si ça ne singularise pas bien, ce n’est pas grave : "Chambres 1" reste compréhensible.
*/
function singularize(label) {
  const s = label.trim();
  // cas basique "chambres" -> "chambre"
  if (s.endsWith("s") && s.length > 3) return s.slice(0, -1);
  return s;
}

function cleanPieceLabel(p) {
  if (!p) return "";
  return p
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^\-+/, "")
    .trim();
}

/* =========================================================
   AFFICHAGE 2 NIVEAUX (une carte par contexte)
   ========================================================= */
function renderTwoLevels(items) {
  result.innerHTML = "";

  if (!items || !items.length) {
    result.innerHTML = "<p>Aucune pièce détectée</p>";
    return;
  }

  // group by contexte (batiment)
  const grouped = {};
  items.forEach(it => {
    if (!grouped[it.batiment]) grouped[it.batiment] = [];
    grouped[it.batiment].push(it.piece);
  });

  Object.keys(grouped).forEach(ctx => {
    const div = document.createElement("div");
    div.className = "card";
    div.innerHTML = `
      <strong>${ctx}</strong>
      <ul>
        ${grouped[ctx].map(p => `<li>${escapeHtml(p)}</li>`).join("")}
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
