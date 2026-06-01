export const DEFAULT_SETTINGS = {
  masterVolume: 80,
  musicVolume: 70,
  sfxVolume: 80,
  rain: true,
  cinematicEffects: true,
  typewriter: true,
  textSpeed: 35,
  graphicsQuality: "normal"
};

export function normalizeSettings(settings = {}) {
  return {
    ...DEFAULT_SETTINGS,
    ...(settings || {})
  };
}

const STORAGE_KEY = "eldrakarSettings";

export function loadLocalSettings() {
  try {
    if (!window?.localStorage) return null;
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    return normalizeSettings(JSON.parse(raw));
  } catch (err) {
    console.warn("Não foi possível carregar configurações locais:", err);
    return null;
  }
}

export function saveLocalSettings(settings = {}) {
  try {
    if (!window?.localStorage) return;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(normalizeSettings(settings)));
  } catch (err) {
    console.warn("Não foi possível salvar configurações locais:", err);
  }
}

export function normalizeCharacterSettings(character = {}) {
  return {
    ...character,
    settings: normalizeSettings(character.settings)
  };
}
