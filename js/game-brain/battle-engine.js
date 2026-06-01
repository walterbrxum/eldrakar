import { auth, db, doc, setDoc } from "../firebase.js";

import GlobalUI from "../global-ui.js";
import { processCombatAction } from "./combat-engine.js";
import { useConsumable } from "./inventory-engine.js";
import { getMonsterAvatar, getMonsterVisualInfo, isBossMonster } from "./monster-avatar.js";
import { getSkillById } from "../regras/skills.js";
import {
  normalizeHpMana,
  getMaxHp,
  getMaxMana,
  getDefense,
  getSpeed
} from "./character-engine.js";
import { getTerrainRule, applyTerrainTurn } from "./battle-terrain.js";

let battleData = null;
let character = null;
let encounter = null;
let monster = null;
let turn = 1;
let locked = false;
let returnTo = "./world.html";

let terrainSound = null;
let terrainSoundPath = "";

let battlePhase = "PLAYER_ACTION";
let pendingPlayerAction = null;
let pendingMasterAttack = null;
// Toggles de comportamento do Mestre em combate:
// - Quando `false`, o mestre não terá a etapa "MESTRE DEFENDE" (pula defesa).
// - Quando `true`, a etapa de defesa ocorre normalmente.
const ENABLE_MASTER_DEFENSE = false;

// Se true, o Mestre executa seu ataque automaticamente quando chega a vez dele.
const ENABLE_MASTER_AUTO_ATTACK = true;

// Se true, após fim da batalha a página volta automaticamente ao `returnTo` após
// `AUTO_RETURN_DELAY_MS` milissegundos. Caso false, usuário precisa clicar no botão.
const ENABLE_AUTO_RETURN = true;
const AUTO_RETURN_DELAY_MS = 2500;

let _autoReturnTimeout = null;

const STORAGE_KEY = "eldrakar:battle";
const ACTIVE_BATTLE_KEY = "eldrakar:battle-active";
const RESULT_KEY = "eldrakar:battle-result";

function saveBattleState() {
  if (!character || !monster || !encounter) return;

  const payload = {
    player: character,
    monster,
    encounter,
    battleData: {
      ...battleData,
      returnTo,
      terrain: battleData?.terrain || null,
      deadCutscene: battleData?.deadCutscene || null,
      deadReturnTo: battleData?.deadReturnTo || null
    },
    turn,
    battlePhase,
    pendingPlayerAction,
    returnTo,
    savedAt: Date.now()
  };

  try {
    localStorage.setItem(ACTIVE_BATTLE_KEY, JSON.stringify(payload));
  } catch (error) {
    console.warn("Não foi possível salvar estado de batalha local:", error);
  }

  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
  } catch (error) {}
}

const $ = selector => document.querySelector(selector);
const $$ = selector => Array.from(document.querySelectorAll(selector));

const dom = {
  turn: $("#battleTurn"),
  visual: $("#battleVisual"),
  terrainName: $("#terrainName"),
  terrainDescription: $("#terrainDescription"),
  terrainTurnSubtitle: $("#terrainTurnSubtitle"),
  playerAvatar: $("#playerAvatar"),
  monsterAvatar: $("#monsterAvatar"),
  monsterName: $("#monsterName")
};

function rollD20() {
  return Math.floor(Math.random() * 20) + 1;
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
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

function setText(selector, value) {
  const element = document.querySelector(selector);
  if (!element) return;
  element.textContent = value;
}

function getName(entity, fallback = "Criatura") {
  return entity?.characterName || entity?.nome || entity?.name || fallback;
}

function getMonsterLevel(monsterData = {}) {
  return num(monsterData.nivel ?? monsterData.level, 1);
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

function getTerrainBannerText(terrainInfo = {}, currentTurn = 1) {
  const summary = [`${terrainInfo.effectName} — ${terrainInfo.description}`];
  const dynamicParts = [];

  if (terrainInfo.playerDamagePercent) {
    dynamicParts.push(`Perde ${terrainInfo.playerDamagePercent}% da vida máxima por turno.`);
  }

  if (terrainInfo.poisonChance) {
    dynamicParts.push(`${terrainInfo.poisonChance}% de chance de envenenamento por turno.`);
  }

  if (typeof terrainInfo.playerSpeedBonus === "number") {
    dynamicParts.push(`Velocidade ${terrainInfo.playerSpeedBonus < 0 ? "reduzida" : "aumentada"} em ${Math.abs(terrainInfo.playerSpeedBonus)}.`);
  }

  if (typeof terrainInfo.playerDodgeBonus === "number") {
    dynamicParts.push(`Esquiva ${terrainInfo.playerDodgeBonus >= 0 ? "+" : ""}${terrainInfo.playerDodgeBonus}.`);
  }

  if (typeof terrainInfo.playerDefenseBonus === "number") {
    dynamicParts.push(`Defesa ${terrainInfo.playerDefenseBonus >= 0 ? "+" : ""}${terrainInfo.playerDefenseBonus}.`);
  }

  if (typeof terrainInfo.playerHitBonus === "number") {
    dynamicParts.push(`Precisão ${terrainInfo.playerHitBonus >= 0 ? "+" : ""}${terrainInfo.playerHitBonus}.`);
  }

  if (typeof terrainInfo.monsterAttackBonus === "number") {
    dynamicParts.push(`Monstros recebem +${terrainInfo.monsterAttackBonus} de ataque.`);
  }

  if (typeof terrainInfo.monsterDefenseBonus === "number") {
    dynamicParts.push(`Monstros recebem +${terrainInfo.monsterDefenseBonus} de defesa.`);
  }

  if (dynamicParts.length) {
    summary.push(dynamicParts.join(" "));
  }

  return summary.join(" ");
}

function getTerrainSubtitleText(terrainInfo = {}, currentTurn = 1) {
  const phrases = [];

  if (terrainInfo.playerDamagePercent) {
    phrases.push(`${terrainInfo.effectName} causa ${terrainInfo.playerDamagePercent}% de dano por turno.`);
  }

  if (terrainInfo.poisonChance) {
    phrases.push(`Há ${terrainInfo.poisonChance}% de chance de envenenamento.`);
  }

  if (typeof terrainInfo.playerSpeedBonus === "number") {
    phrases.push(`Velocidade ${terrainInfo.playerSpeedBonus < 0 ? "reduzida" : "aumentada"} em ${Math.abs(terrainInfo.playerSpeedBonus)}.`);
  }

  if (typeof terrainInfo.playerDodgeBonus === "number") {
    phrases.push(`Esquiva ${terrainInfo.playerDodgeBonus >= 0 ? "aumentada" : "reduzida"} ${Math.abs(terrainInfo.playerDodgeBonus)}.`);
  }

  if (typeof terrainInfo.playerDefenseBonus === "number") {
    phrases.push(`Defesa ${terrainInfo.playerDefenseBonus >= 0 ? "aumentada" : "reduzida"} ${Math.abs(terrainInfo.playerDefenseBonus)}.`);
  }

  if (typeof terrainInfo.playerHitBonus === "number") {
    phrases.push(`Precisão ${terrainInfo.playerHitBonus >= 0 ? "aumentada" : "reduzida"} ${Math.abs(terrainInfo.playerHitBonus)}.`);
  }

  if (!phrases.length) {
    return `Turno ${currentTurn}: terreno estável.`;
  }

  return `Turno ${currentTurn}: ${phrases.join(" ")}`;
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
      // animação quando estiver prestes a expirar
      const turns = Number(e.turns ?? e.duration ?? 0);
      if (turns === 1) {
        el.classList.add('near-expire');
        // remover a classe após animação para permitir re-disparo
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
        // exibir alerta flutuante
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

  controls.addEventListener("click", handleBattleButtonClick);
}

async function handleBattleButtonClick(event) {
  const button = event.target.closest("button[data-battle-action]");
  if (!button || locked) return;

  const action = button.dataset.battleAction;

  if (action === "hp") {
    await useQuickItem("hp");
    return;
  }

  if (action === "mana") {
    await useQuickItem("mana");
    return;
  }

  if (action === "skills") {
    openBattleSkillMenu();
    return;
  }

  if (action === "skill") {
    const skillId = button.dataset.skillId;
    const skill = getSkillById(skillId);

    if (!skill) {
      writeLog("Skill inválida.");
      return;
    }

    await preparePlayerAction("skill", skill);
    return;
  }

  if (action === "atacar") {
    await preparePlayerAction("atacar");
    return;
  }

  if (action === "fugir") {
    await doSimpleCombatAction("fugir");
    return;
  }

  if (action === "master-dodge") {
    await resolvePlayerActionWithMasterDefense("esquivar");
    return;
  }

  if (action === "master-defend") {
    await resolvePlayerActionWithMasterDefense("defender");
    return;
  }

  if (action === "master-attack") {
    await prepareMasterAttack();
    return;
  }

  if (action === "player-dodge") {
    await resolveMasterAttackWithPlayerDefense("esquivar");
    return;
  }

  if (action === "player-defend") {
    await resolveMasterAttackWithPlayerDefense("defender");
    return;
  }
}

function setButtonsEnabled(enabled) {
  $$("#battleActions button").forEach(button => {
    button.disabled = !enabled;
  });
}

function getEquippedBattleSkills() {
  const equipped = Array.isArray(character?.skillBook?.equipped)
    ? character.skillBook.equipped.map(item => item?.id || item)
    : [];

  return equipped
    .map(id => getSkillById(id))
    .filter(Boolean);
}

function getBattleSkills() {
  const equipped = Array.isArray(character?.skillBook?.equipped)
    ? character.skillBook.equipped.map(item => item?.id || item)
    : [];

  const learned = Array.isArray(character?.skillBook?.learned)
    ? character.skillBook.learned.map(item => item?.id || item)
    : [];

  const uniqueIds = [...new Set([...equipped, ...learned])];

  const skills = uniqueIds
    .map(id => getSkillById(id))
    .filter(Boolean);

  skills.sort((a, b) => {
    const aEquipped = equipped.includes(a.id);
    const bEquipped = equipped.includes(b.id);
    if (aEquipped && !bEquipped) return -1;
    if (!aEquipped && bEquipped) return 1;
    return (a.name || "").localeCompare(b.name || "");
  });

  return skills;
}

function renderBattleActions() {
  const controls = $("#battleActions");
  if (!controls) return;

  if (battlePhase === "PLAYER_ACTION") {
    const equippedSkills = getEquippedBattleSkills();

    controls.innerHTML = `
      <button data-battle-action="atacar">⚔️ Atacar</button>
      ${equippedSkills.map(skill => `
        <button data-battle-action="skill" data-skill-id="${escapeHTML(skill.id)}">
          ${escapeHTML(skill.icon || "✨")} ${escapeHTML(skill.name || skill.id)}
        </button>
      `).join("")}
      <button data-battle-action="skills">🧠 Habilidades</button>
      <button data-battle-action="fugir">🏃 Fugir</button>
      <button data-battle-action="hp">❤️ HP</button>
      <button data-battle-action="mana">🔮 Mana</button>
    `;
    return;
  }

  if (battlePhase === "MASTER_DEFENSE") {
    controls.innerHTML = `
      <button data-battle-action="master-dodge">👹 Mestre esquiva</button>
      <button data-battle-action="master-defend">🛡️ Mestre defende</button>
    `;
    return;
  }

  if (battlePhase === "MASTER_ACTION") {
    controls.innerHTML = `
      <button data-battle-action="master-attack">👹 Mestre atacar</button>
    `;
    return;
  }

  if (battlePhase === "PLAYER_DEFENSE") {
    controls.innerHTML = `
      <button data-battle-action="player-dodge">🌀 Jogador esquiva</button>
      <button data-battle-action="player-defend">🛡️ Jogador defende</button>
      <button data-battle-action="hp">❤️ HP</button>
      <button data-battle-action="mana">🔮 Mana</button>
    `;
    return;
  }

  controls.innerHTML = "";
}

function closeBattleSkillMenu() {
  const existing = document.getElementById("battleSkillMenu");
  if (existing) existing.remove();
}

function openBattleSkillMenu() {
  closeBattleSkillMenu();

  const skills = getBattleSkills();
  const menu = document.createElement("div");
  menu.id = "battleSkillMenu";
  menu.className = "battle-skill-menu";

  menu.innerHTML = `
    <div class="battle-skill-header">
      <strong>⚔️ Escolha a habilidade</strong>
      <button type="button" class="battle-skill-close">✕</button>
    </div>
    <div class="battle-skill-list">
      ${skills.length ? skills.map(skill => `
        <button type="button" data-skill-id="${escapeHTML(skill.id)}">
          ${escapeHTML(skill.icon || "✨")} ${escapeHTML(skill.name || skill.id)}
        </button>
      `).join("") : `
        <div class="battle-skill-empty">Nenhuma skill equipada ou aprendida.</div>
      `}
    </div>
  `;

  document.body.appendChild(menu);

  menu.querySelector(".battle-skill-close")?.addEventListener("click", closeBattleSkillMenu);

  menu.querySelectorAll("[data-skill-id]").forEach(button => {
    button.addEventListener("click", async () => {
      const skillId = button.dataset.skillId;
      const skill = getSkillById(skillId);

      if (!skill) {
        writeLog("Skill inválida.");
        closeBattleSkillMenu();
        return;
      }

      closeBattleSkillMenu();
      await preparePlayerAction("skill", skill);
    });
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
  if (!diceBox) return;

  if (!visual) {
    diceBox.innerHTML = `
      <span>🎲 Aguardando ação...</span>
    `;
    return;
  }

  diceBox.innerHTML = `
    <span>🎲 Dado: <strong>${escapeHTML(visual.dice ?? "-")}</strong></span>
    <span>⚔️ Dano: <strong>${escapeHTML(visual.damage ?? 0)}</strong></span>
    <span>🎯 Acertou: <strong>${visual.hit === false ? "não" : "sim"}</strong></span>
    <span>💥 Crítico: <strong>${visual.critical ? "sim" : "não"}</strong></span>
  `;
}

function playTerrainSound(soundPath) {
  if (!soundPath) return;

  const encodedPath = encodeURI(soundPath);
  if (terrainSoundPath === encodedPath) return;

  if (terrainSound) {
    terrainSound.pause();
    terrainSound.remove();
    terrainSound = null;
    terrainSoundPath = "";
  }

  const audio = document.createElement("audio");
  audio.style.display = "none";
  audio.loop = true;
  audio.volume = 0.18;
  audio.src = encodedPath;
  audio.autoplay = true;

  document.body.appendChild(audio);
  audio.play().catch(() => {});

  terrainSound = audio;
  terrainSoundPath = encodedPath;
}

const ACTION_SFX_ROOT = "./assets/efx som/WAV Files";

const ACTION_SFX_MAP = {
  atacar: [
    "Attacks/Sword Attacks Hits and Blocks/Sword Attack 1.wav",
    "Attacks/Sword Attacks Hits and Blocks/Sword Attack 2.wav",
    "Attacks/Sword Attacks Hits and Blocks/Sword Attack 3.wav"
  ],
  esquivar: [
    "Attacks/Sword Attacks Hits and Blocks/Sword Parry 1.wav",
    "Attacks/Sword Attacks Hits and Blocks/Sword Parry 2.wav"
  ],
  fugir: [
    "Footsteps/Dirt/Dirt Run 1.wav",
    "Footsteps/Dirt/Dirt Run 2.wav"
  ],
  skill: [
    "Spells/Spell Impact 1.wav",
    "Spells/Spell Impact 2.wav",
    "Spells/Fireball 1.wav"
  ],
  hp: [
    "Spells/Firebuff 1.wav",
    "Spells/Firebuff 2.wav"
  ],
  mana: [
    "Spells/Ice Throw 1.wav",
    "Spells/Ice Throw 2.wav"
  ]
};

const activeActionSounds = new Set();

function resolveActionSfxPath(filePath) {
  return `${ACTION_SFX_ROOT}/${filePath}`;
}

function getRandomArrayItem(items) {
  return items[Math.floor(Math.random() * items.length)];
}

function playActionSound(src, options = {}) {
  if (!src) return;

  const audio = document.createElement("audio");
  audio.style.display = "none";
  audio.src = encodeURI(src);
  audio.preload = "auto";
  audio.volume = typeof options.volume === "number" ? options.volume : 0.4;
  audio.playbackRate = typeof options.playbackRate === "number" ? options.playbackRate : 1;
  audio.autoplay = true;

  audio.onended = () => {
    activeActionSounds.delete(audio);
    audio.remove();
  };

  audio.onerror = () => {
    activeActionSounds.delete(audio);
    audio.remove();
  };

  document.body.appendChild(audio);
  activeActionSounds.add(audio);

  audio.play().catch(() => {
    activeActionSounds.delete(audio);
    audio.remove();
  });
}

function getActionSound(action) {
  const files = ACTION_SFX_MAP[action] || [];
  if (!files.length) return null;
  return resolveActionSfxPath(getRandomArrayItem(files));
}

function playBattleActionSound(action) {
  const soundPath = getActionSound(action);
  if (!soundPath) return;
  playActionSound(soundPath, { volume: 0.42 });
}

function stopTerrainSound() {
  if (!terrainSound) return;

  terrainSound.pause();
  terrainSound.remove();

  terrainSound = null;
  terrainSoundPath = "";
}

function showTerrainEvent(message) {
  const eventBox = document.querySelector("[data-terrain-event]");
  if (!eventBox) return;

  if (!message) {
    eventBox.hidden = true;
    return;
  }

  eventBox.textContent = message;
  eventBox.hidden = false;
  eventBox.classList.remove("terrain-event-highlight");
  void eventBox.offsetWidth;
  eventBox.classList.add("terrain-event-highlight");
}

function updateTerrainVisuals(terrainInfo, boss = false) {
  const board = document.querySelector(".rpg-battle-board");
  if (!board) return;

  clearTerrainClasses(board);
  board.classList.add(terrainInfo.cssClass || "terrain-normal");
  if (boss) board.classList.add("boss-battle");

  if (terrainInfo.backgroundImage) {
    board.style.backgroundImage = `linear-gradient(rgba(0,0,0,.42), rgba(0,0,0,.42)), url(${encodeURI(terrainInfo.backgroundImage)})`;
    board.style.backgroundSize = "cover";
    board.style.backgroundPosition = "center";
    board.style.backgroundBlendMode = "overlay";
  } else {
    board.style.backgroundImage = "";
    board.style.backgroundSize = "";
    board.style.backgroundPosition = "";
    board.style.backgroundBlendMode = "";
  }

  if (terrainInfo.sound) {
    playTerrainSound(terrainInfo.sound);
  }
}

function clearTerrainClasses(board) {
  if (!board) return;

  [...board.classList].forEach(cls => {
    if (cls.startsWith("terrain-") || cls === "boss-battle") {
      board.classList.remove(cls);
    }
  });
}

function refreshUI() {
  if (!character || !monster) return;

  normalizeHpMana(character);

  const terrainInfo = battleData?.terrain || getTerrainRule(monster.bioma);
  const monsterVisual = getMonsterVisualInfo(monster);
  const boss = isBossMonster(monster);

  updateTerrainVisuals(terrainInfo, boss);

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
    dom.visual.textContent = `${monsterVisual.type}_${monsterVisual.rank}_${monsterVisual.scenario}`;
  }

  if (dom.terrainName) {
    dom.terrainName.textContent = terrainInfo.name;
  }

  if (dom.terrainDescription) {
    dom.terrainDescription.textContent = getTerrainBannerText(terrainInfo, turn);
  }

  if (dom.terrainTurnSubtitle) {
    dom.terrainTurnSubtitle.textContent = getTerrainSubtitleText(terrainInfo, turn);
  }

  if (document.querySelector(".terrain-icon")) {
    setText(".terrain-icon", terrainInfo.icon);
  }

  if (dom.playerAvatar) {
    const avatar = character.avatar;
    dom.playerAvatar.src = avatar || "./assets/monster/cavaleiro_r1_c1.png";
    dom.playerAvatar.onerror = () => {
      dom.playerAvatar.onerror = null;
      dom.playerAvatar.src = "./assets/monster/cavaleiro_r1_c1.png";
    };
  }

  if (dom.monsterAvatar) {
    dom.monsterAvatar.src = getMonsterAvatar(monster);
    dom.monsterAvatar.onerror = () => {
      dom.monsterAvatar.onerror = null;
      dom.monsterAvatar.src = getMonsterSprite(monster);
    };
  }

  // Render active effects (buffs/debuffs) on each combatant card
  try {
    renderEffectsPanel();
  } catch (e) {
    // não crítico
  }
  try { renderMonsterStats(); } catch (e) {}

  saveBattleState();
}

function getMonsterSprite(monsterData = {}) {
  const raw = String(monsterData.sprite || monsterData.visual || monsterData.id || "").toLowerCase();
  if (raw && raw.endsWith(".png")) return raw;

  const info = getMonsterVisualInfo(monsterData);
  const primary = `./assets/monster/${info.type}_${info.rank}_${info.scenario}.png`;

  if (["troll", "golem", "gargula"].includes(info.type) && info.scenario !== "c3") {
    return `./assets/monster/${info.type}_${info.rank}_c3.png`;
  }

  return primary;
}

function getCurrentMonsterLocal() {
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

async function preparePlayerAction(action, skill = null) {
  if (!character || !encounter || !monster) return;

  pendingPlayerAction = {
    action,
    skill
  };
  // Se a defesa do mestre estiver desativada, resolvemos imediatamente
  if (!ENABLE_MASTER_DEFENSE) {
    // resolve sem defesa do mestre (modo 'none')
    await resolvePlayerActionWithMasterDefense('none');
    return;
  }

  battlePhase = "MASTER_DEFENSE";

  writeCenterMessage("MESTRE DEFENDE");
  writeLog(`🎲 Turno ${turn}

Jogador preparou: ${action === "skill" ? (skill?.name || skill?.nome || skill?.id || "Skill") : "Ataque normal"}.

Agora o mestre escolhe:
- Esquivar
- Defender`);

  writeDiceResult(null);
  renderBattleActions();
  await saveCharacterSafe();
}

async function resolvePlayerActionWithMasterDefense(defenseMode) {
  if (locked || !pendingPlayerAction) return;

  locked = true;
  setButtonsEnabled(false);

  try {
    const beforeMonsterHp = num(monster.hp, 0);

    playBattleActionSound(pendingPlayerAction.action);

    const result = processCombatAction({
      action: pendingPlayerAction.action,
      skill: pendingPlayerAction.skill,
      character,
      encounter,
      autoCounter: false
    });

    character = result.character;
    encounter = result.encounter;
    monster = getCurrentMonsterLocal();

    const afterMonsterHp = num(monster?.hp, 0);
    const originalDamage = Math.max(0, beforeMonsterHp - afterMonsterHp);

    let defenseText = "";
    let finalDamage = originalDamage;

    if (defenseMode === 'none') {
      defenseText = `\n\n🛡️ Defesa do mestre desativada. Dano aplicado: ${originalDamage}`;
      finalDamage = originalDamage;
    } else {
      if (monster && originalDamage > 0 && defenseMode === "esquivar") {
        const dodgeDice = rollD20();
        const success = dodgeDice >= 12;

        if (success) {
          monster.hp = Math.min(getMonsterMaxHp(monster), monster.hp + originalDamage);
          finalDamage = 0;
          defenseText = `

👹 Mestre tentou esquivar.
D20 esquiva do mestre: ${dodgeDice}
Resultado: sucesso.
O monstro evitou todo o dano.`;
        } else {
          defenseText = `

👹 Mestre tentou esquivar.
D20 esquiva do mestre: ${dodgeDice}
Resultado: falha.
Dano recebido pelo monstro: ${originalDamage}`;
        }
      }

      if (monster && originalDamage > 0 && defenseMode === "defender") {
        const defenseDice = rollD20();
        const blocked = Math.min(originalDamage, Math.ceil(originalDamage * 0.35) + Math.floor(defenseDice / 5));

        monster.hp = Math.min(getMonsterMaxHp(monster), monster.hp + blocked);
        finalDamage = Math.max(0, originalDamage - blocked);

        defenseText = `

🛡️ Mestre defendeu.
D20 defesa do mestre: ${defenseDice}
Dano original: ${originalDamage}
Bloqueado: ${blocked}
Dano final: ${finalDamage}`;
      }

      if (monster && originalDamage <= 0) {
        defenseText = `

🛡️ Defesa do mestre:
O ataque não causou dano.`;
      }
    }

    pendingPlayerAction = null;

    writeDiceResult({
      ...result.visual,
      damage: finalDamage
    });

    refreshUI();

    let fullReport = `${result.report}${defenseText}`;

    if (!encounter || !monster || num(monster.hp, 0) <= 0 || result.nextState !== "COMBATE") {
      await endBattle(fullReport);
      return;
    }

    battlePhase = "MASTER_ACTION";

    writeCenterMessage("VEZ DO MESTRE");
    writeLog(`${fullReport}

Agora o mestre pode atacar.`);
    renderBattleActions();

    await saveCharacterSafe();

    // Se ataque automático do mestre estiver habilitado, dispare-o após pequeno atraso
    if (ENABLE_MASTER_AUTO_ATTACK) {
      setTimeout(() => {
        try {
          prepareMasterAttack();
        } catch (e) {
          console.warn('Erro ao executar ataque automático do mestre:', e);
        }
      }, 300);
    }
  } catch (error) {
    console.error(error);
    writeLog("⚠️ Erro na defesa do mestre. Veja o console.");
  }

  locked = false;
  setButtonsEnabled(true);
  refreshUI();
}

function getMonsterAttackValue(monsterData = {}) {
  const level = getMonsterLevel(monsterData);
  return num(
    monsterData.attack ??
    monsterData.ataque ??
    monsterData.atk ??
    level * 2 + 3,
    level * 2 + 3
  );
}

async function prepareMasterAttack() {
  if (locked || !character || !monster) return;

  locked = true;
  setButtonsEnabled(false);

  try {
    const hitDice = rollD20();
    const damageDice = rollD20();

    const monsterAttack = getMonsterAttackValue(monster);
    const attackTotal = hitDice + Math.floor(monsterAttack * 0.35);
    const rawDamage = damageDice + Math.floor(monsterAttack * 0.65);

    pendingMasterAttack = {
      hitDice,
      damageDice,
      attackTotal,
      rawDamage,
      monsterAttack
    };

    battlePhase = "PLAYER_DEFENSE";

    writeCenterMessage("JOGADOR DEFENDE");
    writeLog(`👹 Mestre preparou ataque.

D20 acerto do mestre: ${hitDice}
Total de ataque: ${attackTotal}
D20 dano do mestre: ${damageDice}
Dano bruto preparado: ${rawDamage}

Agora o jogador escolhe:
- Esquivar
- Defender`);

    writeDiceResult({
      dice: hitDice,
      damage: rawDamage,
      hit: true,
      critical: hitDice === 20
    });

    renderBattleActions();
    await saveCharacterSafe();
  } catch (error) {
    console.error(error);
    writeLog("⚠️ Erro ao preparar ataque do mestre.");
  }

  locked = false;
  setButtonsEnabled(true);
  refreshUI();
}

async function resolveMasterAttackWithPlayerDefense(defenseMode) {
  if (locked || !pendingMasterAttack) return;

  locked = true;
  setButtonsEnabled(false);

  try {
    playBattleActionSound(defenseMode === "esquivar" ? "esquivar" : "atacar");

    const playerDefense = getDefense(character);
    const playerSpeed = getSpeed(character);

    let damage = 0;
    let defenseText = "";

    if (defenseMode === "esquivar") {
      const dodgeDice = rollD20();
      const dodgeTotal = dodgeDice + Math.floor(playerSpeed * 0.35);
      const success = dodgeTotal >= pendingMasterAttack.attackTotal;

      if (success) {
        damage = 0;
        defenseText = `🌀 Jogador tentou esquivar.
D20 esquiva: ${dodgeDice}
Total esquiva: ${dodgeTotal}
Ataque do mestre: ${pendingMasterAttack.attackTotal}
Resultado: sucesso.`;
      } else {
        damage = Math.max(1, pendingMasterAttack.rawDamage - Math.floor(playerDefense * 0.25));
        defenseText = `🌀 Jogador tentou esquivar.
D20 esquiva: ${dodgeDice}
Total esquiva: ${dodgeTotal}
Ataque do mestre: ${pendingMasterAttack.attackTotal}
Resultado: falha.`;
      }
    }

    if (defenseMode === "defender") {
      const defenseDice = rollD20();
      const blocked = Math.floor(playerDefense * 0.45) + Math.floor(defenseDice / 3);

      damage = Math.max(1, pendingMasterAttack.rawDamage - blocked);

      defenseText = `🛡️ Jogador defendeu.
D20 defesa: ${defenseDice}
Dano bruto: ${pendingMasterAttack.rawDamage}
Bloqueado: ${blocked}
Dano final: ${damage}`;
    }

    character.hp = Math.max(0, num(character.hp, 0) - damage);

    let report = `👹 Ataque do mestre contra o jogador.

D20 acerto do mestre: ${pendingMasterAttack.hitDice}
D20 dano do mestre: ${pendingMasterAttack.damageDice}
Dano bruto: ${pendingMasterAttack.rawDamage}

${defenseText}

Dano recebido: ${damage}
Seu HP: ${character.hp}/${getMaxHp(character)}`;

    pendingMasterAttack = null;

    if (character.hp <= 0) {
      battlePhase = "END";
      writeCenterMessage("VOCÊ CAIU");
      writeLog(report);
      await endBattle(report);
      return;
    }

    const terrainEvents = applyTerrainTurn(character, monster);

    if (terrainEvents?.length) {
      const eventText = terrainEvents.map(event => event.message).join(" | ");
      report += `

${eventText}`;
      showTerrainEvent(eventText);
    } else {
      showTerrainEvent("");
    }

    turn += 1;
    battlePhase = "PLAYER_ACTION";

    writeCenterMessage("SUA VEZ");
    writeLog(`${report}

✅ Turno ${turn}. Escolha sua próxima ação.`);

    writeDiceResult({
      dice: pendingMasterAttack?.hitDice ?? "-",
      damage,
      hit: damage > 0,
      critical: false
    });

    renderBattleActions();
    await saveCharacterSafe();
  } catch (error) {
    console.error(error);
    writeLog("⚠️ Erro ao resolver defesa do jogador.");
  }

  locked = false;
  setButtonsEnabled(true);
  refreshUI();
}

async function doSimpleCombatAction(action) {
  if (locked || !character || !encounter) return;

  locked = true;
  setButtonsEnabled(false);
  playBattleActionSound(action);

  try {
    const result = processCombatAction({
      action,
      character,
      encounter,
      autoCounter: false
    });

    character = result.character;
    encounter = result.encounter;
    monster = getCurrentMonsterLocal();

    writeLog(result.report);
    writeDiceResult(result.visual);
    refreshUI();

    if (result.nextState !== "COMBATE" || !encounter || !monster || num(character.hp, 0) <= 0) {
      await endBattle(result.report);
      return;
    }

    battlePhase = "MASTER_ACTION";
    writeCenterMessage("VEZ DO MESTRE");
    renderBattleActions();

    await saveCharacterSafe();

    if (ENABLE_MASTER_AUTO_ATTACK) {
      setTimeout(() => {
        try { prepareMasterAttack(); } catch (e) { console.warn('Erro auto mestre:', e); }
      }, 300);
    }
  } catch (error) {
    console.error(error);
    writeLog("⚠️ Erro ao processar ação.");
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

  playBattleActionSound(kind);

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

  
  // Se retorno automático estiver habilitado, agendar redirect
  if (ENABLE_AUTO_RETURN) {
    if (_autoReturnTimeout) clearTimeout(_autoReturnTimeout);
    _autoReturnTimeout = setTimeout(() => {
      finishBattleAndReturn().catch(err => console.warn('Erro no auto return:', err));
    }, AUTO_RETURN_DELAY_MS);
  }
}

function createNarrativeBlackScreenBattle(narrativeText, duration = 4000, onEnd) {
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

async function playCutsceneThenRedirect(src, redirectTo) {
  return new Promise((resolve) => {
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
      resolve();
    });

    video.addEventListener("error", () => {
      cleanup();
      resolve();
    });

    video.play().catch(() => {
      video.controls = true;
    });
  }).then(() => {
    window.location.href = redirectTo;
  });
}

async function finishBattleAndReturn() {
  document.body.classList.remove("battle-mode");
  stopTerrainSound();

  if (_autoReturnTimeout) {
    clearTimeout(_autoReturnTimeout);
    _autoReturnTimeout = null;
  }

  await saveCharacterSafe();

  const dead = num(character?.hp, 0) <= 0;
  const redirectOnDeath = battleData?.deadReturnTo || "./city.html";
  const deadCutscene = battleData?.deadCutscene;

  sessionStorage.removeItem(STORAGE_KEY);
  localStorage.removeItem(ACTIVE_BATTLE_KEY);

  window.dispatchEvent(new CustomEvent("eldrakar:battle-end", {
    detail: {
      returnTo
    }
  }));

  if (dead && deadCutscene) {
    const deathNarrative = `Você caiu em batalha contra o Dragão Calamidade.\n\nMas sua história não terminou aqui...\n\nVocê desperta nos porões da cidade,\nferido mas vivo.\n\nA aventura continua.`;
    
    createNarrativeBlackScreenBattle(deathNarrative, 5000, async () => {
      await playCutsceneThenRedirect(deadCutscene, redirectOnDeath);
    });
    return;
  }

  window.location.href = returnTo;
}

function loadBattleData() {
  const raw = localStorage.getItem(ACTIVE_BATTLE_KEY) || sessionStorage.getItem(STORAGE_KEY);

  if (!raw) {
    writeCenterMessage("SEM BATALHA");
    writeLog("Nenhuma batalha foi enviada para battle.html.");
    return false;
  }

  try {
    const parsed = JSON.parse(raw);

    if (parsed.player && parsed.monster && parsed.encounter) {
      battleData = parsed.battleData || parsed;
      character = parsed.player || parsed.character;
      monster = parsed.monster;
      encounter = parsed.encounter;
      turn = parsed.turn || 1;
      battlePhase = parsed.battlePhase || "PLAYER_ACTION";
      pendingPlayerAction = parsed.pendingPlayerAction || null;
      returnTo = parsed.returnTo || "./world.html";
    } else {
      battleData = parsed;
    }
  } catch (error) {
    console.warn("Falha ao restaurar estado de batalha:", error);
    writeCenterMessage("DADOS INVÁLIDOS");
    writeLog("Não foi possível ler os dados de batalha.");
    return false;
  }

  turn = turn || 1;
  locked = false;
  battlePhase = battlePhase || "PLAYER_ACTION";
  pendingPlayerAction = pendingPlayerAction || null;
  pendingMasterAttack = null;

  character = character || battleData.player || battleData.character;
  monster = monster || battleData.monster;

  encounter = encounter || battleData.encounter || {
    monsters: [monster]
  };

  returnTo = returnTo || battleData.returnTo || "./world.html";

  if (!encounter.monsters?.length && monster) {
    encounter.monsters = [monster];
  }

  monster = getCurrentMonsterLocal();

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

  if (GlobalUI && typeof GlobalUI.setCharacter === "function") {
    character = GlobalUI.setCharacter(character);
  }

  refreshUI();

  const terrainInfo = getTerrainRule(monster.bioma);

  window.dispatchEvent(new CustomEvent("eldrakar:battle-start", {
    detail: {
      terrain: terrainInfo
    }
  }));

  updateTerrainVisuals(terrainInfo, isBossMonster(monster));

  battlePhase = "PLAYER_ACTION";
  renderBattleActions();

  writeCenterMessage("SUA VEZ");
  writeLog(`⚔️ ${getName(monster, "Monstro")} apareceu em ${terrainInfo.name}.
${terrainInfo.effectName}: ${terrainInfo.description}

Turno manual ativado:
1. Jogador escolhe ataque.
2. Mestre escolhe defesa ou esquiva.
3. Mestre escolhe ataque.
4. Jogador escolhe defesa ou esquiva.`);

  writeDiceResult(null);
  setButtonsEnabled(true);

  await saveCharacterSafe();
}

window.addEventListener("beforeunload", saveBattleState);
startBattle();