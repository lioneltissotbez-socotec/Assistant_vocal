/* =====================================================
   TEST SAISIE VOCALE – PIÈCES (2 NIVEAUX)
   ===================================================== */

const btn = document.getElementById("btn-mic");
const rawText = document.getElementById("raw-text");
const result = document.getElementById("result");

/* ===== RECONNAISSANCE VOCALE ===== */
const SpeechRecognition =
  window.SpeechRecognition || window.webkitSpeechRecognition;

if (!SpeechRecognition) {
  alert("Reconnaissance vocale non supportée sur ce navigateur");
}

const recognition = new SpeechRecognition();
recognition.lang = "fr-FR";
recognition.interimResults = false;
recognition.continuous = false;

btn.onclick = () => recognition.start();

recognition.onresult = e => {
  const texte = e.results[0][0].transcript;
  rawText.value = texte;

  const parsed = parsePiecesVocales(texte);
  renderResult(parsed);
};

/* =====================================================
   PARSING VOCAL → STRUCTURE { batiment, piece }
   ===================================================== */

function parsePiecesVocales(texte) {
  const clean = texte.toLowerCase();
  const results = [];

  /* ===== 1. BÂTIMENT / APPARTEMENT ===== */
  let batiment = "NC";

  const batMatch = clean.match(/bâtiment\s+([a-z0-9]+)/i);
  const aptMatch = clean.match(/appartement\s+([a-z0-9]+)/i);

  if (aptMatch) {
    batiment = `Appartement ${aptMatch[1]}`;
  } else if (batMatch) {
    batiment = `Bâtiment ${batMatch[1].toUpperCase()}`;
  }

  /* ===== 2. NIVEAU (INTÉGRÉ AU BÂTIMENT) ===== */
  const niveaux = [
    { keys: ["rez-de-chaussée", "rez de chaussée", "rez"], label: "RDC" },
    { keys: ["premier étage", "1er étage", "premier"], label: "Étage 1" },
    { keys: ["deuxième étage", "2e étage", "second"], label: "Étage 2" },
    { keys: ["troisième étage", "3e étage"], label: "Étage 3" }
  ];

  niveaux.forEach(n => {
    n.keys.forEach(k => {
      if (clean.includes(k)) {
        batiment += ` – ${n.label}`;
      }
    });
  });

  /* ===== 3. PIÈCES ET QUANTITÉS ===== */
  const piecesConnues = [
    "entrée", "cuisine", "séjour", "salon",
    "couloir", "dégagement",
    "wc", "toilettes",
    "salle de bain", "salle d'eau",
    "chambre", "mezzanine"
  ];

  const nombres = {
    "un": 1, "une": 1,
    "deux": 2,
    "trois": 3,
    "quatre": 4,
    "cinq": 5
  };

  const segments = clean.split(/,|\.| et /);

  segments.forEach(seg => {
    piecesConnues.forEach(piece => {
      if (seg.includes(piece)) {

        let qty = 1;

        // nombres en lettres
        Object.keys(nombres).forEach(n => {
          if (seg.includes(n)) qty = nombres[n];
        });

        // nombres en chiffres
        const numMatch = seg.match(/\d+/);
        if (numMatch) qty = parseInt(numMatch[0], 10);

        // création des pièces
        for (let i = 1; i <= qty; i++) {
          results.push({
            batiment,
            piece:
              qty > 1
                ? `${capitalize(piece)} ${i}`
                : capitalize(piece)
          });
        }
      }
    });
  });

  return results;
}

function capitalize(str) {
  return str.charAt(0).toUpperCase() + str.slice(1);
}

/* =====================================================
   AFFICHAGE STRUCTURÉ – 2 NIVEAUX
   ===================================================== */

function renderResult(items) {
  result.innerHTML = "";

  if (!items.length) {
    result.innerHTML = "<p>Aucune pièce détectée</p>";
    return;
  }

  // regroupement par bâtiment
  const grouped = {};
  items.forEach(it => {
    if (!grouped[it.batiment]) grouped[it.batiment] = [];
    grouped[it.batiment].push(it.piece);
  });

  Object.keys(grouped).forEach(bat => {
    const div = document.createElement("div");
    div.className = "card";

    div.innerHTML = `
      <strong>${bat}</strong>
      <ul>
        ${grouped[bat].map(p => `<li>${p}</li>`).join("")}
      </ul>
    `;

    result.appendChild(div);
  });
}
