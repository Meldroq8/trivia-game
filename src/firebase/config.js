import { devLog, devWarn, prodError } from "../utils/devLog"
import { initializeApp } from 'firebase/app'
import { getFirestore } from 'firebase/firestore'
import { getAuth } from 'firebase/auth'
import { getStorage } from 'firebase/storage'
import { initializeAppCheck, ReCaptchaEnterpriseProvider } from 'firebase/app-check'

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
  measurementId: import.meta.env.VITE_FIREBASE_MEASUREMENT_ID
}

// Initialize Firebase
const app = initializeApp(firebaseConfig)

// Initialize App Check with reCAPTCHA Enterprise
// This prevents unauthorized API access (only requests from your website are allowed)
if (import.meta.env.VITE_RECAPTCHA_SITE_KEY) {
  try {
    // Enable debug mode in development (generates debug tokens)
    if (import.meta.env.DEV) {
      // @ts-ignore
      self.FIREBASE_APPCHECK_DEBUG_TOKEN = true
    }

    initializeAppCheck(app, {
      provider: new ReCaptchaEnterpriseProvider(import.meta.env.VITE_RECAPTCHA_SITE_KEY),
      isTokenAutoRefreshEnabled: true
    })
    devLog('App Check initialized successfully')
  } catch (error) {
    prodError('Failed to initialize App Check:', error)
  }
} else {
  devWarn('App Check not initialized: VITE_RECAPTCHA_SITE_KEY not set')
}

// Initialize Firebase services
export const db = getFirestore(app)
export const auth = getAuth(app)
export const storage = getStorage(app)

// Set Arabic as the default language for auth emails
auth.languageCode = 'ar'

// Optional: Set custom action code settings for better branding
auth.useDeviceLanguage() // This will use browser language, but we override with 'ar' above

export default app