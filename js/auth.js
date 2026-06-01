import {
  auth,
  db,
  googleProvider,
  signInWithPopup,
  signInAnonymously,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  doc,
  setDoc,
  getDoc,
  serverTimestamp
} from "./firebase.js";

const statusText = document.getElementById("statusText");
const playerNameInput = document.getElementById("playerName");
const emailInput = document.getElementById("emailInput");
const passwordInput = document.getElementById("passwordInput");
const guestNameInput = document.getElementById("guestName");

function status(msg) {
  console.log(msg);
  if (statusText) statusText.textContent = msg;
}

function getErrorMessage(error) {
  console.error("Erro Firebase:", error);

  switch (error.code) {
    case "auth/popup-closed-by-user":
      return "Login cancelado. A janela do Google foi fechada.";
    case "auth/popup-blocked":
      return "O navegador bloqueou o popup. Libere popups para este site.";
    case "auth/unauthorized-domain":
      return "Domínio não autorizado no Firebase.";
    case "auth/email-already-in-use":
      return "Esse email já está cadastrado.";
    case "auth/weak-password":
      return "A senha precisa ter no mínimo 6 caracteres.";
    case "auth/invalid-email":
      return "Email inválido.";
    case "auth/invalid-credential":
      return "Email ou senha incorretos.";
    default:
      return "Erro: " + (error.code || error.message);
  }
}

async function savePlayer(user, chosenName = "", options = {}) {
  const { forceLobby = false } = options;

  const name =
    chosenName ||
    user.displayName ||
    user.email?.split("@")[0] ||
    "Jogador";

  await setDoc(
    doc(db, "players", user.uid),
    {
      uid: user.uid,
      accountName: name,
      email: user.email || "",
      photoURL: user.photoURL || "",
      provider: user.providerData?.[0]?.providerId || "anonymous",
      updatedAt: serverTimestamp()
    },
    { merge: true }
  );

  localStorage.setItem("playerUid", user.uid);
  localStorage.setItem("accountName", name);

  if (forceLobby) {
    window.location.href = "./lobby.html";
    return;
  }

  const charRef = doc(db, "players", user.uid, "characters", "main");
  const charSnap = await getDoc(charRef);

  if (charSnap.exists()) {
    window.location.href = "./world.html";
  } else {
    window.location.href = "./lobby.html";
  }
}

const googleLoginBtn = document.getElementById("googleLoginBtn");

if (googleLoginBtn) {
  googleLoginBtn.addEventListener("click", async () => {
    try {
      status("Abrindo login Google...");

      const result = await signInWithPopup(auth, googleProvider);

      status("Conectado com Google! Carregando...");
      await savePlayer(result.user);

    } catch (error) {
      status(getErrorMessage(error));
    }
  });
}

const emailRegisterBtn = document.getElementById("emailRegisterBtn");

if (emailRegisterBtn) {
  emailRegisterBtn.addEventListener("click", async () => {
    const name = playerNameInput.value.trim();
    const email = emailInput.value.trim();
    const password = passwordInput.value.trim();

    if (!name || !email || !password) {
      status("Preencha nome, email e senha para cadastrar.");
      return;
    }

    try {
      status("Criando conta...");

      const result = await createUserWithEmailAndPassword(auth, email, password);

      await savePlayer(result.user, name, {
        forceLobby: true
      });

    } catch (error) {
      status(getErrorMessage(error));
    }
  });
}

const emailLoginBtn = document.getElementById("emailLoginBtn");

if (emailLoginBtn) {
  emailLoginBtn.addEventListener("click", async () => {
    const email = emailInput.value.trim();
    const password = passwordInput.value.trim();

    if (!email || !password) {
      status("Digite seu email e senha para entrar.");
      return;
    }

    try {
      status("Entrando...");

      const result = await signInWithEmailAndPassword(auth, email, password);

      await savePlayer(result.user);

    } catch (error) {
      status(getErrorMessage(error));
    }
  });
}

const guestLoginBtn = document.getElementById("guestLoginBtn");

if (guestLoginBtn) {
  guestLoginBtn.addEventListener("click", async () => {
    const name = guestNameInput.value.trim();

    if (!name) {
      status("Digite um nome para a Entrada Rápida.");
      return;
    }

    try {
      status("Entrando no modo rápido...");

      const result = await signInAnonymously(auth);

      await savePlayer(result.user, name, {
        forceLobby: true
      });

    } catch (error) {
      status(getErrorMessage(error));
    }
  });
}
