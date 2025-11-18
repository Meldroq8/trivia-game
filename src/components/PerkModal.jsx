import { devLog, devWarn, prodError } from "../utils/devLog"
import { useState, useEffect, memo } from 'react'

const PerkModal = memo(function PerkModal({
  isOpen,
  onClose,
  perkType,
  teamName,
  onConfirm,
  isUsed = false,
  usageCount = 0,
  maxUses = 3,
  readOnly = false
}) {
  const [timerActive, setTimerActive] = useState(false)
  const [timeLeft, setTimeLeft] = useState(0)
  const [timerFinished, setTimerFinished] = useState(false)

  useEffect(() => {
    if (!timerActive || timeLeft <= 0) return

    const timer = setInterval(() => {
      setTimeLeft(prev => {
        if (prev <= 1) {
          setTimerActive(false)
          setTimerFinished(true)
          return 0
        }
        return prev - 1
      })
    }, 1000)

    return () => clearInterval(timer)
  }, [timerActive, timeLeft])

  useEffect(() => {
    if (isOpen) {
      setTimerActive(false)
      setTimeLeft(0)
      setTimerFinished(false)
    }
  }, [isOpen, perkType])

  // Add escape key handler
  useEffect(() => {
    const handleEscapeKey = (event) => {
      if (event.key === 'Escape' && isOpen) {
        onClose()
      }
    }

    if (isOpen) {
      document.addEventListener('keydown', handleEscapeKey)
      // Prevent body scroll when modal is open
      document.body.style.overflow = 'hidden'
    }

    return () => {
      document.removeEventListener('keydown', handleEscapeKey)
      document.body.style.overflow = 'unset'
    }
  }, [isOpen, onClose])

  // Handle timer completion with auto-close
  useEffect(() => {
    if (timerFinished) {
      // Auto close after 2 seconds
      const timeout = setTimeout(() => {
        onClose()
      }, 2000)

      return () => clearTimeout(timeout)
    }
  }, [timerFinished, onClose])

  // Early return AFTER all hooks
  if (!isOpen) return null

  devLog('PerkModal rendering with:', { isOpen, perkType, teamName })

  // Responsive sizing
  const isPC = window.innerWidth >= 1024 && window.innerHeight >= 768
  const isMobile = window.innerWidth < 640

  const perkInfo = getPerkInfo(perkType)

  const handleConfirm = () => {
    if (perkInfo.duration) {
      // Timer-based perks
      setTimeLeft(perkInfo.duration)
      setTimerActive(true)
      setTimerFinished(false)
    } else {
      // Immediate perks (double points)
      onConfirm()
      onClose()
    }
  }

  const handleStartTimer = () => {
    onConfirm()
    // Start the timer for this perk
    const duration = perkInfo.duration
    setTimeLeft(duration)
    setTimerActive(true)
    setTimerFinished(false)
  }

  // Hide modal when timer is active - timer will be shown in QuestionView
  if (timerActive) {
    return null
  }

  // Modern responsive modal with Tailwind
  return (
    <div
      className="fixed inset-0 bg-black/75 z-[99999] flex items-center justify-center p-4 transition-opacity duration-200"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-2xl border-4 border-red-600 shadow-2xl flex flex-col overflow-hidden max-w-lg w-full max-h-[90vh] transform transition-all duration-200 scale-100"
        onClick={e => e.stopPropagation()}
      >
        {/* Header with gradient */}
        <div className="bg-gradient-to-r from-red-600 to-red-700 text-white p-3 sm:p-4 flex justify-between items-center">
          <div className="flex items-center gap-2 sm:gap-3">
            <div className="flex-shrink-0">
              {perkInfo.icon}
            </div>
            <h2 className="font-bold text-lg sm:text-xl lg:text-2xl">{perkInfo.title}</h2>
          </div>
          <button
            onClick={onClose}
            className="bg-red-700 hover:bg-red-800 rounded-full w-7 h-7 sm:w-9 sm:h-9 flex items-center justify-center text-white font-bold text-xl sm:text-2xl transition-colors flex-shrink-0"
          >
            ×
          </button>
        </div>

        {/* Content */}
        <div className="p-4 sm:p-6 flex-1 flex flex-col justify-between overflow-y-auto">
          <div className="space-y-3 sm:space-y-4">
            {/* Team name badge */}
            <div className="flex justify-center">
              <div className="bg-red-50 border-2 border-red-200 rounded-full px-4 py-1.5 sm:px-6 sm:py-2">
                <span className="font-bold text-red-600 text-base sm:text-lg lg:text-xl" dir="auto">
                  فريق: {teamName}
                </span>
              </div>
            </div>

            {/* Description */}
            <div className="bg-gray-50 rounded-xl p-3 sm:p-4">
              <p className="text-gray-700 text-center leading-relaxed text-sm sm:text-base lg:text-lg font-bold" dir="rtl">
                {perkInfo.description}
              </p>
            </div>

            {/* Timer display */}
            {timerActive && (
              <div className="text-center">
                <div className="bg-red-600 text-white font-bold rounded-full w-16 h-16 sm:w-20 sm:h-20 lg:w-24 lg:h-24 flex items-center justify-center mx-auto text-xl sm:text-2xl lg:text-3xl shadow-lg">
                  {String(Math.floor(timeLeft / 60)).padStart(2, '0')}:{String(timeLeft % 60).padStart(2, '0')}
                </div>
                <p className="mt-2 text-gray-600 text-xs sm:text-sm lg:text-base">الوقت المتبقي</p>
              </div>
            )}

            {/* Timer finished */}
            {timerFinished && (
              <div className="text-center">
                <div className="text-green-600 font-bold text-lg sm:text-xl lg:text-2xl">✅ انتهى الوقت!</div>
              </div>
            )}
          </div>

          {/* Buttons */}
          <div className="flex justify-center gap-2 sm:gap-3 mt-4 sm:mt-6">
            {readOnly ? (
              <button
                onClick={onClose}
                className="bg-gray-600 hover:bg-gray-700 text-white rounded-xl font-bold px-5 py-2.5 sm:px-6 sm:py-3 min-w-[100px] transition-colors text-sm sm:text-base lg:text-lg"
              >
                إغلاق
              </button>
            ) : !timerActive && !timerFinished && (
              <>
                {isUsed || usageCount >= maxUses ? (
                  <button
                    disabled
                    className="bg-gray-400 text-white rounded-xl font-bold cursor-not-allowed px-5 py-2.5 sm:px-6 sm:py-3 min-w-[90px] text-sm sm:text-base lg:text-lg"
                  >
                    مستخدمة
                  </button>
                ) : (
                  <>
                    <button
                      onClick={onClose}
                      className="bg-gray-600 hover:bg-gray-700 text-white rounded-xl font-bold px-4 py-2.5 sm:px-6 sm:py-3 min-w-[80px] transition-colors text-sm sm:text-base lg:text-lg"
                    >
                      إلغاء
                    </button>
                    <button
                      onClick={perkInfo.duration ? handleStartTimer : handleConfirm}
                      className="bg-green-600 hover:bg-green-700 text-white rounded-xl font-bold px-5 py-2.5 sm:px-6 sm:py-3 min-w-[90px] transition-colors text-sm sm:text-base lg:text-lg shadow-lg"
                    >
                      {perkInfo.buttonText}
                    </button>
                  </>
                )}
              </>
            )}

            {timerActive && (
              <button
                onClick={() => {
                  setTimerActive(false)
                  setTimeLeft(0)
                }}
                className="bg-red-600 hover:bg-red-700 text-white rounded-xl font-bold px-5 py-2.5 sm:px-6 sm:py-3 min-w-[90px] transition-colors text-sm sm:text-base lg:text-lg"
              >
                إيقاف المؤقت
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
})

// Helper function to get perk information
function getPerkInfo(perkType) {
  const isMobile = window.innerWidth < 640
  const iconSize = isMobile ? 32 : 40 // Smaller on mobile

  switch (perkType) {
    case 'double':
      return {
        icon: (
          <svg width={iconSize} height={iconSize} viewBox="0 0 24 24" fill="none" className="drop-shadow-md">
            <path d="M12 2L15.09 8.26L22 9.27L17 14.14L18.18 21.02L12 17.77L5.82 21.02L7 14.14L2 9.27L8.91 8.26L12 2Z" fill="white" stroke="none"/>
            <text x="12" y="15" textAnchor="middle" fontSize="8" fill="#dc2626" fontWeight="bold">2</text>
          </svg>
        ),
        title: 'دبلها',
        description: 'يحصل الفريق على ضعف النقاط إذا أجاب بشكل صحيح على السؤال الحالي',
        duration: null,
        buttonText: 'تفعيل المضاعفة'
      }
    case 'phone':
      return {
        icon: (
          <svg width={iconSize} height={iconSize} viewBox="0 0 24 24" fill="none" className="drop-shadow-md">
            <path d="M6.62 10.79C8.06 13.62 10.38 15.94 13.21 17.38L15.41 15.18C15.69 14.9 16.08 14.82 16.43 14.93C17.55 15.3 18.75 15.5 20 15.5C20.55 15.5 21 15.95 21 16.5V20C21 20.55 20.55 21 20 21C10.61 21 3 13.39 3 4C3 3.45 3.45 3 4 3H7.5C8.05 3 8.5 3.45 8.5 4C8.5 5.25 8.7 6.45 9.07 7.57C9.18 7.92 9.1 8.31 8.82 8.59L6.62 10.79Z" fill="white" stroke="none"/>
          </svg>
        ),
        title: 'اتصال بصديق',
        description: 'يمكن للفريق الاتصال بصديق للمساعدة في الإجابة لمدة 30 ثانية',
        duration: 30,
        buttonText: 'بدء الاتصال'
      }
    case 'search':
      return {
        icon: (
          <svg width={iconSize} height={iconSize} viewBox="0 0 24 24" fill="none" className="drop-shadow-md">
            <path d="M15.5 14H14.71L14.43 13.73C15.41 12.59 16 11.11 16 9.5C16 5.91 13.09 3 9.5 3S3 5.91 3 9.5S5.91 16 9.5 16C11.11 16 12.59 15.41 13.73 14.43L14 14.71V15.5L19 20.49L20.49 19L15.5 14ZM9.5 14C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5S14 7.01 14 9.5S11.99 14 9.5 14Z" fill="white" stroke="none"/>
          </svg>
        ),
        title: 'جوجلها',
        description: 'يمكن للفريق البحث في جوجل عن إجابة السؤال لمدة 15 ثانية',
        duration: 15,
        buttonText: 'بدء البحث'
      }
    case 'risk':
      return {
        icon: (
          <svg width={iconSize} height={iconSize} viewBox="0 0 24 24" fill="none" className="drop-shadow-md">
            <rect x="3" y="3" width="18" height="18" rx="3" fill="white" stroke="none"/>
            <circle cx="7" cy="7" r="1.5" fill="#dc2626"/>
            <circle cx="17" cy="7" r="1.5" fill="#dc2626"/>
            <circle cx="7" cy="17" r="1.5" fill="#dc2626"/>
            <circle cx="17" cy="17" r="1.5" fill="#dc2626"/>
            <circle cx="12" cy="12" r="1.5" fill="#dc2626"/>
          </svg>
        ),
        title: 'يا تصيب يا تخيب',
        description: '3 أضعاف النقاط في حال الإجابة الصحيحة، وخصم ضعف النقاط في حال الإجابة الخاطئة',
        duration: null,
        buttonText: 'تفعيل المخاطرة'
      }
    case 'twoAnswers':
      return {
        icon: (
          <svg width={iconSize} height={iconSize} viewBox="0 0 72 72" fill="none" className="drop-shadow-md">
            <path fill="none" stroke="white" strokeLinecap="round" strokeLinejoin="round" strokeWidth="4" d="m52.62 31.13 1.8-22.18c-0.3427-4.964-6.779-5.02-7.227-0.026l-2.42 17.36c-0.3 2.179-1.278 3.962-2.166 3.962s-1.845-1.785-2.126-3.967l-2.231-17.34c-0.8196-5.278-7.439-4.322-7.037 0.0011l2.527 21.03"/>
            <path fill="none" stroke="white" strokeLinecap="round" strokeLinejoin="round" strokeWidth="4" d="m53.63 50.08c0 9.872-8.02 16.88-17.89 16.88"/>
            <path fill="none" stroke="white" strokeLinecap="round" strokeLinejoin="round" strokeWidth="4" d="m43.74 47.29v-2.333c0-1.1-1.789-2.2-3.976-2.441l-1.049-0.117c-2.187-0.242-3.976-1.851-3.976-3.774s1.8-3.334 4-3.334h10c2.201-0.0448 4.057 1.632 4.235 3.826l0.657 11.21"/>
            <path fill="none" stroke="white" strokeLinecap="round" strokeLinejoin="round" strokeWidth="4" d="m37.96 50.36c1.63-1.48 3.624-2.5 5.777-2.958"/>
            <path fill="none" stroke="white" strokeLinecap="round" strokeMiterlimit="10" strokeWidth="4" d="m18.53 52.1c1.142 8.6 8.539 14.98 17.21 14.86 9.667 0 17.89-6.833 17.89-16.88"/>
            <path fill="none" stroke="white" strokeLinecap="round" strokeLinejoin="round" strokeWidth="4" d="m31.75 49.72c0 1.258-0.6709 2.42-1.76 3.048s-2.431 0.6288-3.52 0-1.76-1.791-1.76-3.048v-15.96c0-1.258 0.6709-2.42 1.76-3.048s2.431-0.6288 3.52 0c1.089 0.6288 1.76 1.791 1.76 3.049z"/>
            <path fill="none" stroke="white" strokeLinecap="round" strokeLinejoin="round" strokeWidth="4" d="m24.71 44.94c0 1.262-0.6709 2.427-1.76 3.058s-2.431 0.6308-3.52 0c-1.089-0.6308-1.76-1.796-1.76-3.058v-7.937c0-1.262 0.6709-2.427 1.76-3.058 1.089-0.6308 2.431-0.6308 3.52 0s1.76 1.796 1.76 3.058z"/>
          </svg>
        ),
        title: 'جوابين',
        description: 'يمكن للفريق إعطاء إجابتين بدلاً من واحدة. إذا كانت أي من الإجابتين صحيحة، يحصل الفريق على النقاط',
        duration: null,
        buttonText: 'تفعيل الجوابين'
      }
    case 'prison':
      return {
        icon: (
          <svg width={iconSize} height={iconSize} viewBox="0 0 24 24" fill="none" className="drop-shadow-md">
            <path d="M6 2V22H8V2H6M10 2V22H12V2H10M14 2V22H16V2H14M18 2V22H20V2H18M2 2V4H22V2H2M2 20V22H22V20H2Z" fill="white" stroke="none"/>
          </svg>
        ),
        title: 'السجن',
        description: 'سجن لاعب من الفريق الآخر لهذا السؤال',
        duration: null,
        buttonText: 'تفعيل السجن',
        canActivateOnOpponentTurn: true
      }
    default:
      return {}
  }
}

export default PerkModal