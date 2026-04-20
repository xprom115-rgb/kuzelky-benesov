// firebase-config.js
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.0/firebase-app.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.7.0/firebase-firestore.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/10.7.0/firebase-auth.js";
export const firebaseConfig = {
  apiKey: "AIzaSyDuY6GIkbxmgIQne4AwWwEYinC_oz2umyw",
  authDomain: "kuzelky-benesov.firebaseapp.com",
  projectId: "kuzelky-benesov",
  storageBucket: "kuzelky-benesov.firebasestorage.app",
  messagingSenderId: "370227845074",
  appId: "1:370227845074:web:f1f6c5ed1ae3bde1395a0b"
};

export const app = initializeApp(firebaseConfig);
export const db  = getFirestore(app);
export const auth = getAuth(app);
console.log("firebase-config.js načten – Firestore inicializován");
``
