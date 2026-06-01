import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";

import {
  getAuth,
  GoogleAuthProvider,
  signInWithPopup,
  signInAnonymously,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  onAuthStateChanged,
  signOut
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";

import {
  getFirestore,
  collection,
  addDoc,
  onSnapshot,
  query,
  orderBy,
  doc,
  setDoc,
  getDoc,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

// IMPORTANTE: Adicionando o Realtime Database para gerenciar o "OnDisconnect"
import { 
  getDatabase, 
  ref, 
  onValue, 
  onDisconnect, 
  set 
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-database.js";

const firebaseConfig = {
  apiKey: "AIzaSyCnF8pj6U_WZOtHtpAQ9Re3iIrghjxLvoQ",
  authDomain: "rpg-dragons.firebaseapp.com",
  projectId: "rpg-dragons",
  storageBucket: "rpg-dragons.firebasestorage.app",
  messagingSenderId: "845426392745",
  appId: "1:845426392745:web:708d8878cb2b2f67ac73b8",
  // Geralmente a URL do database segue este padrão abaixo baseado no seu ID:
  databaseURL: "https://rpg-dragons-default-rtdb.firebaseio.com" 
};

const app = initializeApp(firebaseConfig);

const auth = getAuth(app);
const db = getFirestore(app);
const rtdb = getDatabase(app); // Inicializando o Realtime Database

const googleProvider = new GoogleAuthProvider();
googleProvider.setCustomParameters({
  prompt: "select_account"
});

export {
  auth,
  db,
  rtdb, // Exportando o Realtime Database
  googleProvider,
  signInWithPopup,
  signInAnonymously,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  onAuthStateChanged,
  signOut,
  collection,
  addDoc,
  onSnapshot,
  query,
  orderBy,
  doc,
  setDoc,
  getDoc,
  serverTimestamp,
  // Métodos do Realtime Database para controle de presença:
  ref,
  onValue,
  onDisconnect,
  set as rtdbSet
};