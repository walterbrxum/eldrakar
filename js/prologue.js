import { askAI } from "./openai.js";
import { GameBrain } from "./game-brain.js";
import GlobalUI from "./global-ui.js";
import { CinematicParticles } from "./regras/cinematic-effects.js";

let cinematicFX = null;
let character = null;
let isTyping = false;
let enviandoParaBatalha = false;

const storyText = document.getElementById("storyText");
const playerInput = document.getElementById("playerInput");
const sendBtn = document.getElementById("sendBtn");

function cinematicEffectsEnabled() {
  return GlobalUI?.getCharacter?.()?.settings?.cinematicEffects !== false;
}

window.addEventListener("eldrakar:settings-changed", event => {
  const settings = event?.detail || {};
  if (settings.cinematicEffects === false) {
    cinematicFX?.destroy();
    cinematicFX = null;
  }
});

let prologueState = {
  location: "Pântano Sombrio",
  scene: `
Você desperta sozinho
em um pântano escuro.

A CHUVA cai lentamente.

O cheiro de lama
e podridão invade o ar.

Algo observa você
na escuridão.
`
};

const PROLOGUE_SAVE_KEY = "eldrakar:prologue-save";

const sceneImages = {
  pantano: "./assets/scenes/pantano.png",
  floresta: "./assets/scenes/floresta.png",
  chuva: "./assets/scenes/pantano_chuva.png",
  acampamento: "./assets/scenes/acampamento.png",
  combate: "./assets/scenes/combate.png",
  escuro: "./assets/scenes/escuro.png"
};

function savePrologueState() {
  if (!character || !GameBrain) return;

  const payload = {
    prologueState,
    gameBrain: {
      estadoAtual: GameBrain.estadoAtual,
      turnoAtual: GameBrain.turnoAtual,
      location: GameBrain.location,
      scene: GameBrain.scene,
      encontroAtivo: GameBrain.encontroAtivo,
      ultimoVisualCombate: GameBrain.ultimoVisualCombate
    },
    character,
    savedAt: Date.now()
  };

  try {
    localStorage.setItem(PROLOGUE_SAVE_KEY, JSON.stringify(payload));
  } catch (error) {
    console.warn("Não foi possível salvar estado local do prólogo:", error);
  }
}

function loadPrologueState() {
  const raw = localStorage.getItem(PROLOGUE_SAVE_KEY);
  if (!raw) return null;

  try {
    const parsed = JSON.parse(raw);

    if (parsed.prologueState) {
      prologueState = parsed.prologueState;
    }

    if (parsed.gameBrain) {
      GameBrain.estadoAtual = parsed.gameBrain.estadoAtual || GameBrain.estadoAtual;
      GameBrain.turnoAtual = parsed.gameBrain.turnoAtual || GameBrain.turnoAtual;
      GameBrain.location = parsed.gameBrain.location || GameBrain.location;
      GameBrain.scene = parsed.gameBrain.scene || GameBrain.scene;
      GameBrain.encontroAtivo = parsed.gameBrain.encontroAtivo || GameBrain.encontroAtivo;
      GameBrain.ultimoVisualCombate = parsed.gameBrain.ultimoVisualCombate || GameBrain.ultimoVisualCombate;
    }

    if (parsed.character) {
      character = parsed.character;
      if (GlobalUI && typeof GlobalUI.setCharacter === "function") {
        GlobalUI.setCharacter(character);
      }
    }

    return parsed;
  } catch (error) {
    console.warn("Não foi possível restaurar estado local do prólogo:", error);
    return null;
  }
}

function clearPrologueState() {
  try {
    localStorage.removeItem(PROLOGUE_SAVE_KEY);
  } catch (error) {
    console.warn("Não foi possível limpar estado local do prólogo:", error);
  }
}

function getCurrentMonster() {
  const encounter = GameBrain?.encontroAtivo;
  return encounter?.monsters?.find(m => (m.hp || 0) > 0) || null;
}

function syncMonsterUI() {
  GlobalUI.setMonster(getCurrentMonster() || null);
}

function irParaBatalha(monstro) {
  if (enviandoParaBatalha || !monstro || !character) return;

  enviandoParaBatalha = true;

  sessionStorage.setItem("eldrakar:battle", JSON.stringify({
    player: character,
    monster: monstro,
    encounter: GameBrain.encontroAtivo || null,
    returnTo: "./world.html"
  }));

  savePrologueState();

  window.dispatchEvent(new CustomEvent("eldrakar:battle-start", {
    detail: {
      monsterId: monstro?.id || monstro?.nome || monstro?.name || null
    }
  }));

  window.location.href = "./battle.html";
}

function showThinking(texto = "🎲 O Mestre consulta os dados...") {
  if (!storyText) return;

  storyText.innerHTML = `
    <div class="thinking-text">
      ${texto}
    </div>
  `;
}

async function typeText(text) {
  if (!storyText) return;

  isTyping = true;
  storyText.innerHTML = "";

  const texto = String(text || "");

  for (let i = 0; i < texto.length; i++) {
    storyText.innerHTML += texto[i] === "\n" ? "<br>" : texto[i];
    await new Promise(r => setTimeout(r, 15));
  }

  isTyping = false;
}

async function falarNarrativaIA(texto) {
  if (!("speechSynthesis" in window)) return;

  speechSynthesis.cancel();

  const fala = new SpeechSynthesisUtterance(texto);
  fala.lang = "pt-BR";
  fala.rate = 0.85;
  fala.pitch = 0.8;
  fala.volume = 1;

  speechSynthesis.speak(fala);
}

let secretBossEventTriggered = false;

function createNarrativeBlackScreen(narrativeText, duration = 4000, onEnd) {
  const overlay = document.createElement("div");
  overlay.style.position = "fixed";
  overlay.style.top = "0";
  overlay.style.left = "0";
  overlay.style.width = "100vw";
  overlay.style.height = "100vh";
  overlay.style.background = "rgba(0, 0, 0, 1)";
  overlay.style.display = "flex";
  overlay.style.alignItems = "center";
  overlay.style.justifyContent = "center";
  overlay.style.zIndex = "9999";
  overlay.style.padding = "20px";
  overlay.style.flexDirection = "column";
  overlay.style.gap = "20px";

  const textContainer = document.createElement("div");
  textContainer.style.color = "#fff";
  textContainer.style.textAlign = "center";
  textContainer.style.fontSize = "18px";
  textContainer.style.lineHeight = "1.6";
  textContainer.style.maxWidth = "80%";
  textContainer.style.fontFamily = "Georgia, serif";
  textContainer.style.animation = "fadeInOut 1s ease-in, textPulse 0.8s ease-in-out 0.5s";

  const style = document.createElement("style");
  style.textContent = `
    @keyframes fadeInOut {
      0% { opacity: 0; }
      20% { opacity: 1; }
      80% { opacity: 1; }
      100% { opacity: 0; }
    }
    @keyframes textPulse {
      0%, 100% { transform: scale(1); }
      50% { transform: scale(1.05); }
    }
  `;
  overlay.appendChild(style);
  textContainer.textContent = narrativeText;
  overlay.appendChild(textContainer);

  document.body.appendChild(overlay);

  setTimeout(() => {
    overlay.remove();
    if (onEnd) onEnd();
  }, duration);
}

function createCutsceneOverlay(src, onEnd) {
  const overlay = document.createElement("div");
  overlay.style.position = "fixed";
  overlay.style.top = "0";
  overlay.style.left = "0";
  overlay.style.width = "100vw";
  overlay.style.height = "100vh";
  overlay.style.background = "rgba(0, 0, 0, 0.96)";
  overlay.style.display = "flex";
  overlay.style.alignItems = "center";
  overlay.style.justifyContent = "center";
  overlay.style.zIndex = "9999";
  overlay.style.padding = "0";

  const video = document.createElement("video");
  video.src = encodeURI(src);
  video.style.maxWidth = "100%";
  video.style.maxHeight = "100%";
  video.style.outline = "none";
  video.autoplay = true;
  video.controls = false;
  video.playsInline = true;
  video.muted = false;

  overlay.appendChild(video);
  document.body.appendChild(overlay);

  const cleanup = () => {
    video.pause();
    video.src = "";
    overlay.remove();
  };

  video.addEventListener("ended", () => {
    cleanup();
    onEnd();
  });

  video.addEventListener("error", () => {
    cleanup();
    onEnd();
  });

  video.play().catch(() => {
    video.controls = true;
  });
}

function startSecretBossBattle() {
  if (!character) return;

  const boss = {
    id: "boss_t8_secret",
    nome: "Lorde T8",
    tier: "T8",
    nivel: 30,
    hp: 1800,
    maxHp: 1800,
    atk: 95,
    xp: 750,
    goldMin: 450,
    goldMax: 650,
    lootTiers: ["T8"],
    bioma: "castelo",
    habilidades: [
      { name: "Garras Sombras", damage: 120 },
      { name: "Lâmina Abissal", damage: 160 }
    ]
  };

  sessionStorage.setItem("eldrakar:battle", JSON.stringify({
    player: character,
    monster: boss,
    returnTo: "./world.html",
    deadCutscene: "./assets/cat/introcidade.mp4",
    deadReturnTo: "./city.html"
  }));

  savePrologueState();

  window.location.href = "./battle.html";
}

function triggerSecretTurnEvent() {
  if (secretBossEventTriggered) return;
  secretBossEventTriggered = true;

  if (storyText) {
    storyText.innerHTML = `<div class="thinking-text">O ar estremece. Um portal sombrio se abre...</div>`;
  }

  const narrativeText = `Após 300 turnos de jornada árdua pela terra de Eldrakar...\n\nO DRAGÃO CALAMIDADE EMERGE DO ABISMO.\n\nSuas asas rasgam o céu.\nSeu rugido ecoa pelo mundo inteiro.\n\nA batida final se aproxima.`;

  createNarrativeBlackScreen(narrativeText, 5000, () => {
    createCutsceneOverlay("./assets/cat/intro video.mp4", () => {
      startSecretBossBattle();
    });
  });
}

window.addEventListener("eldrakar:world-turn-advanced", event => {
  const turn = Number(event?.detail?.turn || 0);
  if (turn >= 300) {
    triggerSecretTurnEvent();
  }
});

function mudarFundoPorNarrativa(texto) {
  const bg = document.getElementById("sceneBackground");
  if (!bg) return;

  const t = String(texto || "").toUpperCase();

  let img = "";
  let matched = false;

  if (t.includes("ACAMPAMENTO") || t.includes("FOGUEIRA")) {
    img = sceneImages.acampamento;
    matched = true;
  } else if (t.includes("FLORESTA") || t.includes("ÁRVORE") || t.includes("ARVORE")) {
    img = sceneImages.floresta;
    matched = true;
  } else if (t.includes("CHUVA")) {
    img = sceneImages.chuva;
    matched = true;
  } else if (t.includes("MONSTRO") || t.includes("CRIATURA") || t.includes("ATACA")) {
    img = sceneImages.combate;
    matched = true;
  } else if (t.includes("ESCURO") || t.includes("ESCURIDÃO")) {
    img = sceneImages.escuro;
    matched = true;
  }

  if (!matched) {
    const current = bg.style.backgroundImage || getComputedStyle(bg).backgroundImage;
    if (current && current !== "none") {
      return;
    }
    img = sceneImages.pantano;
  }

  bg.classList.add("scene-change");

  setTimeout(() => {
    bg.style.backgroundImage = `url("${img}")`;
    bg.classList.remove("scene-change");
  }, 300);
}

function detectEffects(text) {
  if (!cinematicEffectsEnabled()) {
    cinematicFX?.destroy();
    cinematicFX = null;
    return;
  }

  const upper = String(text || "").toUpperCase();

  if (cinematicFX) {
    cinematicFX.destroy();
    cinematicFX = null;
  }

  cinematicFX = new CinematicParticles();

  if (upper.includes("CHUVA")) {
    cinematicFX.rain(380);
    return;
  }

  if (upper.includes("NÉVOA") || upper.includes("NEVOA")) {
    cinematicFX.fog(40);
    return;
  }

  if (upper.includes("ESCURO") || upper.includes("ESCURIDÃO")) {
    cinematicFX.fog(25);
    return;
  }

  cinematicFX.destroy();
  cinematicFX = null;
}

function updateActionButtons() {
  const estado = GameBrain.estadoAtual;
  const monstro = getCurrentMonster();

  if (estado === "MORTO") {
    GlobalUI.setActionButtons([
      {
        action: "reviver",
        icon: "🔥",
        label: "Reviver"
      }
    ]);
    return;
  }

  if (estado === "DESCANSANDO") {
    GlobalUI.setActionButtons([
      {
        action: "levantar",
        icon: "🧍",
        label: "Levantar"
      }
    ]);
    return;
  }

  if (monstro) {
    irParaBatalha(monstro);
    return;
  }

  GlobalUI.setActionButtons([
    {
      action: "andar",
      icon: "🚶",
      label: "Andar"
    },
    {
      action: "explorar",
      icon: "🔎",
      label: "Explorar"
    },
    {
      action: "acampar",
      icon: "⛺",
      label: "Acampar"
    }
  ]);
}

async function processGameAction(actionData) {
  if (!GameBrain?.processarAcaoMecanica) {
    console.warn("GameBrain não encontrado.");
    return;
  }

  showThinking();

  await GameBrain.processarAcaoMecanica(actionData);

  character = GlobalUI.getCharacter();

  const monstroAtual = getCurrentMonster();

  if (monstroAtual) {
    syncMonsterUI();
    await GlobalUI.saveCharacter();
    irParaBatalha(monstroAtual);
    return;
  }

  syncMonsterUI();
  updateActionButtons();
}

window.addEventListener("eldrakar:global-action", async event => {
  const detail = event.detail || {};
  const { action } = detail;

  try {
    if (action === "andar") {
      if (GlobalUI && typeof GlobalUI.incrementWorldTurn === "function") {
        GlobalUI.incrementWorldTurn();
      }
      await processGameAction({ type: "andar" });
      return;
    }

    if (action === "explorar") {
      if (GlobalUI && typeof GlobalUI.incrementWorldTurn === "function") {
        GlobalUI.incrementWorldTurn();
      }
      await processGameAction({ type: "explorar" });
      return;
    }

    if (action === "acampar") {
      if (GlobalUI && typeof GlobalUI.incrementWorldTurn === "function") {
        GlobalUI.incrementWorldTurn();
      }
      await processGameAction({ type: "acampar" });
      return;
    }

    if (["atacar", "esquivar", "fugir", "quick-hp", "quick-mana"].includes(action)) {
      console.warn(`Ação '${action}' pertence ao battle.html, não ao prologue.js.`);
      return;
    }

    if (action === "levantar") {
      await processGameAction({ type: "levantar" });
      return;
    }

    if (action === "reviver") {
      enviandoParaBatalha = false;
      await processGameAction({ type: "reviver" });
      return;
    }
  } catch (error) {
    console.error(error);
    await typeText("⚠️ Algo falhou.");
  }
});

async function sendAction() {
  if (!playerInput || !sendBtn) return;

  const query = playerInput.value.trim();

  if (!query || isTyping) return;

  playerInput.value = "";
  sendBtn.disabled = true;
  playerInput.disabled = true;

  await typeText("Pensando...");

  const prompt = `
Você é o Mestre do RPG Eldrakar.

Local:
${prologueState.location}

Cena:
${prologueState.scene}

Pergunta:
"${query}"

Responda sem alterar estado mecânico.
Não inicie batalha por texto.
Não calcule dano.
Não use itens.
Não mate o jogador.
Apenas narre a cena.
`;

  try {
    const response = await askAI(prompt);

    mudarFundoPorNarrativa(response);
    detectEffects(response);
    falarNarrativaIA(response);

    await typeText(response);
  } catch (error) {
    console.error(error);
    await typeText("⚠️ Erro na IA.");
  }

  sendBtn.disabled = false;
  playerInput.disabled = false;
  playerInput.focus();
}

sendBtn?.addEventListener("click", sendAction);

playerInput?.addEventListener("keydown", e => {
  if (e.key === "Enter") {
    sendAction();
  }
});

async function startGame() {
  character = await GlobalUI.init();

  const restoredState = loadPrologueState();
  if (restoredState?.character) {
    character = GlobalUI.getCharacter();
  }

  const battleResultRaw = sessionStorage.getItem("eldrakar:battle-result");

  if (battleResultRaw) {
    try {
      const battleResult = JSON.parse(battleResultRaw);

      if (battleResult?.character) {
        character = battleResult.character;
        GlobalUI.setCharacter(character);
        await GlobalUI.saveCharacter();
        savePrologueState();
      }
    } catch (error) {
      console.warn("Não foi possível ler resultado da batalha:", error);
    }

    sessionStorage.removeItem("eldrakar:battle-result");
  }

  if (!character) return;

  await typeText(prologueState.scene);

  mudarFundoPorNarrativa(prologueState.scene);
  detectEffects(prologueState.scene);

  savePrologueState();

  GameBrain.init(character, {
    onNarrativaGerada: async texto => {
      const monstroAtual = getCurrentMonster();

      mudarFundoPorNarrativa(texto);
      detectEffects(texto);

      if (monstroAtual) {
        syncMonsterUI();
        await GlobalUI.saveCharacter();
        irParaBatalha(monstroAtual);
        return;
      }

      falarNarrativaIA(texto);
      await typeText(texto);

      syncMonsterUI();
      updateActionButtons();
    },

    onStatusUpdate: async charAtualizado => {
      character = charAtualizado;

      GlobalUI.setCharacter(character);

      const monstroAtual = getCurrentMonster();

      if (monstroAtual) {
        syncMonsterUI();
        await GlobalUI.saveCharacter();
        savePrologueState();
        irParaBatalha(monstroAtual);
        return;
      }

      syncMonsterUI();
      updateActionButtons();

      await GlobalUI.saveCharacter();
      savePrologueState();
    }
  });

  if (restoredState?.gameBrain) {
    GameBrain.estadoAtual = restoredState.gameBrain.estadoAtual || GameBrain.estadoAtual;
    GameBrain.turnoAtual = restoredState.gameBrain.turnoAtual || GameBrain.turnoAtual;
    GameBrain.location = restoredState.gameBrain.location || GameBrain.location;
    GameBrain.scene = restoredState.gameBrain.scene || GameBrain.scene;
    GameBrain.encontroAtivo = restoredState.gameBrain.encontroAtivo || GameBrain.encontroAtivo;
    GameBrain.ultimoVisualCombate = restoredState.gameBrain.ultimoVisualCombate || GameBrain.ultimoVisualCombate;
  }

  GlobalUI.setCharacter(character);

  syncMonsterUI();
  updateActionButtons();
}

window.addEventListener("beforeunload", savePrologueState);
startGame();