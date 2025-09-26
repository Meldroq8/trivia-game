import { initializeApp } from 'firebase/app'
import { getFirestore } from 'firebase/firestore'
import { getAuth } from 'firebase/auth'
import { getStorage } from 'firebase/storage'

const firebaseConfig = {
  apiKey: "AIzaSyCt9vd2uOISntPQ4EM6o1K9_iiaDeiFtJs",
  authDomain: "lamah-357f3.firebaseapp.com",
  projectId: "lamah-357f3",
  storageBucket: "lamah-357f3.firebasestorage.app",
  messagingSenderId: "482087427045",
  appId: "1:482087427045:web:9120b8ed276c8b84ed6d0c",
  measurementId: "G-V3MBTTVH14"
}

// Initialize Firebase
const app = initializeApp(firebaseConfig)

// Initialize Firebase services
export const db = getFirestore(app)
export const auth = getAuth(app)
export const storage = getStorage(app)

export default app