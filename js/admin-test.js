import GlobalUI from "./global-ui.js";
import { GameBrain } from "./game-brain.js";
import { createWorldEncounter } from "./game-brain/encounter-engine.js";
import { normalizeHpMana } from "./game-brain/character-engine.js";
import {
  addItem as addInventoryItem,
  removeItem as removeInventoryItem,
  useConsumable as consumeInventoryItem
} from "./game-brain/inventory-engine.js";

function getChar() {

  let character =
    GameBrain?.character ||
    GlobalUI?.character ||
    GlobalUI?.getCharacter?.();

  if (!character) {
    console.warn("Nenhum personagem carregado.");
    return null;
  }

  return character;
}


function createTestItem(itemId) {
  const id = String(itemId || "").toLowerCase();

  if (id.includes("hp") && id.includes("t2")) {
    return {
      id: "pocao_hp_t2",
      nome: "Poção HP T2",
      tipo: "pocao_hp",
      tier: "T2",
      cura: 60,
      valor: 150,
      stackavel: false
    };
  }

  if (id.includes("hp")) {
    return {
      id: "pocao_hp_t1",
      nome: "Poção HP T1",
      tipo: "pocao_hp",
      tier: "T1",
      cura: 25,
      valor: 50,
      stackavel: false
    };
  }

  if (id.includes("mana") && id.includes("t2")) {
    return {
      id: "pocao_mn_t2",
      nome: "Poção Mana T2",
      tipo: "pocao_mn",
      tier: "T2",
      mana: 45,
      valor: 150,
      stackavel: false
    };
  }

  if (id.includes("mana")) {
    return {
      id: "pocao_mn_t1",
      nome: "Poção Mana T1",
      tipo: "pocao_mn",
      tier: "T1",
      mana: 20,
      valor: 50,
      stackavel: false
    };
  }

  if (id.includes("cristal")) {
    return {
      id: "cristal_glacial",
      nome: "Cristal Glacial",
      tipo: "material",
      tier: "T1",
      valor: 80,
      stackavel: true
    };
  }

  return {
    id: id || "item_teste",
    nome: `Item de Teste ${id || "gen"}`,
    tipo: "material",
    tier: "T1",
    valor: 10,
    stackavel: true
  };
}

function sync() {
  const character = getChar();

  normalizeHpMana(character);

  GameBrain.character = character;
  GlobalUI.setCharacter(character);
  GlobalUI.saveCharacter();

  console.log("ADM sync:", character);
}

window.ADM = {
  gold(amount = 1000) {
    const c = getChar();
    c.gold = (c.gold || 0) + Number(amount);
    sync();
    return c;
  },

  heal() {
    const c = getChar();
    c.hp = c.maxHp;
    c.mana = c.maxMana;
    sync();
    return c;
  },

  level(level = 10) {
    const c = getChar();
    c.level = Number(level);
    normalizeHpMana(c, true);
    sync();
    return c;
  },
stats() {

  const c = getChar();

  if (!c) {
    console.warn("Personagem não encontrado.");
    return null;
  }

  console.log("Personagem:", c);
  console.log("Attributes:", c.attributes);
  console.log("Equipment:", c.equipment);

  return c;
},
  
  attr(nome, valor) {
    const c = getChar();
    c.attributes = c.attributes || {};
    c.attributes[nome] = Number(valor);
    sync();
    return c;
  },

  spawn(maxTier = "T1") {
    const c = getChar();

    const encounter = createWorldEncounter({
      character: c,
      place: "admin_test",
      bioma: "swamp",
      maxTier
    });

    GameBrain.encontroAtivo = encounter;
    GameBrain.estadoAtual = "COMBATE";

    const monster =
      encounter.monsters?.find(m => (m.hp || 0) > 0) ||
      encounter.monsters?.[0];

    GlobalUI.setMonster(monster);
    console.log("Monstro criado:", monster);
    return encounter;
  },

  xp(amount = 1000) {
    const c = getChar();

    if (!c) {
      console.warn("Personagem não encontrado.");
      return null;
    }

    if (typeof GlobalUI?.applyXp === "function") {
      GlobalUI.applyXp(Number(amount));
    } else {
      c.xp = (c.xp || 0) + Number(amount);
    }

    sync();
    return c;
  },

  addItem(itemId = "item_teste", qty = 1) {
    const c = getChar();
    if (!c) {
      console.warn("Personagem não encontrado.");
      return null;
    }

    c.inventory = c.inventory || [];

    const item =
      typeof itemId === "string"
        ? createTestItem(itemId)
        : itemId;

    for (let i = 0; i < Number(qty || 1); i += 1) {
      addInventoryItem(c, item, 1);
    }

    sync();
    console.log(`ADM adicionou ${qty}x ${item.nome || item.id}`);
    return c;
  },

  removeItem(itemId, qty = 1) {
    const c = getChar();
    if (!c) {
      console.warn("Personagem não encontrado.");
      return null;
    }

    const success = removeInventoryItem(c, itemId, Number(qty || 1));
    sync();

    console.log(`ADM removeu ${qty}x ${itemId}:`, success);
    return success;
  },

  useItem(itemId) {
    const c = getChar();
    if (!c) {
      console.warn("Personagem não encontrado.");
      return null;
    }

    const result = consumeInventoryItem(c, itemId);

    if (result.ok) {
      sync();
      console.log(`ADM usou item ${itemId}:`, result);
    } else {
      console.warn(`ADM não conseguiu usar item ${itemId}:`, result.message);
    }

    return result;
  },

  advanceTurn(amount = 1) {
    const c = getChar();
    if (!c) {
      console.warn("Personagem não encontrado.");
      return null;
    }

    const turnAmount = Number(amount || 1);
    c.worldTurn = (Number(c.worldTurn) || 1) + turnAmount;

    if (GlobalUI && typeof GlobalUI.setWorldTurn === "function") {
      GlobalUI.setWorldTurn(c.worldTurn);
    }

    sync();
    console.log(`ADM avançou ${turnAmount} turno(s). Novo turno: ${c.worldTurn}`);
    return c.worldTurn;
  },

  setTurn(turn = 1) {
    const c = getChar();
    if (!c) {
      console.warn("Personagem não encontrado.");
      return null;
    }

    c.worldTurn = Number(turn || 1);

    if (GlobalUI && typeof GlobalUI.setWorldTurn === "function") {
      GlobalUI.setWorldTurn(c.worldTurn);
    }

    sync();
    console.log(`ADM definiu turno para ${c.worldTurn}`);
    return c.worldTurn;
  },

  spawnBoss(tier = "T8") {
    const c = getChar();
    if (!c) {
      console.warn("Personagem não encontrado.");
      return null;
    }

    const encounter = createWorldEncounter({
      character: c,
      place: "admin_boss",
      bioma: "castelo",
      maxTier: tier
    });

    GameBrain.encontroAtivo = encounter;
    GameBrain.estadoAtual = "COMBATE";

    const monster =
      encounter.monsters?.find(m => (m.hp || 0) > 0) ||
      encounter.monsters?.[0];

    GlobalUI.setMonster(monster);
    console.log("ADM spawnou boss:", monster);
    return monster;
  },

  sync
};

console.log("✅ ADM carregado. Use ADM.stats(), ADM.gold(1000), ADM.heal(), ADM.attr('defesa', 20), ADM.spawn('T1')");