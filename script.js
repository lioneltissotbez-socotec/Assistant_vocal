// --- Dictionnaire pièces (canonique) ---
const PIECES = [
  "entree","hall","vestibule","degagement","couloir","circulation","palier interieur",
  "sejour","salon","salle de sejour","piece de vie","salle a manger","cuisine",
  "chambre","chambre parentale","bureau","salle de bain","wc","dressing","buanderie",
  "cellier","grenier","combles","cave","garage","balcon","terrasse","loggia","veranda"
];

const rawText = document.getElementById("raw-text");
const result = document.getElementById("result");
document.getElementById("btn-parse").onclick = parse;
document.getElementById("btn-clear").onclick = () => { rawText.value = ""; result.innerHTML = ""; };

function normalize(t){
  return t.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g,"");
}

function parse(){
  const txt = normalize(rawText.value);
  const ctx = extractContext(txt);
  const pieces = extractPieces(txt);
  render(ctx, pieces);
}

function extractContext(t){
  const m = t.match(/batiment\s+([a-z0-9]+)/);
  return m ? "Bâtiment " + m[1].toUpperCase() : "Contexte NC";
}

function extractPieces(t){
  const words = t.split(/\s+/);
  let buf=[], out=[];
  words.forEach(w=>{
    buf.push(w);
    if(PIECES.includes(buf.join(" "))){
      out.push(buf.join(" "));
      buf=[];
    }
  });
  return out;
}

function render(ctx,pieces){
  result.innerHTML = `
    <div class="ctx">
      <div class="ctx-title" contenteditable="true">✏️ ${ctx}</div>
      <ul>
        ${pieces.map(p=>`
          <li>
            <span contenteditable="true">${p}</span>
            <button>✏️</button><button>🎤</button>
          </li>`).join("")}
      </ul>
    </div>`;
}
