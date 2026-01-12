const btn = document.getElementById("btn-mic");
const rawText = document.getElementById("raw-text");
const result = document.getElementById("result");

const SpeechRecognition =
  window.SpeechRecognition || window.webkitSpeechRecognition;

if (!SpeechRecognition) {
  alert("Reconnaissance vocale non supportée sur ce navigateur");
}

const recognition = new SpeechRecognition();
recognition.lang = "fr-FR";
recognition.interimResults = false;
recognition.continuous = false;

btn.onclick = () => {
  recognition.start();
};

recognition.onresult = e => {
  const texte = e.results[0][0].transcript;
  rawText.value = texte;
  analyseTexte(texte);
};

function analyseTexte(texte) {
  result.innerHTML = "";

  const clean = texte.toLowerCase();

  const batMatch = clean.match(/bâtiment\s+([a-z0-9]+)/i);
  const batiment = batMatch ? batMatch[1].toUpperCase() : "NC";

  let niveau = "NC";

  const niveaux = [
    { key: "rez", label: "RDC" },
    { key: "premier étage", label: "Étage 1" },
    { key: "deuxième étage", label: "Étage 2" },
    { key: "troisième étage", label: "Étage 3" }
  ];

  const piecesConnues = [
    "cuisine", "salon", "séjour", "chambre",
    "wc", "toilettes", "couloir",
    "dégagement", "salle de bain", "mezzanine"
  ];

  const lignes = clean.split(/\.|,/);

  lignes.forEach(ligne => {
    niveaux.forEach(n => {
      if (ligne.includes(n.key)) {
        niveau = n.label;
      }
    });

    piecesConnues.forEach(p => {
      if (ligne.includes(p)) {
        afficher({
          batiment,
          niveau,
          piece: p
        });
      }
    });
  });
}
function parsePiecesVocales(texte) {
  const clean = texte.toLowerCase();
  const results = [];

  // ===== 1. BÂTIMENT / APPARTEMENT =====
  let batiment = "NC";

  const batMatch = clean.match(/bâtiment\s+([a-z0-9]+)/i);
  const aptMatch = clean.match(/appartement\s+([a-z0-9]+)/i);

  if (batMatch) batiment = `Bâtiment ${batMatch[1].toUpperCase()}`;
  if (aptMatch) batiment = `Appartement ${aptMatch[1]}`;

  // ===== 2. NIVEAU =====
  let niveau = "";

  NIVEAUX.forEach(n => {
    n.keys.forEach(k => {
      if (clean.includes(k)) niveau = n.label;
    });
  });

  if (niveau) batiment += ` – ${niveau}`;

  // ===== 3. DÉCOUPAGE PAR PHRASES =====
  const segments = clean.split(/,|\.|et/);

  segments.forEach(seg => {
    PIECES.forEach(piece => {
      if (seg.includes(piece)) {

        // ===== 4. GESTION DES QUANTITÉS =====
        let qty = 1;

        Object.keys(NOMBRES).forEach(n => {
          if (seg.includes(n)) qty = NOMBRES[n];
        });

        if (seg.match(/\d+/)) {
          qty = parseInt(seg.match(/\d+/)[0], 10);
        }

        // ===== 5. GÉNÉRATION DES PIÈCES =====
        for (let i = 1; i <= qty; i++) {
          const nomPiece =
            qty > 1
              ? `${capitalize(piece)} ${i}`
              : capitalize(piece);

          results.push({
            batiment,
            piece: nomPiece
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

function afficher(obj) {
  const div = document.createElement("div");
  div.className = "card";
  div.innerHTML = `
    <strong>Bâtiment :</strong> ${obj.batiment}<br>
    <strong>Niveau :</strong> ${obj.niveau}<br>
    <strong>Pièce :</strong> ${obj.piece}
  `;
  result.appendChild(div);
}
