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
