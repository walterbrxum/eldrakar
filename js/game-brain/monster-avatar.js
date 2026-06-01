// =====================================================
// monster-avatar.js
// Sistema visual dos monstros — Eldrakar
// =====================================================

export function getMonsterAvatar(monstro = {}) {
  const info = getMonsterVisualInfo(monstro);
  return getMonsterSpritePath(info);
}

export function getMonsterVisualInfo(monstro = {}) {
  const nome = normalizeText(monstro.nome || monstro.name || "");
  const type = getMonsterType(nome);

  return {
    type,
    rank: getMonsterRank(nome, monstro, type),
    scenario: getMonsterScenario(monstro),
    isBoss: isBossMonster(monstro)
  };
}

export function getMonsterSpritePath(info = {}) {
  const type = String(info.type || "goblin");
  const rank = String(info.rank || "r1");
  const scenario = String(info.scenario || "c3");
  return `./assets/monster/${type}_${rank}_${scenario}.png`;
}

export function normalizeText(txt) {
  return String(txt || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

export function getMonsterType(nome = "") {
  nome = normalizeText(nome)
    .replace(/\b(gigante|monstro|lorde|senhor|senhora|rei|rainha|imperador|imperatriz|senhorita)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  if (nome.includes("aranha")) return "aranha";
  if (nome.includes("cavaleiro")) return "cavaleiro";
  if (nome.includes("demonio")) return "demon";
  if (nome.includes("dragao")) return "dragao";
  if (nome.includes("esqueleto")) return "esqueleto";
  if (nome.includes("fantasma")) return "fantasma";
  if (nome.includes("gargula")) return "gargula";
  if (nome.includes("goblin")) return "goblin";
  if (nome.includes("lobo")) return "lobo";
  if (nome.includes("orc")) return "orc";
  if (nome.includes("slime")) return "slime";
  if (nome.includes("tigre")) return "tigre";
  if (nome.includes("troll")) return "troll";
  if (nome.includes("urso")) return "urso";
  if (nome.includes("vampiro")) return "vampiro";
  if (nome.includes("serpente")) return "serpente";
  if (nome.includes("golem")) return "golem";

  return "goblin";
}

export function getMonsterRank(nome = "", monstro = {}, type = "") {
  nome = normalizeText(nome);
  const tier = String(monstro.tier || "").toUpperCase();

  if (
    tier === "T5" ||
    tier === "T6" ||
    nome.includes("infernal") ||
    nome.includes("corrompido") ||
    nome.includes("gigante") ||
    nome.includes("anciao")
  ) {
    return "r3";
  }

  if (
    tier === "T3" ||
    tier === "T4" ||
    nome.includes("espectral") ||
    nome.includes("sombrio") ||
    nome.includes("sanguinario")
  ) {
    return "r2";
  }

  if (type === "golem" && tier === "T3") {
    return "r1";
  }

  return "r1";
}

export function getMonsterScenario(monstro = {}) {
  const bioma = normalizeText(monstro.bioma || "");

  if (
    bioma.includes("caverna") ||
    bioma.includes("subsolo") ||
    bioma.includes("castelo") ||
    bioma.includes("ruinas") ||
    bioma.includes("templo") ||
    bioma.includes("cave") ||
    bioma.includes("castle") ||
    bioma.includes("ruin") ||
    bioma.includes("temple")
  ) {
    return "c1";
  }

  if (
    bioma.includes("floresta") ||
    bioma.includes("pantano") ||
    bioma.includes("selva") ||
    bioma.includes("planicie") ||
    bioma.includes("forest") ||
    bioma.includes("swamp") ||
    bioma.includes("jungle")
  ) {
    return "c2";
  }

  return "c3";
}

export function isBossMonster(monstro = {}) {
  const nome = normalizeText(monstro.nome || monstro.name || "");
  const tier = String(monstro.tier || "").toUpperCase();

  return (
    tier === "T6" ||
    nome.includes("rei") ||
    nome.includes("rainha") ||
    nome.includes("lorde") ||
    nome.includes("anciao") ||
    nome.includes("gigante")
  );
}
