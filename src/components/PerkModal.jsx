import { devLog, devWarn, prodError } from "../utils/devLog"
import { useState, useEffect } from 'react'

function PerkModal({
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

  // PC Auto-scaling: Apply 2x scaling for desktop/PC users for better visibility
  const isPC = window.innerWidth >= 1024 && window.innerHeight >= 768
  const pcScaleFactor = isPC ? 2.0 : 1.0

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

  // Use the exact same approach as the working debug modal, just styled better
  return (
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: 'rgba(0, 0, 0, 0.75)',
        zIndex: 99999,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center'
      }}
      onClick={onClose}
    >
      <div
        style={{
          backgroundColor: 'white',
          width: Math.min(isPC ? 500 : 380, window.innerWidth - 40),
          maxWidth: '85vw',
          height: Math.min(isPC ? 600 : 420, window.innerHeight - 40),
          maxHeight: isPC ? '90vh' : '85vh',
          padding: 0,
          borderRadius: 12,
          border: '4px solid #dc2626',
          fontSize: Math.max(18, 16 * pcScaleFactor),
          fontFamily: "'Tajawal','Cairo','Tahoma','Arial',sans-serif",
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden'
        }}
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div style={{
          backgroundColor: '#dc2626',
          color: 'white',
          padding: '16px',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <span style={{ fontSize: `${Math.max(28, 24 * pcScaleFactor)}px` }}>{perkInfo.icon}</span>
            <h2 style={{ fontWeight: 'bold', fontSize: `${Math.max(22, 18 * pcScaleFactor)}px`, margin: 0 }}>{perkInfo.title}</h2>
          </div>
          <button
            onClick={onClose}
            style={{
              backgroundColor: '#b91c1c',
              borderRadius: '50%',
              width: '32px',
              height: '32px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: 'white',
              fontWeight: 'bold',
              fontSize: `${Math.max(24, 20 * pcScaleFactor)}px`,
              border: 'none',
              cursor: 'pointer'
            }}
          >
            ×
          </button>
        </div>

        {/* Content */}
        <div style={{ padding: '24px', flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
          <div>
            <div style={{ textAlign: 'center', marginBottom: '16px' }}>
              <span style={{ fontWeight: 'bold', color: '#dc2626', fontSize: `${Math.max(20, 18 * pcScaleFactor)}px` }}>فريق: {teamName}</span>
            </div>


            <div style={{ textAlign: 'center', marginBottom: '24px', padding: '0 8px' }}>
              <p style={{ color: '#374151', lineHeight: '1.6', direction: 'rtl', margin: 0, fontSize: `${Math.max(17, 15 * pcScaleFactor)}px` }}>{perkInfo.description}</p>
            </div>

            {timerActive && (
              <div style={{ textAlign: 'center', marginBottom: '16px' }}>
                <div style={{
                  backgroundColor: '#dc2626',
                  color: 'white',
                  fontWeight: 'bold',
                  borderRadius: '50%',
                  margin: '0 auto',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  width: `${80 * pcScaleFactor}px`,
                  height: `${80 * pcScaleFactor}px`,
                  fontSize: `${Math.max(22, 20 * pcScaleFactor)}px`
                }}>
                  {String(Math.floor(timeLeft / 60)).padStart(2, '0')}:{String(timeLeft % 60).padStart(2, '0')}
                </div>
                <p style={{ marginTop: '8px', color: '#6b7280', margin: '8px 0 0 0', fontSize: `${Math.max(16, 14 * pcScaleFactor)}px` }}>الوقت المتبقي</p>
              </div>
            )}

            {timerFinished && (
              <div style={{ textAlign: 'center', marginBottom: '16px' }}>
                <div style={{ color: '#059669', fontWeight: 'bold', fontSize: `${Math.max(22, 20 * pcScaleFactor)}px` }}>✅ انتهى الوقت!</div>
              </div>
            )}
          </div>

          <div style={{ display: 'flex', justifyContent: 'center', gap: '16px', marginTop: 'auto', paddingTop: '16px' }}>
            {readOnly ? (
              <button
                onClick={onClose}
                style={{
                  backgroundColor: '#6b7280',
                  color: 'white',
                  borderRadius: '8px',
                  fontWeight: 'bold',
                  padding: '12px 24px',
                  minWidth: '120px',
                  border: 'none',
                  cursor: 'pointer',
                  fontSize: `${Math.max(16, 14 * pcScaleFactor)}px`
                }}
              >
                إغلاق
              </button>
            ) : !timerActive && !timerFinished && (
              <>
                {isUsed || usageCount >= maxUses ? (
                  <button
                    disabled
                    style={{
                      backgroundColor: '#9ca3af',
                      color: 'white',
                      borderRadius: '8px',
                      fontWeight: 'bold',
                      cursor: 'not-allowed',
                      padding: '12px 24px',
                      minWidth: '96px',
                      border: 'none',
                      fontSize: `${Math.max(16, 14 * pcScaleFactor)}px`
                    }}
                  >
                    مستخدمة
                  </button>
                ) : (
                  <>
                    <button
                      onClick={onClose}
                      style={{
                        backgroundColor: '#6b7280',
                        color: 'white',
                        borderRadius: '8px',
                        fontWeight: 'bold',
                        padding: '12px 24px',
                        minWidth: '96px',
                        border: 'none',
                        cursor: 'pointer',
                        fontSize: `${Math.max(16, 14 * pcScaleFactor)}px`
                      }}
                    >
                      إلغاء
                    </button>
                    <button
                      onClick={perkInfo.duration ? handleStartTimer : handleConfirm}
                      style={{
                        backgroundColor: '#059669',
                        color: 'white',
                        borderRadius: '8px',
                        fontWeight: 'bold',
                        padding: '12px 24px',
                        minWidth: '96px',
                        border: 'none',
                        cursor: 'pointer',
                        fontSize: `${Math.max(16, 14 * pcScaleFactor)}px`
                      }}
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
                style={{
                  backgroundColor: '#dc2626',
                  color: 'white',
                  borderRadius: '8px',
                  fontWeight: 'bold',
                  padding: '12px 24px',
                  minWidth: '96px',
                  border: 'none',
                  cursor: 'pointer',
                  fontSize: `${Math.max(16, 14 * pcScaleFactor)}px`
                }}
              >
                إيقاف المؤقت
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

// Helper function to get perk information
function getPerkInfo(perkType) {
  switch (perkType) {
    case 'double':
      return {
        icon: '×2',
        title: 'مضاعفة النقاط',
        description: 'يحصل الفريق على ضعف النقاط إذا أجاب بشكل صحيح على السؤال الحالي',
        duration: null,
        buttonText: 'تفعيل المضاعفة'
      }
    case 'phone':
      return {
        icon: '📞',
        title: 'اتصال بصديق',
        description: 'يمكن للفريق الاتصال بصديق للمساعدة في الإجابة لمدة 30 ثانية',
        duration: 30,
        buttonText: 'بدء الاتصال'
      }
    case 'search':
      return {
        icon: '🔍',
        title: 'البحث في جوجل',
        description: 'يمكن للفريق البحث في جوجل عن إجابة السؤال لمدة 15 ثانية',
        duration: 15,
        buttonText: 'بدء البحث'
      }
    default:
      return {}
  }
}

export default PerkModal