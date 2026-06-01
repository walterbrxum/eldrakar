import { 
  auth, 
  db, 
  rtdb, 
  onAuthStateChanged, 
  doc, 
  setDoc, 
  serverTimestamp,
  ref, 
  onValue, 
  onDisconnect, 
  rtdbSet 
} from "./firebase.js";

// Monitora se o estado de autenticação mudou (usuário logou ou deslogou)
onAuthStateChanged(auth, (user) => {
  if (user) {
    // Referências para onde salvaremos o status do player
    const userStatusDatabaseRef = ref(rtdb, `/status/${user.uid}`);
    const userFirestoreRef = doc(db, "players", user.uid);

    // Variáveis com os estados de Online / Offline
    const isOfflineForDatabase = { state: 'offline', last_changed: serverTimestamp() };
    const isOnlineForDatabase = { state: 'online', last_changed: serverTimestamp() };

    const isOnlineForFirestore = { online: true, lastChanged: serverTimestamp() };
    const isOfflineForFirestore = { online: false, lastChanged: serverTimestamp() };

    // Verifica o canal interno de conexão do Firebase
    const connectedRef = ref(rtdb, '.info/connected');
    
    onValue(connectedRef, (snapshot) => {
      if (snapshot.val() === false) {
        // Se a conexão cair localmente, atualiza o Firestore de forma preventiva
        setDoc(userFirestoreRef, isOfflineForFirestore, { merge: true });
        return;
      }

      // Se estamos conectados, agenda o gatilho para QUANDO o player fechar a aba
      onDisconnect(userStatusDatabaseRef).set(isOfflineForDatabase).then(() => {
        
        // Se o agendamento deu certo, define o usuário como ONLINE no Realtime
        rtdbSet(userStatusDatabaseRef, isOnlineForDatabase);

        // E atualiza o documento dele no FIRESTORE definindo online: true
        setDoc(userFirestoreRef, isOnlineForFirestore, { merge: true });
      });
    });

  } else {
    console.log("Nenhum usuário logado para monitorar presença.");
  }
});

// Escuta mudanças em todos os status e emite um evento global contendo a lista
const statusRefAll = ref(rtdb, '/status');

onValue(statusRefAll, (snapshot) => {
  const val = snapshot.val() || {};

  const users = Object.keys(val).map(uid => ({ id: uid, ...(val[uid] || {}) }));

  try {
    window.dispatchEvent(new CustomEvent('eldrakar:presence-update', { detail: { users } }));
  } catch (err) {
    // ambiente sem window (testes) — apenas ignore
    console.warn('Erro emitindo evento de presença:', err);
  }
});

// API alternativa: permite subscrever via callback (retorna função de unsubscribe)
export function subscribeToPresence(callback) {
  const unsubscribe = onValue(statusRefAll, (snapshot) => {
    const val = snapshot.val() || {};
    const users = Object.keys(val).map(uid => ({ id: uid, ...(val[uid] || {}) }));
    callback(users);
  });

  return typeof unsubscribe === 'function' ? unsubscribe : () => {};
}