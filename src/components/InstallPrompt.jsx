import { useState, useEffect } from 'react'
import LogoDisplay from './LogoDisplay'

/**
 * PWA Install Prompt Banner
 * Shows a banner prompting users to install the app
 * Matches the app's red gradient theme
 */
function InstallPrompt() {
  const [deferredPrompt, setDeferredPrompt] = useState(null)
  const [showBanner, setShowBanner] = useState(false)
  const [isIOS, setIsIOS] = useState(false)
  const [isStandalone, setIsStandalone] = useState(false)

  useEffect(() => {
    // Check if already installed (standalone mode)
    const standalone = window.matchMedia('(display-mode: standalone)').matches ||
                       window.navigator.standalone === true
    setIsStandalone(standalone)

    // Check if iOS
    const iOS = /iPad|iPhone|iPod/.test(navigator.userAgent)
    setIsIOS(iOS)

    // Don't show if already installed
    if (standalone) return

    // Check if user dismissed before (with expiry)
    const dismissed = localStorage.getItem('pwa-install-dismissed')
    if (dismissed) {
      const dismissedTime = parseInt(dismissed, 10)
      // Show again after 1 day
      if (Date.now() - dismissedTime < 24 * 60 * 60 * 1000) {
        return
      }
    }

    // Listen for beforeinstallprompt event (Android/Chrome)
    const handleBeforeInstall = (e) => {
      e.preventDefault()
      setDeferredPrompt(e)
      setShowBanner(true)
    }

    window.addEventListener('beforeinstallprompt', handleBeforeInstall)

    // Show banner after delay for mobile devices only
    // Desktop users rarely install PWAs and the experience difference is minimal
    const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent)
    if (isMobile && !standalone) {
      setTimeout(() => setShowBanner(true), 2000)
    }

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstall)
    }
  }, [])

  const handleInstall = async () => {
    if (deferredPrompt) {
      deferredPrompt.prompt()
      const { outcome } = await deferredPrompt.userChoice
      if (outcome === 'accepted') {
        setShowBanner(false)
      }
      setDeferredPrompt(null)
    }
  }

  const handleDismiss = () => {
    setShowBanner(false)
    localStorage.setItem('pwa-install-dismissed', Date.now().toString())
  }

  // Don't render if already installed or banner shouldn't show
  if (isStandalone || !showBanner) return null

  return (
    <div className="fixed bottom-4 left-4 right-4 z-50 animate-slide-up">
      <div className="max-w-md mx-auto rounded-2xl shadow-2xl overflow-hidden
                      bg-white dark:bg-slate-800
                      border border-gray-200 dark:border-slate-600">
        {/* Header with app icon */}
        <div className="p-4 flex items-center gap-4">
          {/* App icon - uses dynamic logo from Firebase */}
          <div className="w-14 h-14 rounded-xl flex items-center justify-center shrink-0 overflow-hidden"
               style={{ background: 'linear-gradient(135deg, #DC2626, #991B1B)' }}>
            <LogoDisplay size="large" fallbackEmoji="🎮" />
          </div>

          {/* Text content */}
          <div className="flex-1 min-w-0">
            <h3 className="font-bold text-gray-900 dark:text-white text-lg">
              أضف لمّه للشاشة الرئيسية
            </h3>
            <p className="text-sm text-gray-600 dark:text-gray-400 mt-0.5">
              {isIOS
                ? 'اضغط على أيقونة المشاركة ثم "إضافة للشاشة الرئيسية"'
                : 'استمتع بتجربة أفضل بدون شريط العنوان'
              }
            </p>
          </div>

          {/* Close button */}
          <button
            onClick={handleDismiss}
            className="p-2 text-gray-400 hover:text-gray-600 dark:text-gray-500 dark:hover:text-gray-300
                       transition-colors rounded-full hover:bg-gray-100 dark:hover:bg-slate-700"
            aria-label="إغلاق"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Action buttons */}
        <div className="px-4 pb-4 flex gap-3">
          {!isIOS && (
            <button
              onClick={handleInstall}
              className="flex-1 py-3 px-4 rounded-xl font-bold text-white text-sm
                         shadow-lg transition-all duration-150 ease-out
                         hover:shadow-xl hover:-translate-y-0.5 active:translate-y-0"
              style={{
                background: 'linear-gradient(135deg, #DC2626, #B91C1C)',
                boxShadow: '0 10px 24px rgba(220,38,38,.35)'
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = 'linear-gradient(135deg, #EF4444, #DC2626)'
                e.currentTarget.style.boxShadow = '0 14px 30px rgba(220,38,38,.45)'
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = 'linear-gradient(135deg, #DC2626, #B91C1C)'
                e.currentTarget.style.boxShadow = '0 10px 24px rgba(220,38,38,.35)'
              }}
            >
              <span className="flex items-center justify-center gap-2">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                        d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                </svg>
                تثبيت التطبيق
              </span>
            </button>
          )}

          <button
            onClick={handleDismiss}
            className="flex-1 py-3 px-4 rounded-xl font-bold text-sm
                       text-gray-700 dark:text-gray-300
                       bg-gray-100 dark:bg-slate-700
                       hover:bg-gray-200 dark:hover:bg-slate-600
                       transition-colors duration-150"
          >
            لاحقاً
          </button>
        </div>
      </div>

      {/* Animation style */}
      <style>{`
        @keyframes slide-up {
          from {
            opacity: 0;
            transform: translateY(100%);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
        .animate-slide-up {
          animation: slide-up 0.3s ease-out;
        }
      `}</style>
    </div>
  )
}

export default InstallPrompt
