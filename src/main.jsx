import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'
import { devLog, devWarn, prodError } from './utils/devLog'

// Register Service Worker for image caching and auto-updates
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js')
      .then((registration) => {
        devLog('🛠️ Service Worker registered for image caching')

        // Check for updates periodically
        registration.update()

        // When a new service worker is waiting, activate it
        if (registration.waiting) {
          registration.waiting.postMessage({ type: 'SKIP_WAITING' })
        }

        // Listen for new service worker becoming available
        registration.addEventListener('updatefound', () => {
          const newWorker = registration.installing
          if (newWorker) {
            newWorker.addEventListener('statechange', () => {
              if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
                // New service worker available, it will take over on next navigation
                devLog('🔄 New service worker installed, will activate on next navigation')
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
      // Silently reload on next navigation - or reload now if idle
      // Store flag to reload on next user interaction
      sessionStorage.setItem('pending_update', 'true')
    }
  })

  // When service worker takes control, reload only if on index page
  // Never reload during gameplay (category selection, gameboard, question, results)
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    const path = window.location.pathname
    const safeToReload = path === '/' || path === '/index.html'

    if (safeToReload) {
      devLog('🔄 New service worker took control, reloading for fresh content')
      window.location.reload()
    } else {
      devLog('🔄 New version ready, will apply on next visit to home page')
      // Store flag so we know to use fresh content
      sessionStorage.setItem('pending_update', 'true')
    }
  })

  // Check for updates when user returns to the tab
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && navigator.serviceWorker.controller) {
      navigator.serviceWorker.controller.postMessage('CHECK_VERSION')
    }
  })
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
