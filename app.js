(() => {
  // -----------------------------
  // Helpers DOM
  // -----------------------------
  const $ = (id) => document.getElementById(id);

  const dict = $("dict");
  const tbody = $("tbody");
  const micBtn = $("micBtn");
  const micStatus = $("micStatus");
  const parseStatus = $("parseStatus");
  const locPreview = $("locPreview");
  const roomsPreview = $("roomsPreview");

  // -----------------------------
  // Simple storage (offline)
  // -----------------------------
  const STORE_KEY = "diag_voice_rows_v2_onefield";

  function loadRows(){
    try { return JSON.parse(localStorage.getItem(STORE_KEY) || "[]"); }
    catch(e){ return []; }
  }
  function saveRows(rows){
    localStorage.setItem(STORE_KEY, JSON.stringify(rows));
  }

  let rows = loadRows();

  // -----------------------------
  // Minimal room dictionary (aliases → canonical)
  // Extendable later if needed
  // -----------------------------
  const ROOM_ALIASES = new Map([
    ["cuisine","Cuisine"],
    ["sejour","Séjour"],
    ["séjour","Séjour"],
    ["salon","Séjour"],
    ["piece a vivre","Séjour"],
    ["pièce a vivre","Séjour"],
    ["pièce à vivre","Séjour"],
    ["mezzanine","Mezzanine"],
    ["chambre","Chambre"],
    ["bureau","Bureau"],
    ["entree","Entrée"],
    ["entrée","Entrée"],
    ["couloir","Couloir"],
    ["degagement","Dégagement"],
    ["dégagement","Dégagement"],
    ["cellier","Cellier"],
    ["buanderie","Buanderie"],
    ["wc","WC"],
    ["w.c","WC"],
    ["w.-c.","WC"],
    ["toilettes","WC"],
    ["salle de bain","Salle de bain"],
    ["salle de bains","Salle de bain"],
    ["salle d eau","Salle d'eau"],
    ["salle d'eau","Salle d'eau"],
    ["sdb","Salle de bain"],
    ["garage","Garage"],
    ["cave","Cave"],
    ["grenier","Grenier"],
    ["combles","Combles"],
    ["local technique","Local technique"],
    ["terrasse","Terrasse"],
    ["balcon","Balcon"],
    ["veranda","Véranda"],
    ["véranda","Véranda"],
  ]);

  // Common noise to ignore (spoken filler)
  const NOISE_PATTERNS = [
    /\bnous\s+avons\b/g,
    /\bil\s+y\s+a\b/g,
    /\bdans\s+ce\s+logement\b/g,
    /\bdans\s+le\s+logement\b/g,
    /\bdans\s+ce\s+b[âa]timent\b/g,
    /\bdans\s+le\s+b[âa]timent\b/g,
    /\bici\b/g,
    /\beuh+\b/g,
    /\balors\b/g,
    /\bdu\s+coup\b/g,
    /\bvoil[aà]\b/g,
    /\bon\s+a\b/g,
    /\bavec\b/g,
    /\bles\s+pi[eè]ces\s+suivantes\b/g, // removed if it appears inside the list
  ];

  // French numbers → int
  const NUM_WORDS = new Map([
    ["un",1],["une",1],
    ["deux",2],["trois",3],["quatre",4],["cinq",5],["six",6],
    ["sept",7],["huit",8],["neuf",9],["dix",10]
  ]);

  function normalizeText(s){
    return (s || "")
      .trim()
      .replace(/\s+/g, " ")
      .replace(/[’]/g, "'");
  }

  function cleanNoise(s){
    let out = s;
    for(const re of NOISE_PATTERNS) out = out.replace(re, " ");
    return out.replace(/\s+/g, " ").trim();
  }

  // Collapse immediate repeated words: "cuisine cuisine cuisine" -> "cuisine"
  // Works best for the common SpeechRecognition duplication glitch.
  function collapseRepeatedWords(s){
    // Unicode letters + apostrophe
    return s.replace(/\b([\p{L}']+)(?:\s+\1\b)+/giu, "$1");
  }

  // -----------------------------
  // Keyword slicing: "localisation" ... "il y a les pièces suivantes"
  // -----------------------------
  const RE_LOC_KEY = /\blocalisation\b/i;
  const RE_ROOMS_KEY = /\bil\s+y\s+a\s+(?:les\s+)?pi[eè]ces\s+suivantes\b|\bpi[eè]ces\s+suivantes\b|\bpi[eè]ces\s*:/i;

  function sliceByKeywords(raw){
    const t = normalizeText(raw);
    const locMatch = t.match(RE_LOC_KEY);
    if(!locMatch) return { locText: "", roomsText: "" };

    const locStart = locMatch.index + locMatch[0].length;
    const afterLoc = t.slice(locStart);

    const roomsMatch = afterLoc.match(RE_ROOMS_KEY);
    if(!roomsMatch) {
      return { locText: afterLoc.trim(), roomsText: "" };
    }

    const roomsStart = roomsMatch.index + roomsMatch[0].length;
    const locText = afterLoc.slice(0, roomsMatch.index).trim();
    const roomsText = afterLoc.slice(roomsStart).trim();

    return { locText, roomsText };
  }

  // -----------------------------
  // Location parsing: "bâtiment A logement 2 rez de chaussée" -> "Bâtiment A - Logement 2 - RDC"
  // -----------------------------
  function parseLocation(raw){
    const s0 = normalizeText(raw).toLowerCase();
    if(!s0) return "";

    let s = s0.replace(/\bbatiment\b/g, "bâtiment");

    let bat = "";
    const mBat = s.match(/\bb[âa]timent\s+([a-z0-9]+)/i);
    if(mBat) bat = `Bâtiment ${mBat[1].toUpperCase()}`;

    let log = "";
    const mLog = s.match(/\b(logement|appartement|appt)\s+([0-9]+)\b/i);
    if(mLog) log = `Logement ${mLog[2]}`;

    let et = "";
    if(/\brez(\s|-)?de(\s|-)?chauss[ée]e\b/i.test(s) || /\brdc\b/i.test(s)) et = "RDC";
    else if(/\bsous\s*-?\s*sol\b/i.test(s)) et = "Sous-sol";
    else {
      const mEt = s.match(/\b(1er|2e|2ème|3e|3ème|4e|4ème)\s*[ée]tage\b/i);
      if(mEt) et = mEt[1].toUpperCase().replace("È","E");
      const mEtNum = s.match(/\b[ée]tage\s+([0-9]+)\b/i);
      if(!et && mEtNum) et = `${mEtNum[1]}e`;
    }

    const parts = [bat, log, et].filter(Boolean);
    return parts.join(" - ");
  }

  // -----------------------------
  // Rooms parsing with quantities, flexible separators, and numbering only when qty > 1
  // Example: "une cuisine, un séjour, deux chambres, deux WC séparés" -> Cuisine; Séjour; Chambre 1; Chambre 2; WC 1; WC 2
  // -----------------------------
  function splitRoomChunks(s){
    return s
      .replace(/[\n\r]+/g, " | ")
      .replace(/[.,;:]/g, " | ")
      .replace(/\bet\b/gi, " | ")
      .replace(/\s*\|\s*/g, "|")
      .replace(/\s+/g, " ")
      .split("|")
      .map(x => x.trim())
      .filter(Boolean);
  }

  function toNumber(token){
    if(!token) return null;
    if(/^\d+$/.test(token)) return parseInt(token, 10);
    if(NUM_WORDS.has(token)) return NUM_WORDS.get(token);
    return null;
  }

  function bestAliasMatch(chunk){
    // Prefer longest match
    let best = null;
    for(const [k, val] of ROOM_ALIASES.entries()){
      if(chunk.includes(k)){
        if(!best || k.length > best.k.length) best = { k, val };
      }
    }
    return best ? best.val : null;
  }

  function canonicalizeRoom(chunk){
    let c = chunk.toLowerCase().trim();

    // remove adjectives often appended: "séparés", "séparé", "indépendant", etc.
    c = c.replace(/\b(s[ée]par[ée]s?|ind[ée]pendants?|ind[ée]pendant|distincts?)\b/gi, " ").replace(/\s+/g, " ").trim();

    // extract quantity at beginning
    let qty = 1;
    const tokens = c.split(" ").filter(Boolean);
    if(tokens.length){
      const n = toNumber(tokens[0]);
      if(n !== null && n > 0 && n <= 20){
        qty = n;
        tokens.shift();
      } else if(tokens[0] === "un" || tokens[0] === "une"){
        tokens.shift();
      }
    }
    c = tokens.join(" ").trim();

    // remove small glue words (safe)
    c = c.replace(/\b(a|au|aux|dans|de|du|des|d')\b/gi, " ").replace(/\s+/g, " ").trim();
    if(!c) return null;

    const base = bestAliasMatch(c);
    if(!base) return null;

    return { base, qty };
  }

  function parseRooms(raw){
    const s0 = cleanNoise(normalizeText(raw));
    if(!s0) return [];

    const cleaned = collapseRepeatedWords(s0);
    const chunks = splitRoomChunks(cleaned);

    const out = [];
    const counters = new Map();

    for(const ch of chunks){
      const item = canonicalizeRoom(ch);
      if(!item) continue;

      const { base, qty } = item;

      if(qty <= 1){
        out.push(base);
        continue;
      }
      // qty > 1 => add numbering
      for(let i=1;i<=qty;i++){
        out.push(`${base} ${i}`);
      }
    }

    // small de-dup (consecutive)
    const dedup = [];
    for(const p of out){
      if(!dedup.length || dedup[dedup.length-1].toLowerCase() !== p.toLowerCase()) dedup.push(p);
    }
    return dedup;
  }

  // -----------------------------
  // Parse full dict field
  // -----------------------------
  function parseAll(){
    const raw = dict.value || "";
    const { locText, roomsText } = sliceByKeywords(raw);

    const location = parseLocation(locText);
    const pieces = parseRooms(roomsText);

    locPreview.textContent = location || "—";
    roomsPreview.textContent = pieces.length ? pieces.join("\n") : "—";

    if(!raw.trim()) parseStatus.textContent = "Parsing: —";
    else parseStatus.textContent = `Parsing: ${location ? "loc OK" : "loc ?" } • ${pieces.length} pièce(s)`;

    return { location, pieces };
  }

  dict.addEventListener("input", parseAll);

  // -----------------------------
  // Table render (editable) + actions
  // -----------------------------
  function render(){
    tbody.innerHTML = "";
    rows.forEach((r, idx) => {
      const tr = document.createElement("tr");

      const tdLoc = document.createElement("td");
      tdLoc.contentEditable = "true";
      tdLoc.textContent = r.location || "";
      tdLoc.addEventListener("input", () => { rows[idx].location = tdLoc.textContent.trim(); saveRows(rows); });

      const tdRoom = document.createElement("td");
      tdRoom.contentEditable = "true";
      tdRoom.textContent = r.room || "";
      tdRoom.addEventListener("input", () => { rows[idx].room = tdRoom.textContent.trim(); saveRows(rows); });

      const tdAct = document.createElement("td");
      const actions = document.createElement("div");
      actions.className = "actions";

      const del = document.createElement("button");
      del.className = "miniBtn";
      del.textContent = "🗑️";
      del.title = "Supprimer";
      del.addEventListener("click", () => {
        rows.splice(idx, 1);
        saveRows(rows);
        render();
      });

      const mic = document.createElement("button");
      mic.className = "miniBtn";
      mic.textContent = "🎙️";
      mic.title = "Descriptif (futur)";
      mic.addEventListener("click", () => {
        alert("🎙️ Futur: dictée de descriptif spécifique pour cette pièce.");
      });

      actions.appendChild(del);
      actions.appendChild(mic);
      tdAct.appendChild(actions);

      tr.appendChild(tdLoc);
      tr.appendChild(tdRoom);
      tr.appendChild(tdAct);
      tbody.appendChild(tr);
    });
  }

  // -----------------------------
  // CSV export (simple)
  // -----------------------------
  function exportCSV(){
    const header = ["Localisation","Pièce"];
    const lines = [header.join(";")];

    for(const r of rows){
      const a = (r.location || "").replace(/\s+/g," ").trim().replace(/"/g,'""');
      const b = (r.room || "").replace(/\s+/g," ").trim().replace(/"/g,'""');
      lines.push(`"${a}";"${b}"`);
    }
    const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);

    const a = document.createElement("a");
    a.href = url;
    a.download = "export_diagnostic.csv";
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  // -----------------------------
  // Buttons
  // -----------------------------
  $("clearBtn").addEventListener("click", () => {
    dict.value = "";
    parseAll();
    dict.focus();
  });

  $("addBtn").addEventListener("click", () => {
    const { location, pieces } = parseAll();
    if(!location || !pieces.length){
      alert("Je n'ai pas trouvé la localisation et/ou la liste de pièces.\nVérifie les mots-clés: « localisation » puis « il y a les pièces suivantes ».");
      return;
    }
    pieces.forEach(p => rows.push({ location, room: p }));
    saveRows(rows);
    render();
  });

  $("resetBtn").addEventListener("click", () => {
    if(!confirm("Vider tout le tableau ?")) return;
    rows = [];
    saveRows(rows);
    render();
  });

  $("exportBtn").addEventListener("click", exportCSV);

  // -----------------------------
  // Web Speech API (Chrome/Android)
  // Fix duplication: only append new FINAL chunks not already at end.
  // -----------------------------
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  let rec = null;
  let listening = false;
  let lastFinalText = "";
  let lastFinalAt = 0;

  function setMicUI(){
    if(listening){
      micBtn.classList.add("listening");
      micBtn.textContent = "⏹️ Arrêter la dictée";
      micStatus.textContent = "Micro: écoute…";
    } else {
      micBtn.classList.remove("listening");
      micBtn.textContent = "🎤 Démarrer la dictée";
      micStatus.textContent = "Micro: prêt";
    }
  }

  function ensureRec(){
    if(!SpeechRecognition) return null;
    if(rec) return rec;

    rec = new SpeechRecognition();
    rec.lang = "fr-FR";
    rec.continuous = true;
    rec.interimResults = true;

    rec.onresult = (event) => {
      // Collect only final transcripts from this event
      let finalChunk = "";
      for(let i = event.resultIndex; i < event.results.length; i++){
        const res = event.results[i];
        if(res.isFinal) finalChunk += (res[0].transcript || "");
      }
      finalChunk = normalizeText(finalChunk);
      if(!finalChunk) return;

      // Anti-duplication:
      // 1) Ignore if identical to last chunk within 2 seconds (common loop)
      const now = Date.now();
      if(finalChunk === lastFinalText && (now - lastFinalAt) < 2000) return;

      // 2) Collapse repeated words inside the chunk
      finalChunk = collapseRepeatedWords(finalChunk);

      // 3) If textarea already ends with this chunk (or with it + punctuation), skip
      const cur = dict.value || "";
      const curNorm = cur.trimEnd();
      const chunkNorm = finalChunk.trim();

      const endsWithChunk =
        curNorm.toLowerCase().endsWith(chunkNorm.toLowerCase()) ||
        curNorm.toLowerCase().endsWith((chunkNorm + ".").toLowerCase()) ||
        curNorm.toLowerCase().endsWith((chunkNorm + ",").toLowerCase());

      if(endsWithChunk) return;

      // Append with a space or newline depending on last char
      const sep = curNorm && !/[\n\s]$/.test(curNorm) ? " " : "";
      dict.value = curNorm + sep + chunkNorm;
      dict.dispatchEvent(new Event("input"));

      lastFinalText = finalChunk;
      lastFinalAt = now;
    };

    rec.onerror = (e) => {
      console.warn("Speech error:", e);
      stopMic();
      alert("Micro indisponible ou erreur de reconnaissance.\nAstuce: autoriser le micro et utiliser Chrome.");
    };

    rec.onend = () => {
      // Chrome can stop itself; restart if user still in listening mode
      if(listening){
        try { rec.start(); } catch(e) {}
      }
    };

    return rec;
  }

  function startMic(){
    const r = ensureRec();
    if(!r){
      alert("Web Speech API non disponible sur ce navigateur.\nUtiliser Chrome (Android/desktop).");
      return;
    }
    listening = true;
    setMicUI();
    try { r.start(); } catch(e) {}
  }

  function stopMic(){
    listening = false;
    setMicUI();
    if(rec){
      try { rec.stop(); } catch(e) {}
    }
  }

  micBtn.addEventListener("click", () => {
    if(!listening) startMic();
    else stopMic();
  });

  // initial
  render();
  parseAll();
})();