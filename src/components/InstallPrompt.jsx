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
  const [isIPad, setIsIPad] = useState(false)
  const [isStandalone, setIsStandalone] = useState(false)
  const [showIOSInstructions, setShowIOSInstructions] = useState(false)

  useEffect(() => {
    // Check if already installed (standalone mode)
    const standalone = window.matchMedia('(display-mode: standalone)').matches ||
                       window.navigator.standalone === true
    setIsStandalone(standalone)

    // Check if iOS device (iPhone/iPod)
    const iOSDevice = /iPhone|iPod/.test(navigator.userAgent) && !window.MSStream

    // Check if iPad - Modern iPads (iPadOS 13+) report as Macintosh
    // We detect them by checking for touch support on "Macintosh" devices
    const isModernIPad = navigator.userAgent.includes('Macintosh') &&
                         navigator.maxTouchPoints &&
                         navigator.maxTouchPoints > 1
    const isOldIPad = /iPad/.test(navigator.userAgent)
    const iPadDevice = isModernIPad || isOldIPad

    setIsIOS(iOSDevice)
    setIsIPad(iPadDevice)

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

    // Show banner after delay for mobile devices
    const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) ||
                     isModernIPad
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
    } else {
      // No deferred prompt available - show manual instructions
      setShowIOSInstructions(true)
    }
  }

  // Check if this is an iOS/iPad device that needs manual instructions
  const needsManualInstall = isIOS || isIPad

  const handleDismiss = () => {
    setShowBanner(false)
    localStorage.setItem('pwa-install-dismissed', Date.now().toString())
  }

  // Don't render if already installed or banner shouldn't show
  if (isStandalone || !showBanner) return null

  // iOS/iPad Instructions Modal
  const IOSInstructionsModal = () => (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-4">
      <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-2xl max-w-sm w-full overflow-hidden animate-scale-in">
        {/* Header */}
        <div className="bg-gradient-to-r from-red-600 to-red-700 text-white p-4 text-center">
          <h3 className="font-bold text-lg">إضافة التطبيق للشاشة الرئيسية</h3>
          <p className="text-sm opacity-90 mt-1">
            {isIPad ? 'على iPad' : 'على iPhone'}
          </p>
        </div>

        {/* Steps */}
        <div className="p-4 space-y-4">
          {/* Step 1 */}
          <div className="flex items-start gap-3">
            <div className="w-8 h-8 rounded-full bg-red-100 dark:bg-red-900/30 flex items-center justify-center shrink-0">
              <span className="text-red-600 dark:text-red-400 font-bold">1</span>
            </div>
            <div className="flex-1">
              <p className="text-gray-800 dark:text-gray-200 font-medium">
                اضغط على أيقونة المشاركة
              </p>
              <div className="mt-2 flex items-center gap-2 text-blue-600 dark:text-blue-400">
                <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                        d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
                </svg>
                <span className="text-sm">في شريط الأدوات {isIPad ? 'العلوي' : 'السفلي'}</span>
              </div>
            </div>
          </div>

          {/* Step 2 */}
          <div className="flex items-start gap-3">
            <div className="w-8 h-8 rounded-full bg-red-100 dark:bg-red-900/30 flex items-center justify-center shrink-0">
              <span className="text-red-600 dark:text-red-400 font-bold">2</span>
            </div>
            <div className="flex-1">
              <p className="text-gray-800 dark:text-gray-200 font-medium">
                اختر "إضافة إلى الشاشة الرئيسية"
              </p>
              <div className="mt-2 flex items-center gap-2 text-gray-600 dark:text-gray-400">
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                        d="M12 4v16m8-8H4" />
                </svg>
                <span className="text-sm">Add to Home Screen</span>
              </div>
            </div>
          </div>

          {/* Step 3 */}
          <div className="flex items-start gap-3">
            <div className="w-8 h-8 rounded-full bg-red-100 dark:bg-red-900/30 flex items-center justify-center shrink-0">
              <span className="text-red-600 dark:text-red-400 font-bold">3</span>
            </div>
            <div className="flex-1">
              <p className="text-gray-800 dark:text-gray-200 font-medium">
                اضغط "إضافة" للتأكيد
              </p>
              <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                سيظهر التطبيق على شاشتك الرئيسية
              </p>
            </div>
          </div>
        </div>

        {/* Close Button */}
        <div className="p-4 border-t border-gray-200 dark:border-slate-600">
          <button
            onClick={() => setShowIOSInstructions(false)}
            className="w-full py-3 rounded-xl font-bold text-white text-sm"
            style={{ background: 'linear-gradient(135deg, #DC2626, #B91C1C)' }}
          >
            فهمت
          </button>
        </div>
      </div>
    </div>
  )

  return (
    <>
      {showIOSInstructions && <IOSInstructionsModal />}

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
                أضف راس براس للشاشة الرئيسية
              </h3>
              <p className="text-sm text-gray-600 dark:text-gray-400 mt-0.5">
                {needsManualInstall
                  ? 'اضغط للحصول على التعليمات'
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
                {needsManualInstall ? (
                  <>
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                            d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    عرض التعليمات
                  </>
                ) : (
                  <>
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                            d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                    </svg>
                    تثبيت التطبيق
                  </>
                )}
              </span>
            </button>

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

        {/* Animation styles */}
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
          @keyframes scale-in {
            from {
              opacity: 0;
              transform: scale(0.9);
            }
            to {
              opacity: 1;
              transform: scale(1);
            }
          }
          .animate-scale-in {
            animation: scale-in 0.2s ease-out;
          }
        `}</style>
      </div>
    </>
  )
}

export default InstallPrompt
