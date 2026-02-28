import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'
import { devLog, devWarn, prodError } from './utils/devLog'

// Pages where reloading is NOT safe (active gameplay)
const isActiveGameplay = () => {
  const path = window.location.pathname
  return path.startsWith('/question') || path.startsWith('/gameboard')
}

// Check for pending update from a previous deferred reload
if (sessionStorage.getItem('pending_update') === 'true') {
  if (!isActiveGameplay()) {
    sessionStorage.removeItem('pending_update')
    window.location.reload()
  }
}

// Register Service Worker for image caching and auto-updates
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js')
      .then((registration) => {
        devLog('🛠️ Service Worker registered for image caching')

        // Check for updates periodically
        registration.update()

        // When a new service worker is waiting, activate it immediately
        if (registration.waiting) {
          registration.waiting.postMessage({ type: 'SKIP_WAITING' })
        }

        // Listen for new service worker becoming available
        registration.addEventListener('updatefound', () => {
          const newWorker = registration.installing
          if (newWorker) {
            newWorker.addEventListener('statechange', () => {
              if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
                devLog('🔄 New service worker installed, activating immediately')
                newWorker.postMessage({ type: 'SKIP_WAITING' })
              }
            })
          }
        })
      })
      .catch((error) => {
        devLog('⚠️ Service Worker registration failed:', error)
      })
  })

  // Listen for version update messages from service worker
  navigator.serviceWorker.addEventListener('message', (event) => {
    if (event.data && event.data.type === 'VERSION_UPDATED') {
      devLog('🆕 New version available:', event.data.version)
      if (!isActiveGameplay()) {
        window.location.reload()
      } else {
        sessionStorage.setItem('pending_update', 'true')
      }
    }
  })

  // When service worker takes control, reload unless in active gameplay
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (!isActiveGameplay()) {
      devLog('🔄 New service worker took control, reloading for fresh content')
      window.location.reload()
    } else {
      devLog('🔄 New version ready, will apply after gameplay ends')
      sessionStorage.setItem('pending_update', 'true')
    }
  })

  // Check for updates when user returns to the tab
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
      // Check for pending update when tab becomes visible
      if (sessionStorage.getItem('pending_update') === 'true' && !isActiveGameplay()) {
        sessionStorage.removeItem('pending_update')
        window.location.reload()
        return
      }
      // Ask service worker to check for new version
      if (navigator.serviceWorker.controller) {
        navigator.serviceWorker.controller.postMessage('CHECK_VERSION')
      }
    }
  })
}

// Prefetch app settings immediately - populates in-memory cache BEFORE React renders
// This shaves off the useEffect delay on first visit
import { settingsService } from './firebase/settingsService'
settingsService.getAppSettings().then(settings => {
  // Cache logo/slogan individually for next visit's instant init
  try {
    if (settings?.largeLogo) localStorage.setItem('app_large_logo_url', settings.largeLogo)
    if (settings?.logo) localStorage.setItem('app_logo_url', settings.logo)
    if (settings?.slogan) localStorage.setItem('app_slogan', settings.slogan)
  } catch {}
})

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
