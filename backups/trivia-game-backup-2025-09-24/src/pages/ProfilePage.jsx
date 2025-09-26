import { useState, useEffect, useRef, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'
import questionUsageTracker from '../utils/questionUsageTracker'
import { GameDataLoader } from '../utils/gameDataLoader'

function ProfilePage() {
  const [stats, setStats] = useState(null)
  const [gameData, setGameData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [resetting, setResetting] = useState(false)
  const navigate = useNavigate()
  const { user, isAuthenticated, loading: authLoading } = useAuth()
  const containerRef = useRef(null)
  const headerRef = useRef(null)
  const [dimensions, setDimensions] = useState({ width: 0, height: 0 })
  const [headerHeight, setHeaderHeight] = useState(0)

  // Redirect to home if not authenticated
  useEffect(() => {
    if (!authLoading && !isAuthenticated) {
      navigate('/')
    }
  }, [isAuthenticated, authLoading, navigate])

  // Set user ID for question tracker when user changes
  useEffect(() => {
    if (user?.uid) {
      questionUsageTracker.setUserId(user.uid)
    }
  }, [user])

  // Load game data and stats
  useEffect(() => {
    const loadData = async () => {
      if (!user?.uid) return

      try {
        setLoading(true)

        // Load game data
        const data = await GameDataLoader.loadGameData()
        setGameData(data)

        // Update question pool and get stats
        questionUsageTracker.updateQuestionPool(data)
        const statistics = await questionUsageTracker.getUsageStatistics()
        setStats(statistics)
      } catch (error) {
        console.error('Error loading profile data:', error)
      } finally {
        setLoading(false)
      }
    }

    loadData()
  }, [user])

  // Handle window resize
  useEffect(() => {
    const updateDimensions = () => {
      if (containerRef.current) {
        const rect = containerRef.current.getBoundingClientRect()
        setDimensions({ width: rect.width, height: rect.height })
      }

      if (headerRef.current) {
        const headerRect = headerRef.current.getBoundingClientRect()
        setHeaderHeight(headerRect.height)
      }
    }

    updateDimensions()
    window.addEventListener('resize', updateDimensions)
    return () => window.removeEventListener('resize', updateDimensions)
  }, [])

  // Handle reset questions
  const handleResetQuestions = async () => {
    if (!window.confirm('هل أنت متأكد من إعادة تعيين جميع الأسئلة؟ ستصبح جميع الأسئلة متاحة مرة أخرى.')) {
      return
    }

    try {
      setResetting(true)
      await questionUsageTracker.clearAllUsageData()

      // Reload stats
      const statistics = await questionUsageTracker.getUsageStatistics()
      setStats(statistics)

      alert('تم إعادة تعيين جميع الأسئلة بنجاح!')
    } catch (error) {
      console.error('Error resetting questions:', error)
      alert('حدث خطأ أثناء إعادة تعيين الأسئلة')
    } finally {
      setResetting(false)
    }
  }

  // Responsive scaling system (similar to GameBoard and QuestionView)
  const getResponsiveStyles = () => {
    try {
      const W = window.innerWidth || 375
      const H = window.innerHeight || 667

      // PC Auto-scaling
      const isPC = W >= 1024 && H >= 768
      const pcScaleFactor = isPC ? 2.0 : 1.0

      // Device detection
      const isUltraNarrow = W < 950
      const isMobileLayout = W < 768
      const isLandscape = W > H

      // More accurate space calculation
      const actualHeaderHeight = 80
      const padding = isUltraNarrow ? 4 : isMobileLayout ? 6 : 8

      // Global scaling
      const globalScaleFactor = Math.max(0.8, Math.min(1.2, W / 400))

      // Text scaling
      let baseFontSize
      if (isUltraNarrow) {
        baseFontSize = Math.max(10, Math.min(16, W * 0.03))
      } else if (isMobileLayout) {
        baseFontSize = Math.max(12, Math.min(20, W * 0.025))
      } else {
        baseFontSize = Math.max(14, Math.min(24, W * 0.02))
      }

      const titleFontSize = Math.round(baseFontSize * globalScaleFactor * 1.5) * pcScaleFactor
      const textFontSize = Math.round(baseFontSize * globalScaleFactor) * pcScaleFactor
      const smallTextFontSize = Math.round(baseFontSize * globalScaleFactor * 0.8) * pcScaleFactor

      // Button scaling
      let baseButtonFontSize, baseButtonPadding
      if (isUltraNarrow) {
        baseButtonFontSize = Math.max(8, Math.min(12, W * 0.025))
        baseButtonPadding = Math.max(2, Math.min(8, W * 0.01))
      } else if (isMobileLayout) {
        baseButtonFontSize = Math.max(10, Math.min(16, W * 0.02))
        baseButtonPadding = Math.max(4, Math.min(12, W * 0.015))
      } else {
        baseButtonFontSize = Math.max(12, Math.min(18, W * 0.015))
        baseButtonPadding = Math.max(6, Math.min(16, W * 0.015))
      }

      const buttonFontSize = Math.round(baseButtonFontSize * globalScaleFactor) * pcScaleFactor
      const buttonPadding = Math.round(baseButtonPadding * globalScaleFactor * pcScaleFactor)

      // Header scaling
      const baseHeaderFont = Math.max(8, Math.min(16, W * 0.015))
      const headerFontSize = Math.round(baseHeaderFont * globalScaleFactor) * pcScaleFactor

      // Card scaling
      const cardPadding = Math.round(padding * globalScaleFactor * pcScaleFactor * 2)
      const cardMargin = Math.round(padding * globalScaleFactor * pcScaleFactor)

      return {
        // Device detection
        isPC,
        isUltraNarrow,
        isMobileLayout,
        isLandscape,

        // Text scaling
        titleFontSize,
        textFontSize,
        smallTextFontSize,

        // Button scaling
        buttonFontSize,
        buttonPadding,

        // Header scaling
        headerFontSize,

        // Layout scaling
        cardPadding,
        cardMargin,
        padding,

        // Available space
        availableWidth: W - (padding * 2),
        availableHeight: H - actualHeaderHeight - (padding * 2)
      }
    } catch (error) {
      console.error('Error in getResponsiveStyles:', error)
      return {
        isPC: false,
        isUltraNarrow: false,
        isMobileLayout: true,
        isLandscape: false,
        titleFontSize: 24,
        textFontSize: 16,
        smallTextFontSize: 14,
        buttonFontSize: 14,
        buttonPadding: 8,
        headerFontSize: 14,
        cardPadding: 16,
        cardMargin: 8,
        padding: 8,
        availableWidth: 300,
        availableHeight: 400
      }
    }
  }

  const styles = useMemo(() => getResponsiveStyles(), [dimensions, headerHeight])

  if (authLoading || loading) {
    return (
      <div className="min-h-screen bg-amber-50 flex items-center justify-center">
        <div className="text-gray-800 text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-red-600 mx-auto mb-4"></div>
          <div style={{ fontSize: `${styles?.textFontSize || 16}px` }}>جاري التحميل...</div>
        </div>
      </div>
    )
  }

  if (!isAuthenticated) {
    return null
  }

  return (
    <div ref={containerRef} className="bg-amber-50 flex flex-col" style={{
      minHeight: '100vh',
      overflow: 'auto'
    }}>
      {/* Header */}
      <div ref={headerRef} className="bg-red-600 text-white flex-shrink-0" style={{ padding: `${Math.max(2, styles.buttonPadding * 0.25)}px` }}>
        <div className="flex justify-between items-center">
          <div className="flex items-center gap-3">
            <button
              onClick={() => navigate('/')}
              className="bg-red-700 hover:bg-red-800 text-white rounded-lg px-3 py-1 transition-colors"
              style={{ fontSize: `${styles.headerFontSize * 0.8}px` }}
            >
              الرئيسية
            </button>
          </div>

          <div className="flex-1 text-center">
            <h1 className="font-bold text-center" style={{ fontSize: `${styles.headerFontSize * 1.2}px` }}>
              الملف الشخصي
            </h1>
          </div>

          <div className="flex items-center gap-3">
            <span className="font-bold" style={{ fontSize: `${styles.headerFontSize * 0.9}px` }}>
              {user?.displayName || 'مستخدم'}
            </span>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 bg-[#f7f2e6] overflow-auto" style={{
        padding: `${styles.cardMargin}px`,
        minHeight: `${styles.availableHeight}px`
      }}>
        <div className="max-w-4xl mx-auto">
          {/* User Info Card */}
          <div className="bg-white rounded-lg shadow-lg mb-4" style={{
            padding: `${styles.cardPadding}px`,
            marginBottom: `${styles.cardMargin}px`
          }}>
            <h2 className="font-bold text-gray-800 mb-2" style={{ fontSize: `${styles.titleFontSize}px` }}>
              معلومات المستخدم
            </h2>
            <div className="text-gray-600" style={{ fontSize: `${styles.textFontSize}px` }}>
              <p><strong>الاسم:</strong> {user?.displayName || 'غير محدد'}</p>
              <p><strong>البريد الإلكتروني:</strong> {user?.email || 'غير محدد'}</p>
            </div>
          </div>

          {/* Question Statistics Card */}
          {stats && (
            <div className="bg-white rounded-lg shadow-lg mb-4" style={{
              padding: `${styles.cardPadding}px`,
              marginBottom: `${styles.cardMargin}px`
            }}>
              <h2 className="font-bold text-gray-800 mb-4" style={{ fontSize: `${styles.titleFontSize}px` }}>
                إحصائيات الأسئلة
              </h2>

              <div className="grid grid-cols-2 gap-4 mb-4">
                <div className="text-center p-4 bg-blue-50 rounded-lg">
                  <div className="font-bold text-blue-600" style={{ fontSize: `${styles.titleFontSize}px` }}>
                    {stats.usedQuestions}
                  </div>
                  <div className="text-gray-600" style={{ fontSize: `${styles.smallTextFontSize}px` }}>
                    أسئلة مستخدمة
                  </div>
                </div>
                <div className="text-center p-4 bg-green-50 rounded-lg">
                  <div className="font-bold text-green-600" style={{ fontSize: `${styles.titleFontSize}px` }}>
                    {stats.unusedQuestions}
                  </div>
                  <div className="text-gray-600" style={{ fontSize: `${styles.smallTextFontSize}px` }}>
                    أسئلة متاحة
                  </div>
                </div>
              </div>

              <div className="mb-4">
                <div className="flex justify-between items-center mb-2">
                  <span className="text-gray-600" style={{ fontSize: `${styles.textFontSize}px` }}>
                    نسبة الإنجاز
                  </span>
                  <span className="font-bold text-blue-600" style={{ fontSize: `${styles.textFontSize}px` }}>
                    {stats.completionPercentage}%
                  </span>
                </div>
                <div className="w-full bg-gray-200 rounded-full h-4">
                  <div
                    className="bg-blue-600 h-4 rounded-full transition-all duration-300"
                    style={{ width: `${stats.completionPercentage}%` }}
                  ></div>
                </div>
              </div>

              <div className="text-center">
                <div className="text-gray-600" style={{ fontSize: `${styles.textFontSize}px` }}>
                  إجمالي الأسئلة: {stats.poolSize}
                </div>
                {stats.cycleComplete && (
                  <div className="text-green-600 font-bold mt-2" style={{ fontSize: `${styles.textFontSize}px` }}>
                    🎉 تم الانتهاء من جميع الأسئلة!
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Reset Button */}
          <div className="text-center">
            <button
              onClick={handleResetQuestions}
              disabled={resetting}
              className="bg-red-600 hover:bg-red-700 disabled:bg-gray-400 text-white font-bold rounded-lg transition-colors"
              style={{
                fontSize: `${styles.buttonFontSize}px`,
                padding: `${styles.buttonPadding}px ${styles.buttonPadding * 2}px`
              }}
            >
              {resetting ? 'جاري إعادة التعيين...' : '🔄 إعادة تعيين جميع الأسئلة'}
            </button>
            <p className="text-gray-600 mt-2" style={{ fontSize: `${styles.smallTextFontSize}px` }}>
              سيؤدي هذا إلى إتاحة جميع الأسئلة مرة أخرى
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}

export default ProfilePage