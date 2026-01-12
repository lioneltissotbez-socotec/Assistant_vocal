function parseVoiceText(text) {
  if (!text || typeof text !== "string") {
    return { batiment: "Non communiqué", pieces: [] };
  }

  /* ===============================
     1. NORMALISATION
  =============================== */
  let clean = text
    .toLowerCase()
    .replace(/[.,]/g, "")
    .replace(/\s+/g, " ")
    .trim();

  /* ===============================
     2. EXTRACTION LIEU (NON QUANTITATIF)
  =============================== */
  const lieux = [];
  const lieuRegex = /(bâtiment|batiment|logement|appartement)\s*([a-z0-9]+)/g;
  let m;

  while ((m = lieuRegex.exec(clean)) !== null) {
    lieux.push(`${capitalize(m[1])} ${m[2].toUpperCase()}`);
  }

  const batiment = lieux.length ? lieux.join(", ") : "Non communiqué";

  /* ===============================
     3. ZONE DES PIÈCES
  =============================== */
  let zone = clean;
  const split = clean.split(/il y a|nous avons|on a|comprend|contient/);
  if (split.length > 1) zone = split[1];

  /* ===============================
     4. INSERTION DE SÉPARATEURS LOGIQUES
     (clé du correctif)
  =============================== */
  zone = zone
    // avant mots quantificateurs
    .replace(/\b(un|une|deux|trois|quatre|cinq|six|sept|huit|neuf|dix)\b/g, "|$1")
    // avant chiffres isolés
    .replace(/\b(\d+)\b/g, "|$1")
    // normalisation
    .replace(/\s*\|\s*/g, "|")
    .replace(/^\|/, "");

  /* ===============================
     5. PARSING DES BLOCS
  =============================== */
  const nombres = {
    "un": 1, "une": 1,
    "deux": 2, "trois": 3,
    "quatre": 4, "cinq": 5,
    "six": 6, "sept": 7,
    "huit": 8, "neuf": 9,
    "dix": 10
  };

  const pieces = [];

  zone.split("|").forEach(bloc => {
    const b = bloc.trim();
    if (!b) return;

    // ignore les redéfinitions de lieu
    if (/bâtiment|batiment|logement|appartement/.test(b)) return;

    const match = b.match(/^(un|une|deux|trois|quatre|cinq|six|sept|huit|neuf|dix|\d+)?\s*(.+)$/);
    if (!match) return;

    const qtyRaw = match[1];
    const nom = match[2].trim();
    if (!nom) return;

    const qty =
      qtyRaw
        ? (nombres[qtyRaw] || parseInt(qtyRaw, 10) || 1)
        : 1;

    if (qty > 1) {
      const base = singularize(nom);
      for (let i = 1; i <= qty; i++) {
        pieces.push(`${capitalize(base)} ${i}`);
      }
    } else {
      pieces.push(capitalize(nom));
    }
  });

  return { batiment, pieces };
}

/* ===============================
   UTILITAIRES
=============================== */
function capitalize(s) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function singularize(s) {
  if (s.endsWith("s") && s.length > 3) return s.slice(0, -1);
  return s;
}
