import { initializeApp, getApps } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';

const firebaseConfig = {
  apiKey: 'AIzaSyB6Hk_4Nq7Iwsph1Cz0CKpSEaEw-D6g3go',
  authDomain: 'she-drive-89e9e.firebaseapp.com',
  projectId: 'she-drive-89e9e',
  storageBucket: 'she-drive-89e9e.firebasestorage.app',
  messagingSenderId: '477451501316',
  appId: '1:477451501316:web:fec1c93cbbe9ac60841a51',
  measurementId: 'G-R43TXN6T1E',
};

const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApps()[0];

export const auth = getAuth(app);
export const db = getFirestore(app);
