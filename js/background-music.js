if (window.__eldrakarBackgroundMusicLoaded) {
  console.warn("Background music already initialized.");
} else {
  window.__eldrakarBackgroundMusicLoaded = true;

  const STORAGE_KEY = "eldrakar:backgroundMusic";
  const TRACKS = [
    "./assets/efx som/fundo/Ambient 1.mp3",
  "./assets/efx som/fundo/Ambient 2.mp3",
  "./assets/efx som/fundo/Ambient 3.mp3",
  "./assets/efx som/fundo/Light Ambience 1.mp3"
].map(path => encodeURI(path));

const getStoredState = () => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch (err) {
    return null;
  }
};

const saveState = (state) => {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch (err) {
    /* ignore */
  }
};

const createControlButton = () => {
  const button = document.createElement("button");
  button.id = "eld-bg-music-control";
  button.type = "button";
  button.title = "Ativar / desativar música de fundo";
  button.style.cssText = [
    "position: fixed",
    "right: 16px",
    "bottom: 16px",
    "z-index: 10000",
    "border: none",
    "border-radius: 999px",
    "padding: 10px 14px",
    "font-size: 18px",
    "background: rgba(16, 12, 6, .88)",
    "color: #ffe8ad",
    "box-shadow: 0 0 20px rgba(0,0,0,.45)",
    "cursor: pointer"
  ].join(";");
  button.style.minWidth = "54px";
  button.style.minHeight = "54px";
  button.style.backdropFilter = "blur(10px)";
  return button;
};

const getTrack = (index) => {
  const i = Number.isInteger(index) ? index : 0;
  return TRACKS[i % TRACKS.length];
};

class BackgroundMusic {
  constructor() {
    this.audio = document.createElement("audio");
    this.audio.id = "eldBgMusic";
    this.audio.preload = "auto";
    this.audio.loop = false;
    this.audio.volume = 0.28;
    this.audio.style.display = "none";
    this.audio.addEventListener("ended", () => this.playNextTrack());

    this.state = {
      enabled: true,
      currentTrack: 0,
      volume: 0.28
    };

    this.control = createControlButton();
    this.control.addEventListener("click", () => this.toggle());

    document.body.appendChild(this.audio);
    document.body.appendChild(this.control);

    const stored = getStoredState();
    if (stored) {
      this.state = {
        ...this.state,
        ...stored
      };
      this.audio.volume = this.state.volume;
    }

    this.updateButton();
    this.loadTrack(this.state.currentTrack);

    window.addEventListener("eldrakar:settings-changed", event => {
      this.applySettings(event.detail || {});
    });

    window.addEventListener("eldrakar:battle-start", () => {
      this.pause();
    });

    window.addEventListener("eldrakar:battle-end", () => {
      if (this.state.enabled && this.state.volume > 0) {
        this.play();
      }
    });

    document.addEventListener("click", this.handleFirstInteraction.bind(this), { once: true, capture: true });

    window.addEventListener("load", () => {
      this.applyGlobalUiSettings();
    });
  }

  handleFirstInteraction() {
    if (this.state.enabled) {
      this.play();
    }
  }

  loadTrack(index) {
    this.state.currentTrack = index % TRACKS.length;
    this.audio.src = getTrack(this.state.currentTrack);
    this.save();
  }

  playNextTrack() {
    this.loadTrack(this.state.currentTrack + 1);
    this.play();
  }

  play() {
    if (!this.state.enabled) return;
    if (!this.audio.src) {
      this.loadTrack(0);
    }
    this.audio.play().catch(() => {
      /* autoplay bloqueado, tenta na próxima interação */
    });
    this.updateButton();
  }

  pause() {
    this.audio.pause();
    this.updateButton();
  }

  applySettings(settings = {}) {
    const master = Number(settings.masterVolume ?? 100) / 100;
    const music = Number(settings.musicVolume ?? 100) / 100;
    const volume = Math.max(0, Math.min(1, master * music));

    this.state.volume = volume;
    this.audio.volume = volume;
    this.audio.muted = volume === 0;

    if (volume === 0) {
      this.audio.pause();
    } else if (this.state.enabled) {
      this.play();
    }

    this.updateButton();
    this.save();
  }

  applyGlobalUiSettings() {
    if (window.GlobalUI && typeof window.GlobalUI.getCharacter === "function") {
      const character = window.GlobalUI.getCharacter();
      const settings = character?.settings || {};
      this.applySettings(settings);
    }
  }

  toggle() {
    this.state.enabled = !this.state.enabled;
    if (this.state.enabled) {
      this.play();
    } else {
      this.pause();
    }
    this.save();
  }

  save() {
    saveState({
      enabled: this.state.enabled,
      currentTrack: this.state.currentTrack,
      volume: this.state.volume
    });
  }

  updateButton() {
    const active = this.state.enabled && this.state.volume > 0;
    this.control.textContent = active ? "🔊" : "🔇";
    this.control.style.opacity = active ? "1" : "0.66";
  }
}

  new BackgroundMusic();
}
