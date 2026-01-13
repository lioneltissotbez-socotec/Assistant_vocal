// =====================================================
// Dictée Diagnostic — 1 champ + mots-clés (Offline)
// Base stable dictée : interimResults=false (anti-redondances)
// + delta-injection (sécurise contre transcripts cumulés)
// + Parsing localisation + pièces (quantités, séparateurs)
// + Tableau cumulatif éditable + localStorage + JSON/CSV
// =====================================================

const $ = (id) => document.getElementById(id);

const voiceInput = $("voiceInput");
const tbody = $("tbody");

const btnMic = $("btnMic");
const btnStop = $("btnStop");
const btnClearText = $("btnClearText");

const btnAdd = $("btnAdd");
const btnParse = $("btnParse");
const btnCopy = $("btnCopy");
const btnCsv = $("btnCsv");
const btnClearTable = $("btnClearTable");

const locPreview = $("locPreview");
const countPreview = $("countPreview");
const statusPill = $("statusPill");

// -----------------------------
// Storage
// -----------------------------
const STORE_KEY = "diag_voice_onefield_rows_v2";
let rows = loadRows();

function loadRows(){
  try { return JSON.parse(localStorage.getItem(STORE_KEY) || "[]"); }
  catch { return []; }
}
function saveRows(){
  localStorage.setItem(STORE_KEY, JSON.stringify(rows));
}

// -----------------------------
// Keywords
// -----------------------------
const KW_LOC = "localisation";
const KW_ROOMS = "il y a les pièces suivantes";

// Accept some variants (tolerant terrain)
const KW_ROOMS_VARIANTS = [
  "il y a les pièces suivantes",
  "il y a les pieces suivantes",
  "pièces suivantes",
  "pieces suivantes",
  "pièces:",
  "pieces:"
];

// -----------------------------
// Helpers
// -----------------------------
function norm(s){
  return String(s || "")
    .trim()
    .replace(/\s+/g, " ")
    .replace(/[’]/g, "'"); // apostrophe unify
}

function lowerNoAccent(s){
  // lightweight accent folding
  return s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
}

function escapeHtml(s){
  return String(s)
    .replaceAll("&","&amp;")
    .replaceAll("<","&lt;")
    .replaceAll(">","&gt;")
    .replaceAll('"',"&quot;")
    .replaceAll("'","&#039;");
}

// -----------------------------
// Localisation parsing (like earlier stable approach, but formatted with hyphens)
// -----------------------------
function parseLocation(raw){
  const s0 = lowerNoAccent(norm(raw));
  if(!s0) return "";

  let bat = "";
  let log = "";
  let et = "";

  const mBat = s0.match(/\b(batiment|bâtiment)\s+([a-z0-9]+)/i);
  if(mBat) bat = `Bâtiment ${String(mBat[2]).toUpperCase()}`;

  const mLog = s0.match(/\b(logement|appartement|appt)\s+([0-9]+)/i);
  if(mLog) log = `Logement ${mLog[2]}`;

  if(/\b(rdc|rez de chaussee|rez-de-chaussee|rez de chaussée|rez-de-chaussée)\b/i.test(s0)){
    et = "RDC";
  } else {
    const mEt = s0.match(/\b([0-9]+)\s*(e|eme|ème|er)\s*etage\b/i);
    if(mEt) et = `${mEt[1]}e`;
    const mEt2 = s0.match(/\betage\s+([0-9]+)\b/i);
    if(!et && mEt2) et = `${mEt2[1]}e`;
  }

  const parts = [bat, log, et].filter(Boolean);
  return parts.join(" - ");
}

// -----------------------------
// Piece parsing
// -----------------------------
const NOISE_PATTERNS = [
  /\bnous\s+avons\b/g,
  /\bil\s+y\s+a\b/g,
  /\bon\s+a\b/g,
  /\bdans\s+ce\s+logement\b/g,
  /\bdans\s+le\s+logement\b/g,
  /\bdans\s+ce\s+batiment\b/g,
  /\bdans\s+ce\s+bâtiment\b/g,
  /\bici\b/g,
  /\beuh+\b/g,
  /\balors\b/g,
  /\bdu\s+coup\b/g,
  /\bvoila\b/g,
  /\bvoilà\b/g,
  /\bavec\b/g
];

const WORDS_TO_NUM = {
  "un":1,"une":1,
  "deux":2,"trois":3,"quatre":4,"cinq":5,"six":6,"sept":7,"huit":8,"neuf":9,"dix":10
};

const ALIASES = new Map([
  ["cuisine","Cuisine"],
  ["sejour","Séjour"],
  ["séjour","Séjour"],
  ["salon","Séjour"],
  ["piece a vivre","Séjour"],
  ["pièce à vivre","Séjour"],
  ["chambre","Chambre"],
  ["chambres","Chambre"],
  ["couloir","Couloir"],
  ["wc","WC"],
  ["wcs","WC"],
  ["toilettes","WC"],
  ["salle de bain","Salle de bain"],
  ["salle de bains","Salle de bain"],
  ["salle d'eau","Salle d'eau"],
  ["salle d eau","Salle d'eau"],
]);

function cleanNoise(s){
  let out = s;
  for(const re of NOISE_PATTERNS) out = out.replace(re, " ");
  return out.replace(/\s+/g, " ").trim();
}

function splitPieces(listPart){
  if(!listPart) return [];

  let s = String(listPart);

  // Normalize punctuation/separators
  s = s.replace(/[:]/g, ",");
  s = s.replace(/[.;]/g, ",");
  s = s.replace(/\bet\b/gi, ",");
  s = s.replace(/\n+/g, ",");

  // If the operator speaks without commas ("une cuisine un séjour deux chambres"),
  // split on determiners/quantities by inserting commas before them.
  s = s.replace(/\s+(un|une|deux|trois|quatre|cinq|six|sept|huit|neuf|dix|\d+)\s+/gi, ", $1 ");

  // Also split on "puis" / "ensuite" (common in dictation)
  s = s.replace(/\b(puis|ensuite)\b/gi, ",");

  return s.split(/,+/)
    .map(x => x.trim())
    .filter(Boolean)
    .map(c => c
      .replace(/^(les|la|le|l'|l’)\s+/i, "")
      .replace(/^(une|un|des|du|de la|de l'|de l’|d'|d’)\s+/i, "")
      .trim()
    )
    .filter(Boolean);
}

function toQty(tok){
  if(!tok) return null;
  const t = tok.toLowerCase();
  if(/^\d+$/.test(t)) return parseInt(t, 10);
  if(WORDS_TO_NUM[t]) return WORDS_TO_NUM[t];
  return null;
}

function singularize(label){
  const s = label.trim();
  if(s.endsWith("s") && s.length > 3) return s.slice(0, -1);
  return s;
}

function canonicalize(label){
  if(!label) return "";
  let s = norm(label);

  // remove common adjectives after room names
  s = s.replace(/\b(separe|séparé|separes|séparés|separee|séparée|separees|séparées)\b/gi, "").trim();
  s = s.replace(/\s+/g, " ").trim();

  const key = lowerNoAccent(s);

  // 1) Exact match (strongest)
  for(const [k, val] of ALIASES.entries()){
    const kk = lowerNoAccent(k);
    if(key === kk) return val;
  }

  // 2) Starts-with match ("wc séparés", "salle de bain principale", etc.)
  for(const [k, val] of ALIASES.entries()){
    const kk = lowerNoAccent(k);
    if(key.startsWith(kk + " ")) return val;
  }

  // 3) Contained longest (fallback)
  let best = null;
  for(const [k, val] of ALIASES.entries()){
    const kk = lowerNoAccent(k);
    if(key.includes(kk)){
      if(!best || kk.length > best.k.length) best = {k: kk, val};
    }
  }
  if(best) return best.val;

  // fallback: keep original cleaned (title-case-ish)
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function expandQuantities(items){
  const out = [];
  const counters = new Map(); // per base label

  items.forEach(it => {
    const t = norm(it);
    if(!t) return;

    // ignore context words if operator repeats them in pieces section
    if(/\b(batiment|bâtiment|logement|appartement|lot|etage|étage|rdc)\b/i.test(t)) return;

    const m = t.match(/^\s*(\d+|un|une|deux|trois|quatre|cinq|six|sept|huit|neuf|dix)\s+(.+)\s*$/i);
    if(m){
      const q = toQty(m[1]);
      const rawLabel = norm(m[2]);
      if(!rawLabel) return;

      const base = canonicalize(singularize(rawLabel));

      if(q && q > 1){
        const start = (counters.get(base) || 0) + 1;
        for(let i=0;i<q;i++){
          out.push(`${base} ${start + i}`);
        }
        counters.set(base, start + (q - 1));
      } else {
        // qty=1 -> no numbering
        out.push(base);
      }
      return;
    }

    // no explicit qty
    const base = canonicalize(t);
    out.push(base);
  });

  // dedupe immediate duplicates (common in dictation)
  const cleaned = [];
  for(const p of out){
    if(!p) continue;
    if(cleaned.length && lowerNoAccent(cleaned[cleaned.length-1]) === lowerNoAccent(p)) continue;
    cleaned.push(p);
  }
  return cleaned;
}

// -----------------------------
// Section extraction (keywords)
// -----------------------------
function extractSections(raw){
  const original = norm(raw);
  const low = lowerNoAccent(original);

  let locText = "";
  let roomsText = "";

  const iLoc = low.indexOf(KW_LOC);
  let iRooms = -1;
  for(const v of KW_ROOMS_VARIANTS){
    const j = low.indexOf(lowerNoAccent(v));
    if(j !== -1 && (iRooms === -1 || j < iRooms)) iRooms = j;
  }

  if(iLoc !== -1){
    const start = iLoc + KW_LOC.length;
    const end = (iRooms !== -1 && iRooms > start) ? iRooms : original.length;
    locText = original.slice(start, end).replace(/^[\s,:-]+/, "").trim();
  }

  if(iRooms !== -1){
    // find which variant matched to skip it
    let matchedLen = 0;
    for(const v of KW_ROOMS_VARIANTS){
      const vv = lowerNoAccent(v);
      if(low.startsWith(vv, iRooms)){
        matchedLen = v.length;
        break;
      }
    }
    const start = iRooms + matchedLen;
    roomsText = original.slice(start).replace(/^[\s,:-]+/, "").trim();
  }

  // fallback if keywords missing: treat full text as rooms
  if(!roomsText && !locText){
    roomsText = original;
  }

  return { locText, roomsText };
}

function parseFromOneField(raw){
  const { locText, roomsText } = extractSections(raw);

  const location = parseLocation(locText || raw); // allow location extraction even if keywords absent
  const cleanedRooms = cleanNoise(roomsText || "");
  const piecesRaw = splitPieces(cleanedRooms);
  const pieces = expandQuantities(piecesRaw);

  return { location: location || "Non communiqué", pieces };
}

// -----------------------------
// UI: Preview + Table
// -----------------------------
function render(){
  tbody.innerHTML = "";
  rows.forEach((r, idx) => {
    const tr = document.createElement("tr");

    const tdLoc = document.createElement("td");
    tdLoc.contentEditable = "true";
    tdLoc.textContent = r.location || "";
    tdLoc.addEventListener("input", () => {
      rows[idx].location = tdLoc.textContent.trim();
      saveRows();
    });

    const tdRoom = document.createElement("td");
    tdRoom.contentEditable = "true";
    tdRoom.textContent = r.room || "";
    tdRoom.addEventListener("input", () => {
      rows[idx].room = tdRoom.textContent.trim();
      saveRows();
    });

    const tdAct = document.createElement("td");
    const actions = document.createElement("div");
    actions.className = "actions";

    const del = document.createElement("button");
    del.className = "miniBtn";
    del.textContent = "🗑️";
    del.title = "Supprimer";
    del.addEventListener("click", () => {
      rows.splice(idx, 1);
      saveRows();
      render();
    });

    const mic = document.createElement("button");
    mic.className = "miniBtn";
    mic.textContent = "🎙️";
    mic.title = "Descriptif (futur)";
    mic.addEventListener("click", () => alert("🎙️ Futur: dictée descriptif spécifique pour cette pièce."));

    actions.appendChild(del);
    actions.appendChild(mic);
    tdAct.appendChild(actions);

    tr.appendChild(tdLoc);
    tr.appendChild(tdRoom);
    tr.appendChild(tdAct);
    tbody.appendChild(tr);
  });
}

function updatePreview(){
  const { location, pieces } = parseFromOneField(voiceInput.value || "");
  locPreview.textContent = location || "—";
  countPreview.textContent = String(pieces.length || 0);
}

voiceInput.addEventListener("input", updatePreview);

btnClearText.addEventListener("click", () => {
  voiceInput.value = "";
  updatePreview();
  voiceInput.focus();
});

btnParse.addEventListener("click", () => {
  updatePreview();
  // flash status pill
  statusPill.textContent = "Prévisualisé";
  setTimeout(() => (statusPill.textContent = "Offline"), 700);
});

btnAdd.addEventListener("click", () => {
  const { location, pieces } = parseFromOneField(voiceInput.value || "");
  if(!pieces.length) return;

  pieces.forEach(p => rows.push({ location, room: p }));
  saveRows();
  render();
  updatePreview();
});

btnClearTable.addEventListener("click", () => {
  if(!confirm("Vider tout le tableau ?")) return;
  rows = [];
  saveRows();
  render();
  updatePreview();
});

btnCopy.addEventListener("click", async () => {
  const payload = { rows, count: rows.length, exportedAt: new Date().toISOString() };
  try{
    await navigator.clipboard.writeText(JSON.stringify(payload, null, 2));
    const old = btnCopy.textContent;
    btnCopy.textContent = "✅ Copié";
    setTimeout(() => (btnCopy.textContent = old), 900);
  }catch{
    alert("Copie impossible (droits navigateur).");
  }
});

btnCsv.addEventListener("click", () => {
  // simple CSV: Localisation;Piece
  const sep = ";";
  const lines = ["Localisation;Piece"];
  rows.forEach(r => {
    const a = String(r.location || "").replaceAll('"','""');
    const b = String(r.room || "").replaceAll('"','""');
    lines.push(`"${a}"${sep}"${b}"`);
  });
  const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "diagnostic_pieces.csv";
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
});

// -----------------------------
// Speech Recognition (stable)
// -----------------------------
const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
let recognition = null;
let listening = false;

// anti-redondance
let lastFinalTranscript = "";

function initSpeech(){
  if(!SpeechRecognition){
    alert("Web Speech API non disponible. Utiliser Chrome.");
    return null;
  }
  recognition = new SpeechRecognition();
  recognition.lang = "fr-FR";

  // Base stable: avoid interim duplicates
  recognition.interimResults = false;
  recognition.continuous = true;

  recognition.onresult = (event) => {
    let finalText = "";
    for(let i = event.resultIndex; i < event.results.length; i++){
      const res = event.results[i];
      if(res.isFinal) finalText += res[0].transcript;
    }
    finalText = norm(finalText);
    if(!finalText) return;

    // ignore exact repeat
    if(finalText === lastFinalTranscript) return;
    lastFinalTranscript = finalText;

    injectDelta(finalText);
  };

  recognition.onerror = (e) => {
    const err = e && e.error ? e.error : "";
    console.warn("Speech error:", err);

    // Keep listening unless operator explicitly stopped.
    if(!listening) return;

    // Fatal / permission errors -> stop + inform
    if(err === "not-allowed" || err === "service-not-allowed"){
      stopDictation();
      alert("Micro refusé. Autorise l'accès au micro puis réessaie.");
      return;
    }

    // Non-fatal (no-speech, network, etc.) -> let onend restart silently
    try { recognition.stop(); } catch {}
  };

  recognition.onend = () => {
    // Chrome stops after silence even in continuous mode.
    // Restart as long as the operator didn't press STOP.
    if(!listening) return;
    setTimeout(() => {
      if(!listening) return;
      try { recognition.start(); } catch {}
    }, 250);
  };

  return recognition;
}

function injectDelta(newText){
  // Robust injection: only add what is new
  const current = norm(voiceInput.value);

  // If the API returns the full sentence again, keep only the delta
  if(current && newText.startsWith(current)){
    const delta = norm(newText.slice(current.length));
    if(!delta) return;
    voiceInput.value = current + " " + delta;
  } else {
    // Otherwise, append with guard: avoid appending if current already ends with newText
    if(current && current.endsWith(newText)) return;

    // collapse immediate duplicates inside newText ("cuisine cuisine" -> "cuisine")
    const collapsed = newText.replace(/\b(\w+)\s+\1\b/gi, "$1");
    voiceInput.value = current ? (current + " " + collapsed) : collapsed;
  }

  updatePreview();
  // keep cursor at end (mobile friendly)
  voiceInput.focus();
  voiceInput.selectionStart = voiceInput.selectionEnd = voiceInput.value.length;
}

function startDictation(){
  if(!recognition) initSpeech();
  if(!recognition) return;

  listening = true;
  lastFinalTranscript = "";
  btnMic.classList.add("listening");
  btnMic.textContent = "🎤 Écoute…";
  btnMic.disabled = true;

  btnStop.disabled = false;

  try { recognition.start(); } catch {}
}

function stopDictation(){
  listening = false;

  btnMic.classList.remove("listening");
  btnMic.textContent = "🎤 Démarrer dictée";
  btnMic.disabled = false;

  btnStop.disabled = true;

  if(recognition){
    try { recognition.stop(); } catch {}
  }
}

btnMic.addEventListener("click", startDictation);
btnStop.addEventListener("click", stopDictation);

// -----------------------------
// Init
// -----------------------------
render();
updatePreview();
statusPill.textContent = "Offline";
