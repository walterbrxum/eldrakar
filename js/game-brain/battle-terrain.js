// =====================================================
// battle-terrain.js
// Regras de terreno de batalha — Eldrakar
// =====================================================

import { normalizeText } from "./monster-avatar.js";

export const TERRAIN_RULES = {
  vulcao: {
    name: "Vulcão",
    icon: "🌋",
    effectName: "Calor Extremo",
    description: "O calor causa dano contínuo a cada turno.",
    playerDamagePercent: 3,
    sound: "./assets/efx som/fundo/Action 4.mp3",
    cssClass: "terrain-vulcao"
  },

  gelo: {
    name: "Gelo",
    icon: "❄️",
    effectName: "Solo Escorregadio",
    description: "Reduz esquiva e velocidade.",
    playerSpeedBonus: -2,
    playerDodgeBonus: -5,
    sound: "./assets/efx som/fundo/Ambient 4.mp3",
    cssClass: "terrain-gelo"
  },

  pantano: {
    name: "Pântano",
    icon: "🕸️",
    effectName: "Lama Profunda",
    description: "Reduz velocidade e pode intoxicar.",
    playerSpeedBonus: -2,
    playerDodgeBonus: -3,
    poisonChance: 10,
    sound: "./assets/efx som/fundo/Ambient 8.mp3",
    backgroundImage: "./assets/scenes/pantano_chuva.png",
    cssClass: "terrain-pantano"
  },

  floresta: {
    name: "Floresta",
    icon: "🌲",
    effectName: "Cobertura Natural",
    description: "Aumenta esquiva e favorece emboscadas.",
    playerDodgeBonus: 5,
    sound: "./assets/efx som/fundo/Light Ambience 2.mp3",
    backgroundImage: "./assets/scenes/floresta.png",
    cssClass: "terrain-floresta"
  },

  caverna: {
    name: "Caverna",
    icon: "🕳️",
    effectName: "Escuridão",
    description: "Reduz precisão e favorece monstros subterrâneos.",
    playerHitBonus: -5,
    sound: "./assets/efx som/fundo/Dark Ambient 2.mp3",
    backgroundImage: "./assets/scenes/escuro.png",
    cssClass: "terrain-caverna"
  },

  subsolo: {
    name: "Subsolo",
    icon: "⚫",
    effectName: "Escuridão Profunda",
    description: "O ambiente favorece criaturas das trevas.",
    playerHitBonus: -5,
    sound: "./assets/efx som/fundo/Dark Ambient 3.mp3",
    backgroundImage: "./assets/scenes/escuro.png",
    cssClass: "terrain-subsolo"
  },

  cemiterio: {
    name: "Cemitério",
    icon: "⚰️",
    effectName: "Aura da Morte",
    description: "Mortos-vivos e espectros ficam mais perigosos.",
    monsterAttackBonus: 3,
    monsterDefenseBonus: 3,
    sound: "./assets/efx som/fundo/Dark Ambient 5.mp3",
    cssClass: "terrain-cemiterio"
  },

  castelo: {
    name: "Castelo",
    icon: "🏰",
    effectName: "Terreno de Pedra",
    description: "Favorece defesa e monstros blindados.",
    playerDefenseBonus: 1,
    monsterDefenseBonus: 2,
    sound: "./assets/efx som/fundo/Ambient 3.mp3",
    cssClass: "terrain-castelo"
  },

  templo: {
    name: "Templo",
    icon: "🏛️",
    effectName: "Energia Antiga",
    description: "Magia instável percorre o campo de batalha.",
    sound: "./assets/efx som/fundo/Ambient 5.mp3",
    cssClass: "terrain-templo"
  },

  deserto: {
    name: "Deserto",
    icon: "🏜️",
    effectName: "Calor Seco",
    description: "O calor drena energia do personagem.",
    playerDamagePercent: 1,
    sound: "./assets/efx som/fundo/Light Ambience 1.mp3",
    cssClass: "terrain-deserto"
  },

  mar: {
    name: "Mar",
    icon: "🌊",
    effectName: "Terreno Instável",
    description: "O terreno molhado reduz mobilidade.",
    playerDodgeBonus: -2,
    sound: "./assets/efx som/fundo/Ambient 2.mp3",
    cssClass: "terrain-mar"
  },

  montanha: {
    name: "Montanha",
    icon: "🏔️",
    effectName: "Solo Rochoso",
    description: "A defesa aumenta, mas movimentos ficam difíceis.",
    playerDefenseBonus: 2,
    sound: "./assets/efx som/fundo/Ambient 6.mp3",
    cssClass: "terrain-montanha"
  },

  selva: {
    name: "Selva",
    icon: "🌴",
    effectName: "Vegetação Densa",
    description: "Favorece emboscadas e criaturas selvagens.",
    sound: "./assets/efx som/fundo/Ambient 7.mp3",
    cssClass: "terrain-selva"
  },

  planicie: {
    name: "Planície",
    icon: "🏞️",
    effectName: "Campo Aberto",
    description: "Sem obstáculos. Combate direto.",
    sound: "./assets/efx som/fundo/Ambient 1.mp3",
    cssClass: "terrain-planicie"
  },

  ruinas: {
    name: "Ruínas",
    icon: "🏚️",
    effectName: "Pedras Quebradas",
    description: "Terreno antigo favorece criaturas esquecidas.",
    sound: "./assets/efx som/fundo/Dark Ambient 4.mp3",
    cssClass: "terrain-ruinas"
  }
};

export function getTerrainKey(bioma = "") {
  const key = normalizeText(bioma);

  if (key.includes("vulcao") || key.includes("volcano")) return "vulcao";
  if (key.includes("gelo") || key.includes("ice")) return "gelo";
  if (key.includes("pantano") || key.includes("swamp") || key.includes("pantan")) return "pantano";
  if (key.includes("floresta") || key.includes("forest")) return "floresta";
  if (key.includes("selva") || key.includes("jungle")) return "selva";
  if (key.includes("caverna") || key.includes("cave")) return "caverna";
  if (key.includes("subsolo") || key.includes("underground") || key.includes("subterraneo")) return "subsolo";
  if (key.includes("cemiterio") || key.includes("cemetery") || key.includes("graveyard")) return "cemiterio";
  if (key.includes("castelo") || key.includes("castle")) return "castelo";
  if (key.includes("templo") || key.includes("temple")) return "templo";
  if (key.includes("deserto") || key.includes("desert")) return "deserto";
  if (key.includes("mar") || key.includes("sea") || key.includes("oceano") || key.includes("ocean")) return "mar";
  if (key.includes("montanha") || key.includes("mountain")) return "montanha";
  if (key.includes("planicie") || key.includes("plains") || key.includes("plain")) return "planicie";
  if (key.includes("ruinas") || key.includes("ruin")) return "ruinas";

  return "normal";
}

export function getTerrainRule(bioma = "") {
  const key = getTerrainKey(bioma);

  return TERRAIN_RULES[key] || {
    name: bioma || "Terreno comum",
    icon: "🌍",
    effectName: "Sem efeito especial",
    description: "Este terreno não possui efeito especial.",
    cssClass: "terrain-normal"
  };
}

export function applyTerrainTurn(player = {}, monster = {}) {
  const terrain = getTerrainRule(monster.bioma);
  const events = [];

  if (terrain.playerDamagePercent) {
    const maxHp = player.maxHp || player.hp || 1;
    const damage = Math.max(1, Math.floor(maxHp * (terrain.playerDamagePercent / 100)));

    player.hp = Math.max(0, (player.hp || 0) - damage);

    events.push({
      type: "terrain-damage",
      target: "player",
      amount: damage,
      message: `${terrain.icon} ${terrain.name}: você sofreu ${damage} de dano pelo terreno.`
    });
  }

  if (terrain.poisonChance && Math.random() * 100 < terrain.poisonChance) {
    const maxHp = player.maxHp || player.hp || 1;
    const damage = Math.max(1, Math.floor(maxHp * 0.05));

    player.hp = Math.max(0, (player.hp || 0) - damage);

    events.push({
      type: "terrain-poison",
      target: "player",
      amount: damage,
      message: `${terrain.icon} ${terrain.name}: o terreno envenenado causou ${damage} de dano.`
    });
  }

  return events;
}
