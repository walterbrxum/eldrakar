// =====================================================
// battle-scene.js
// Carrega battle.html e controla a tela de batalha.
// =====================================================

import { getMonsterAvatar, getMonsterSpritePath, getMonsterVisualInfo, isBossMonster } from "./monster-avatar.js";
import { getTerrainRule, applyTerrainTurn } from "./battle-terrain.js";

let turnoBatalha = 0;
let ultimoMonstroId = null;
let templateLoaded = false;
let lastTerrainEvent = "";

const TEMPLATE_URL = "./battle.html";

function rolarD20() {
  return Math.floor(Math.random() * 20) + 1;
}

function hpPercent(atual, maximo) {
  if (!maximo || maximo <= 0) return 0;
  return Math.max(0, Math.min(100, (atual / maximo) * 100));
}

function safeNumber(value, fallback = 1) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function getPlayerAvatar(player = {}) {
  return player.avatar || player.photoURL || "./assets/default-avatar.png";
}

function getPlayerName(player = {}) {
  return player.characterName || player.name || player.nome || "Jogador";
}

function getMonsterName(monster = {}) {
  return monster.nome || monster.name || "Monstro";
}

function getMonsterHp(monster = {}) {
  return safeNumber(monster.hp ?? monster.vida, 1);
}

function getMonsterMaxHp(monster = {}) {
  return safeNumber(monster.maxHp ?? monster.vidaMax ?? monster.hp ?? monster.vida, 1);
}

function stage() {
  const el = document.getElementById("battleStage");

  if (!el) {
    console.warn("battleStage não encontrado no HTML.");
  }

  return el;
}

function setText(selector, value) {
  const el = document.querySelector(selector);
  if (el) el.textContent = value;
}

function setHTML(selector, value) {
  const el = document.querySelector(selector);
  if (el) el.innerHTML = value;
}

function setImg(selector, src, fallback) {
  const img = document.querySelector(selector);
  if (!img) return;

  img.src = src;
  img.onerror = () => {
    img.onerror = null;
    img.src = fallback;
  };
}

function setImgWithFallbacks(selector, sources = []) {
  const img = document.querySelector(selector);
  if (!img || !sources.length) return;

  let index = 0;
  const nextSource = () => {
    if (index >= sources.length) return;
    img.src = sources[index];
    index += 1;
  };

  img.onerror = () => {
    img.onerror = null;
    nextSource();
    if (index < sources.length) {
      img.onerror = nextSource;
    }
  };

  nextSource();
}

function setBar(selector, percent) {
  const bar = document.querySelector(selector);
  if (bar) bar.style.width = `${percent}%`;
}

async function ensureTemplate() {
  const el = stage();
  if (!el) return false;

  if (templateLoaded && el.querySelector("[data-battle-board]")) {
    return true;
  }

  const response = await fetch(TEMPLATE_URL);
  const html = await response.text();

  el.innerHTML = html;
  templateLoaded = true;

  return true;
}

function clearTerrainClasses(board) {
  if (!board) return;

  [...board.classList].forEach(cls => {
    if (cls.startsWith("terrain-") || cls === "boss-battle") {
      board.classList.remove(cls);
    }
  });
}

function applyTerrainVisuals(board, terrainInfo = {}, boss = false) {
  if (!board) return;

  clearTerrainClasses(board);
  board.classList.add(terrainInfo.cssClass || "terrain-normal");
  if (boss) board.classList.add("boss-battle");

  if (terrainInfo.backgroundImage) {
    board.style.backgroundImage = `linear-gradient(rgba(0,0,0,.38), rgba(0,0,0,.42)), url(${encodeURI(terrainInfo.backgroundImage)})`;
    board.style.backgroundSize = "cover";
    board.style.backgroundPosition = "center";
    board.style.backgroundBlendMode = "overlay";
  } else {
    board.style.backgroundImage = "";
    board.style.backgroundSize = "";
    board.style.backgroundPosition = "";
    board.style.backgroundBlendMode = "";
  }
}

export const BattleScene = {
  async start({ player, monster }) {
    if (!monster) return;

    await ensureTemplate();

    const id = monster.id || monster.nome || monster.name || "monstro";

    if (id === ultimoMonstroId) {
      await this.update({
        player,
        monster,
        skipTurnAdvance: true
      });

      return;
    }

    ultimoMonstroId = id;
    turnoBatalha = 1;
    lastTerrainEvent = "";

    const jogadorRoll = rolarD20();
    const monstroRoll = rolarD20();
    const mensagem = jogadorRoll >= monstroRoll ? "VOCÊ COMEÇA" : "MONSTRO COMEÇA";

    this.render({
      player,
      monster,
      jogadorRoll,
      monstroRoll,
      mensagem,
      animarDado: true
    });

    if (isBossMonster(monster)) {
      this.showFloatingMessage("☠️ BOSS ENCONTRADO ☠️", 2200);
    }

    setTimeout(() => {
      const msg = document.querySelector("[data-battle-message]");
      if (msg) msg.classList.add("battle-msg-hide");
    }, 2000);
  },

  async update({ player, monster, mensagem = "", skipTurnAdvance = false }) {
    if (!monster) {
      this.close();
      return;
    }

    await ensureTemplate();

    if (!skipTurnAdvance) {
      turnoBatalha++;

      const events = applyTerrainTurn(player, monster);
      lastTerrainEvent = events.map(e => e.message).join("<br>");
    }

    this.render({
      player,
      monster,
      jogadorRoll: "-",
      monstroRoll: "-",
      mensagem: mensagem || `TURNO ${turnoBatalha}`,
      animarDado: false
    });
  },

  close() {
    const el = stage();
    if (!el) return;

    el.classList.add("hidden");
    el.innerHTML = "";

    turnoBatalha = 0;
    ultimoMonstroId = null;
    lastTerrainEvent = "";
    templateLoaded = false;
  },

  action(type) {
    const player = document.querySelector("[data-player-card]");
    const monster = document.querySelector("[data-monster-card]");
    const dice = document.querySelector("[data-battle-dice]");

    if (dice) {
      dice.classList.remove("rolling");
      void dice.offsetWidth;
      dice.classList.add("rolling");
    }

    if (type === "attack" && player && monster) {
      player.classList.remove("battle-player-attack");
      monster.classList.remove("battle-monster-hit");
      void player.offsetWidth;
      player.classList.add("battle-player-attack");
      monster.classList.add("battle-monster-hit");
      return;
    }

    if (type === "dodge" && player) {
      player.classList.remove("battle-dodge");
      void player.offsetWidth;
      player.classList.add("battle-dodge");
      return;
    }

    if (type === "potion" && player) {
      player.classList.remove("battle-heal");
      void player.offsetWidth;
      player.classList.add("battle-heal");
    }
  },

  showFloatingMessage(text, tempo = 1800) {
    const el = stage();
    if (!el) return;

    const old = el.querySelector(".battle-floating-message");
    if (old) old.remove();

    const div = document.createElement("div");
    div.className = "battle-floating-message";
    div.innerHTML = text;

    el.appendChild(div);

    setTimeout(() => {
      div.remove();
    }, tempo);
  },

  render({ player, monster, jogadorRoll, monstroRoll, mensagem, animarDado }) {
    const el = stage();
    if (!el) return;

    const playerHp = safeNumber(player?.hp, 1);
    const playerMaxHp = safeNumber(player?.maxHp, playerHp);

    const monsterHp = getMonsterHp(monster);
    const monsterMaxHp = getMonsterMaxHp(monster);

    const terrain = getTerrainRule(monster.bioma);
    const visual = getMonsterVisualInfo(monster);
    const boss = visual.isBoss;

    el.classList.remove("hidden");

    const board = document.querySelector("[data-battle-board]");
    clearTerrainClasses(board);

    if (board) {
      applyTerrainVisuals(board, terrain, boss);
    }

    setText("[data-terrain-icon]", terrain.icon);
    setText("[data-terrain-name]", terrain.name);
    setText("[data-terrain-description]", `${terrain.effectName} — ${terrain.description}`);

    setText("[data-battle-turn]", turnoBatalha);
    setText("[data-monster-visual]", `${visual.type}_${visual.rank}_${visual.scenario}`);

    setText("[data-player-name]", `🧝 ${getPlayerName(player)}`);
    setImg("[data-player-avatar]", getPlayerAvatar(player), "./assets/default-avatar.png");
    setText("[data-player-hp-text]", `HP ${playerHp}/${playerMaxHp}`);
    setBar("[data-player-hp-bar]", hpPercent(playerHp, playerMaxHp));

    setText("[data-player-roll]", jogadorRoll);
    setText("[data-monster-roll]", monstroRoll);

    const dice = document.querySelector("[data-battle-dice]");
    if (dice) {
      dice.className = animarDado ? "battle-dice rolling" : "battle-dice";
    }

    const msg = document.querySelector("[data-battle-message]");
    if (msg) {
      msg.classList.remove("battle-msg-hide");
      msg.textContent = mensagem;
    }

    const terrainEvent = document.querySelector("[data-terrain-event]");
    if (terrainEvent) {
      if (lastTerrainEvent) {
        terrainEvent.classList.remove("hidden");
        terrainEvent.innerHTML = lastTerrainEvent;
      } else {
        terrainEvent.classList.add("hidden");
        terrainEvent.innerHTML = "";
      }
    }

    const monsterCard = document.querySelector("[data-monster-card]");
    if (monsterCard) {
      monsterCard.classList.toggle("boss-card", boss);
    }

    setText("[data-monster-name]", `${boss ? "☠️" : "👹"} ${getMonsterName(monster)}`);

    setImgWithFallbacks("[data-monster-avatar]", [
      getMonsterAvatar(monster),
      getMonsterSpritePath({ ...visual, scenario: "c3" }),
      "./assets/default-monster.png"
    ]);

    setText("[data-monster-hp-text]", `HP ${monsterHp}/${monsterMaxHp}`);
    setBar("[data-monster-hp-bar]", hpPercent(monsterHp, monsterMaxHp));
  }
};
