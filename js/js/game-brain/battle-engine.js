import { auth, db, doc, setDoc } from "../firebase.js";

import GlobalUI from "../global-ui.js";
import { processCombatAction } from "./combat-engine.js";
import { useConsumable } from "./inventory-engine.js";
import { getMonsterAvatar } from "./monster-avatar.js";
import { normalizeHpMana, getMaxHp, getMaxMana } from "./character-engine.js";

let battleData = null;
let character = null;
let encounter = null;
let monster = null;
let turn = 1;
let locked = false;
let returnTo = "./world.html";

const STORAGE_KEY = "eldrakar:battle";
const RESULT_KEY = "eldrakar:battle-result";

const $ = selector => document.querySelector(selector);
const $$ = selector => Array.from(document.querySelectorAll(selector));

const dom = {
  turn: $("#battleTurn"),
  visual: $("#battleVisual"),
  terrainName: $("#terrainName"),
  terrainDescription: $("#terrainDescription"),
  playerAvatar: $("#playerAvatar"),
  monsterAvatar: $("#monsterAvatar"),
  monsterName: $("#monsterName")
};

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

// Atualiza UI quando efeitos mudarem no engine de combate
if (typeof window !== 'undefined') {
  window.addEventListener('eldrakar:effects-updated', () => {
    try { refreshUI(); } catch (e) {}
  });
}

if (typeof window !== 'undefined') {
  window.addEventListener('eldrakar:effect-expired', (e) => {
    try {
      const detail = e?.detail || {};
      const name = detail.entityName || 'Entidade';
      const expired = Array.isArray(detail.expired) ? detail.expired : [];
      expired.forEach(eff => {
        const text = `Efeito expirou: ${eff.name || eff.id || 'efeito'} em ${name}`;
        writeLog(text);
        try {
          const popup = document.createElement('div');
          popup.className = 'battle-floating-message effect-expire-popup';
          popup.textContent = text;
          document.body.appendChild(popup);
          setTimeout(() => popup.remove(), 3200);
        } catch (err) {}
      });
    } catch (err) {}
  });
}

// Quando o monstro usar uma skill especial, mostrar popup e destacar pill correspondente
if (typeof window !== 'undefined') {
  window.addEventListener('eldrakar:monster-skill-used', (e) => {
    try {
      const detail = e?.detail || {};
      const monster = detail.monster || {};
      const skill = detail.skill || {};
      const skillName = skill.name || skill.nome || skill.id || String(skill) || 'skill';

      writeLog(`${getMonsterName(monster)} usou ${skill.icon || '✨'} ${skillName}`);

      // popup
      try {
        const popup = document.createElement('div');
        popup.className = 'battle-floating-message monster-skill-popup';
        popup.textContent = `${monster.nome || monster.name || 'Monstro'} usou ${skill.icon || '✨'} ${skillName}`;
        document.body.appendChild(popup);
        setTimeout(() => popup.remove(), 3000);
      } catch (err) {}

      // destacar pill correspondente
      try {
        const list = document.querySelectorAll('.abilities-list .ability-pill');
        if (list && list.length) {
          list.forEach(p => p.classList.remove('active'));
          for (const p of list) {
            const text = (p.textContent || '').toLowerCase();
            if (!text) continue;
            const match = [skill.id, skill.name, skill.nome, skill.icon].map(s => String(s || '').toLowerCase()).find(s => s && text.includes(s));
            if (match) {
              p.classList.add('active');
              setTimeout(() => p.classList.remove('active'), 3200);
              break;
            }
          }
        }
      } catch (err) {}
    } catch (err) {}
  });
}

function num(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function escapeHTML(text) {
  return String(text ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function getName(entity, fallback = "Criatura") {
  return entity?.characterName || entity?.nome || entity?.name || fallback;
}

function getMonsterMaxHp(monsterData) {
  return num(
    monsterData?.maxHp ??
    monsterData?.vidaMax ??
    monsterData?.vida ??
    monsterData?.hp,
    1
  );
}

function getHpPercent(current, max) {
  const total = Math.max(1, num(max, 1));
  return clamp((num(current, 0) / total) * 100, 0, 100);
}

function getCards() {
  const cards = $$(".combatant-card");
  return {
    playerCard: cards[0] || null,
    monsterCard: cards[1] || null
  };
}

function renderEffectsPanel() {
  const { playerCard, monsterCard } = getCards();

  const ensure = (card, entity) => {
    if (!card) return;
    let container = card.querySelector('.effects-list');
    if (!container) {
      container = document.createElement('div');
      container.className = 'effects-list';
      card.appendChild(container);
    }

    container.innerHTML = '';

    const effects = (entity?.buffs || []).concat(entity?.debuffs || []);

    effects.forEach(e => {
      const el = document.createElement('span');
      el.className = 'effect-badge ' + (e.type && e.type.includes('buff') ? 'buff' : 'debuff');
      el.textContent = `${e.name || e.id || 'efeito'} (${e.turns ?? e.duration ?? ''})`;
      const turns = Number(e.turns ?? e.duration ?? 0);
      if (turns === 1) {
        el.classList.add('near-expire');
        el.addEventListener('animationend', () => el.classList.remove('near-expire'));
      }
      container.appendChild(el);
    });
  };

  ensure(playerCard, character);
  ensure(monsterCard, monster);
}

function renderMonsterStats() {
  const { monsterCard } = getCards();
  if (!monsterCard || !monster) return;

  let panel = monsterCard.querySelector('.monster-stats');
  if (!panel) {
    panel = document.createElement('div');
    panel.className = 'monster-stats';
    monsterCard.appendChild(panel);
  }

  const level = monster.nivel || monster.level || 1;
  const tier = monster.tier || 'T1';
  const atk = monster.attack || monster.ataque || monster.atk || Math.floor(level * 2);
  const def = monster.defense || monster.def || monster.defesa || Math.floor(level * 1.2);
  const hp = num(monster.hp || monster.maxHp || monster.vida || monster.vidaMax || 0);
  const maxHp = num(monster.maxHp || monster.vidaMax || monster.hp || 0);

  panel.innerHTML = '';

  const rows = document.createElement('div');
  rows.className = 'stat-row';

  const left = document.createElement('div');
  left.innerHTML = `Nível: <strong>${level}</strong>`;

  const right = document.createElement('div');
  const rawTier = tier || '';
  const normalizedTier = String(rawTier).toLowerCase().replace(/[^a-z0-9]+/g, '-');
  const pill = document.createElement('span');
  pill.className = 'tier-pill ' + (normalizedTier ? 'tier-' + normalizedTier : 'no-tier');
  pill.innerHTML = `${normalizedTier ? '🏷️' : '❔'} <strong>${rawTier || '—'}</strong>`;
  right.appendChild(pill);

  rows.appendChild(left);
  rows.appendChild(right);
  panel.appendChild(rows);

  const rows2 = document.createElement('div');
  rows2.className = 'stat-row';
  rows2.innerHTML = `<div>Ataque: <strong>${atk}</strong></div><div>Defesa: <strong>${def}</strong></div>`;
  panel.appendChild(rows2);

  const hpRow = document.createElement('div');
  hpRow.className = 'stat-row';
  hpRow.innerHTML = `<div>HP: <strong>${hp}/${maxHp}</strong></div><div></div>`;
  panel.appendChild(hpRow);

  // abilities
  const abilitiesBox = document.createElement('div');
  abilitiesBox.innerHTML = `<div style="font-weight:700;margin-top:6px;">Habilidades:</div>`;
  const list = document.createElement('div');
  list.className = 'abilities-list';

  const skills = monster.skills || monster.skillBook?.learned || monster.habilidades || monster.abilities || [];

  (Array.isArray(skills) ? skills : [skills]).forEach(s => {
    let label = s;
    let desc = '';
    // try to resolve skill object
    try {
      const skillObj = getSkillById(s) || s;
      if (skillObj) {
        label = skillObj.name || skillObj.nome || skillObj.id || String(s);
        desc = skillObj.type || skillObj.tipo || '';
      }
    } catch (e) {}

    const pill = document.createElement('div');
    pill.className = 'ability-pill';
    pill.title = desc || '';
    pill.textContent = label;
    list.appendChild(pill);
  });

  abilitiesBox.appendChild(list);
  panel.appendChild(abilitiesBox);
}

function getHpParts(card) {
  if (!card) return {};

  return {
    title: card.querySelector(".combatant-title"),
    hpText: card.querySelector(".hp-text"),
    hpFill: card.querySelector(".rpg-hp-bar > div")
  };
}

function ensureBattleControls() {
  if ($("#battleActions")) return;

  const board = $(".rpg-battle-board") || $(".battle-stage") || document.body;

  const controls = document.createElement("div");
  controls.id = "battleActions";
  controls.className = "battle-actions";
  controls.innerHTML = `
    <button data-battle-action="atacar">⚔️ Atacar</button>
    <button data-battle-action="esquivar">🛡️ Esquivar</button>
    <button data-battle-action="fugir">🏃 Fugir</button>
    <button data-battle-action="hp">❤️ HP</button>
    <button data-battle-action="mana">🔮 Mana</button>
  `;

  const log = document.createElement("div");
  log.id = "battleLog";
  log.className = "battle-log";

  board.appendChild(controls);
  board.appendChild(log);
  // Painel de debug para verificar buffs/debuffs — ativado via ?effects-debug
  try {
    if (typeof location !== 'undefined' && String(location.search || '').includes('effects-debug')) {
      const dbg = document.createElement('div');
      dbg.className = 'battle-debug-panel';

      const btnBuff = document.createElement('button');
      btnBuff.type = 'button';
      btnBuff.textContent = 'Simular Buff jogador';
      btnBuff.addEventListener('click', () => {
        character.buffs = character.buffs || [];
        character.buffs.push({ id: 'dbg_buff_def', name: 'Buff Defesa', type: 'defense_buff', turns: 3, defenseBonus: 8 });
        writeLog('DEBUG: aplicado Buff Defesa ao jogador.');
        refreshUI();
      });

      const btnDebuff = document.createElement('button');
      btnDebuff.type = 'button';
      btnDebuff.textContent = 'Simular Debuff monstro';
      btnDebuff.addEventListener('click', () => {
        monster.buffs = monster.buffs || [];
        monster.buffs.push({ id: 'dbg_debuff_atk', name: 'Debuff Ataque', type: 'attack_debuff', turns: 3, attackPenalty: -6 });
        writeLog('DEBUG: aplicado Debuff Ataque ao monstro.');
        refreshUI();
      });

      const btnClear = document.createElement('button');
      btnClear.type = 'button';
      btnClear.textContent = 'Limpar efeitos';
      btnClear.addEventListener('click', () => {
        character.buffs = [];
        monster.buffs = [];
        writeLog('DEBUG: efeitos limpos.');
        refreshUI();
      });

      dbg.appendChild(btnBuff);
      dbg.appendChild(btnDebuff);
      dbg.appendChild(btnClear);

      board.appendChild(dbg);
    }
  } catch (e) {}

  controls.addEventListener("click", async event => {
    const button = event.target.closest("button[data-battle-action]");
    if (!button) return;

    const action = button.dataset.battleAction;

    if (action === "hp") {
      await useQuickItem("hp");
      return;
    }

    if (action === "mana") {
      await useQuickItem("mana");
      return;
    }

    await doCombatAction(action);
  });

  
}

function setButtonsEnabled(enabled) {
  $$("#battleActions button").forEach(button => {
    button.disabled = !enabled;
  });
}

function writeLog(text) {
  const log = $("#battleLog");
  if (!log) return;

  log.innerHTML = escapeHTML(text || "").replaceAll("\n", "<br>");
  log.scrollTop = log.scrollHeight;
}

function writeCenterMessage(text) {
  const center = $(".battle-turn-message");
  if (center) center.textContent = text || "";
}

function writeDiceResult(visual) {
  const diceBox = $(".dice-results");
  if (!diceBox || !visual) return;

  const playerDice = visual.dice ?? "-";
  const monsterDice = visual.counter?.dice ?? "-";

  diceBox.innerHTML = `
    <span>Jogador: <strong>${escapeHTML(playerDice)}</strong></span>
    <span>Monstro: <strong>${escapeHTML(monsterDice)}</strong></span>
  `;
}

function refreshUI() {
  if (!character || !monster) return;

  normalizeHpMana(character);

  const { playerCard, monsterCard } = getCards();
  const playerParts = getHpParts(playerCard);
  const monsterParts = getHpParts(monsterCard);

  const playerName = getName(character, "Herói");
  const playerHp = num(character.hp, 0);
  const playerMaxHp = getMaxHp(character);

  const monsterName = getName(monster, "Monstro");
  const monsterHp = num(monster.hp, 0);
  const monsterMaxHp = getMonsterMaxHp(monster);

  if (playerParts.title) playerParts.title.textContent = `🧙 ${playerName}`;
  if (playerParts.hpText) playerParts.hpText.textContent = `HP ${playerHp} / ${playerMaxHp}`;
  if (playerParts.hpFill) playerParts.hpFill.style.width = `${getHpPercent(playerHp, playerMaxHp)}%`;

  if (dom.monsterName) dom.monsterName.textContent = monsterName;
  else if (monsterParts.title) monsterParts.title.textContent = monsterName;

  if (monsterParts.hpText) monsterParts.hpText.textContent = `HP ${monsterHp} / ${monsterMaxHp}`;
  if (monsterParts.hpFill) monsterParts.hpFill.style.width = `${getHpPercent(monsterHp, monsterMaxHp)}%`;

  if (dom.turn) dom.turn.textContent = String(turn);

  if (dom.visual) {
    dom.visual.textContent = monster?.visual || monster?.sprite || monster?.id || "combate";
  }

  if (dom.terrainName) {
    dom.terrainName.textContent = battleData?.terrain?.name || battleData?.terrainName || "Campo de batalha";
  }

  if (dom.terrainDescription) {
    dom.terrainDescription.textContent = battleData?.terrain?.description || battleData?.terrainDescription || "O combate começou.";
  }

if (dom.playerAvatar) {
  const avatar = character.avatar;

  if (avatar) {
    dom.playerAvatar.src = avatar;
  } else {
    dom.playerAvatar.src = "./assets/monster/cavaleiro_r1_c1.png";
  }

  dom.playerAvatar.onerror = () => {
    dom.playerAvatar.onerror = null;
    dom.playerAvatar.src = "./assets/monster/cavaleiro_r1_c1.png";
  };
}

if (dom.monsterAvatar) {
  dom.monsterAvatar.src = getMonsterAvatar(monster) || getMonsterSprite(monster);
  dom.monsterAvatar.onerror = () => {
    dom.monsterAvatar.onerror = null;
    dom.monsterAvatar.src = "./assets/monster/demon_r3_c3.png";
  };
}

  try { renderEffectsPanel(); } catch (e) {}
  try { renderMonsterStats(); } catch (e) {}
}

function getMonsterSprite(monsterData = {}) {
  const raw = String(monsterData.sprite || monsterData.visual || monsterData.id || "").toLowerCase();
  if (raw && raw.endsWith(".png")) return raw;

  const name = String(monsterData.nome || monsterData.name || "demon").toLowerCase();

  if (name.includes("goblin")) return "./assets/monster/goblin_r1_c1.png";
  if (name.includes("aranha")) return "./assets/monster/aranha_r1_c1.png";
  if (name.includes("dragon") || name.includes("drag")) return "./assets/monster/dragon_r1_c1.png";
  if (name.includes("esqueleto")) return "./assets/monster/esqueleto_r1_c1.png";
  if (name.includes("fantasma")) return "./assets/monster/fantasma_r1_c1.png";

  return "./assets/monster/demon_r3_c3.png";
}

function getCurrentMonster() {
  if (!encounter?.monsters?.length) return monster;
  return encounter.monsters.find(m => num(m.hp, 0) > 0) || monster;
}

async function saveCharacterSafe() {
  try {
    normalizeHpMana(character);

    const uid = character?.uid || auth.currentUser?.uid;

    if (uid) {
      character.uid = uid;
      const ref = doc(db, "players", uid, "characters", "main");
      await setDoc(ref, character, { merge: true });
    }
  } catch (error) {
    console.warn("Não foi possível salvar no Firebase agora. O resultado ficará no sessionStorage.", error);
  }

  sessionStorage.setItem(RESULT_KEY, JSON.stringify({
    character,
    encounter,
    monster,
    finished: !encounter || num(monster?.hp, 0) <= 0,
    time: Date.now()
  }));
}

async function doCombatAction(action) {
  if (locked || !character || !encounter) return;

  locked = true;
  setButtonsEnabled(false);

  try {
    const result = processCombatAction({
      action,
      character,
      encounter
    });

    character = result.character;
    encounter = result.encounter;
    monster = getCurrentMonster();

    writeLog(result.report);
    writeDiceResult(result.visual);
    refreshUI();

    if (result.nextState !== "COMBATE" || !encounter || !monster || num(character.hp, 0) <= 0) {
      await endBattle(result.report);
      return;
    }

    turn += 1;
    writeCenterMessage("SUA VEZ");
    await saveCharacterSafe();
  } catch (error) {
    console.error(error);
    writeLog("⚠️ Erro ao processar ação de combate. Veja o console.");
  }

  locked = false;
  setButtonsEnabled(true);
  refreshUI();
}

function findQuickItem(kind) {
  const quickId = character?.quickItems?.[kind];
  const inventory = character?.inventory || [];

  if (quickId) {
    const found = inventory.find(item => item.id === quickId);
    if (found) return found;
  }

  if (kind === "hp") {
    return inventory.find(item => num(item.cura, 0) > 0);
  }

  if (kind === "mana") {
    return inventory.find(item => num(item.mana, 0) > 0);
  }

  return null;
}

async function useQuickItem(kind) {
  if (locked || !character) return;

  const item = findQuickItem(kind);

  if (!item) {
    writeLog(kind === "hp"
      ? "Você não tem item de cura na bolsa."
      : "Você não tem item de mana na bolsa."
    );
    return;
  }

  const beforeHp = num(character.hp, 0);
  const beforeMana = num(character.mana, 0);

  const result = useConsumable(character, item.id);

  if (!result.ok) {
    writeLog(result.message || "Não foi possível usar o item.");
    return;
  }

  const healed = num(character.hp, 0) - beforeHp;
  const restoredMana = num(character.mana, 0) - beforeMana;

  writeLog(`Você usou ${item.nome || item.name || item.id}.
HP recuperado: ${healed}
Mana recuperada: ${restoredMana}`);

  await saveCharacterSafe();
  refreshUI();
}

async function endBattle(lastReport = "") {
  locked = true;
  setButtonsEnabled(false);

  await saveCharacterSafe();

  const dead = num(character?.hp, 0) <= 0;
  const won = !encounter || num(monster?.hp, 0) <= 0;

  if (dead) {
    writeCenterMessage("VOCÊ CAIU");
  } else if (won) {
    writeCenterMessage("VITÓRIA");
  } else {
    writeCenterMessage("FIM DO COMBATE");
  }

  if (lastReport) writeLog(lastReport);

  
}

async function finishBattleAndReturn() {
  document.body.classList.remove("battle-mode");
  await saveCharacterSafe();
  sessionStorage.removeItem(STORAGE_KEY);
  window.location.href = returnTo;
}

function loadBattleData() {
  const raw = sessionStorage.getItem(STORAGE_KEY);

  if (!raw) {
    writeCenterMessage("SEM BATALHA");
    writeLog("Nenhuma batalha foi enviada para battle.html.");
    
    return false;
  }

  battleData = JSON.parse(raw);

  character = battleData.player || battleData.character;
  monster = battleData.monster;
  encounter = battleData.encounter || {
    monsters: [monster]
  };
  returnTo = battleData.returnTo || "./world.html";

  if (!encounter.monsters?.length && monster) {
    encounter.monsters = [monster];
  }

  monster = getCurrentMonster();

  if (!character || !monster) {
    writeCenterMessage("DADOS INVÁLIDOS");
    writeLog("A batalha chegou sem jogador ou sem monstro.");
    return false;
  }

  normalizeHpMana(character);
  return true;
}

async function startBattle() {
  document.body.classList.add("battle-mode");

  ensureBattleControls();

  const ok = loadBattleData();

  if (!ok) {
    setButtonsEnabled(false);
    return;
  }

  try {
    await GlobalUI.init();

    if (character) {
      GlobalUI.setCharacter(character);
    }
  } catch (e) {
    console.warn("GlobalUI não carregou:", e);
  }

  refreshUI();
  writeCenterMessage("VOCÊ COMEÇA");
  writeLog(`⚔️ ${getName(monster, "Monstro")} apareceu.\nEscolha sua ação.`);
  setButtonsEnabled(true);

  await saveCharacterSafe();
}

startBattle();
