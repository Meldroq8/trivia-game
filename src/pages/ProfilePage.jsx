import { useState, useEffect, useRef, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'
import questionUsageTracker from '../utils/questionUsageTracker'
import { GameDataLoader } from '../utils/gameDataLoader'
import LogoDisplay from '../components/LogoDisplay'
import { devLog, devWarn, prodError } from '../utils/devLog'

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
    devLog('🔧 ProfilePage: User changed:', user?.uid ? 'User ID: ' + user.uid : 'No user')
    if (user?.uid) {
      questionUsageTracker.setUserId(user.uid)
      devLog('✅ ProfilePage: Set questionUsageTracker user ID to:', user.uid)
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

        // Update question pool and get stats (ensure user ID is set)
        if (user?.uid) {
          questionUsageTracker.setUserId(user.uid)
          questionUsageTracker.updateQuestionPool(data)
          const statistics = await questionUsageTracker.getUsageStatistics()
          setStats(statistics)
        } else {
          devLog('⏳ ProfilePage: Waiting for user authentication before loading stats')
        }
      } catch (error) {
        prodError('Error loading profile data:', error)
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

      // Ensure user ID is set before operations
      if (user?.uid) {
        questionUsageTracker.setUserId(user.uid)
        await questionUsageTracker.clearAllUsageData()

        // Reload stats
        const statistics = await questionUsageTracker.getUsageStatistics()
        setStats(statistics)
      } else {
        throw new Error('User not authenticated')
      }

      alert('تم إعادة تعيين جميع الأسئلة بنجاح!')
    } catch (error) {
      prodError('Error resetting questions:', error)
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

      // PC Auto-scaling - reduced scale factor for better appearance
      const isPC = W >= 1024 && H >= 768
      const pcScaleFactor = isPC ? 1.0 : 1.0

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
      prodError('Error in getResponsiveStyles:', error)
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

  // Calculate responsive header height
  const getHeaderHeight = () => {
    const height = window.innerHeight
    const isPC = window.innerWidth >= 1024 && height >= 768

    let baseFontSize = 16
    if (height <= 390) baseFontSize = 14
    else if (height <= 430) baseFontSize = 15
    else if (height <= 568) baseFontSize = 16
    else if (height <= 667) baseFontSize = 17
    else if (height <= 812) baseFontSize = 18
    else if (height <= 896) baseFontSize = 19
    else if (height <= 1024) baseFontSize = 20
    else baseFontSize = isPC ? 24 : 20

    return Math.max(56, baseFontSize * 3)
  }

  return (
    <div ref={containerRef} className="bg-amber-50 flex flex-col" style={{
      minHeight: '100vh',
      overflow: 'auto'
    }}>
      {/* Header */}
      <div className="bg-gradient-to-r from-red-600 via-red-700 to-red-600 text-white flex-shrink-0 sticky top-0 z-10 overflow-hidden shadow-lg" style={{
        padding: '8px',
        height: getHeaderHeight() + 'px'
      }}>
        <div className="flex items-center justify-between max-w-6xl mx-auto h-full px-4">
          <div className="flex items-center gap-3">
            <LogoDisplay />
          </div>

          <div className="flex-1 text-center">
            <h1 className="text-2xl font-bold">الملف الشخصي</h1>
          </div>

          <button
            onClick={() => navigate('/')}
            className="bg-white/20 hover:bg-white/30 px-4 py-2 rounded-lg transition-colors"
          >
            <span className="md:hidden text-xl">←</span>
            <span className="hidden md:inline">العودة للرئيسية</span>
          </button>
        </div>
      </div>

      {/* Main Content */}
      <div className="container mx-auto px-4 py-8 max-w-6xl">
        <div className="max-w-4xl mx-auto">
          {/* User Info Card */}
          <div className="bg-white rounded-lg shadow-lg p-6 mb-6">
            <h2 className="text-xl font-bold text-gray-800 mb-4">
              معلومات المستخدم
            </h2>
            <div className="text-gray-600">
              <p><strong>الاسم:</strong> {user?.displayName || 'غير محدد'}</p>
              <p><strong>البريد الإلكتروني:</strong> {user?.email || 'غير محدد'}</p>
            </div>
          </div>

          {/* Question Statistics Card */}
          {stats && (
            <div className="bg-white rounded-lg shadow-lg p-6 mb-6">
              <h2 className="text-xl font-bold text-gray-800 mb-4">
                إحصائيات الأسئلة
              </h2>

              <div className="grid grid-cols-2 gap-4 mb-4">
                <div className="text-center p-4 bg-blue-50 rounded-lg">
                  <div className="text-2xl font-bold text-blue-600">
                    {stats.usedQuestions}
                  </div>
                  <div className="text-sm text-gray-600">
                    أسئلة مستخدمة
                  </div>
                </div>
                <div className="text-center p-4 bg-green-50 rounded-lg">
                  <div className="text-2xl font-bold text-green-600">
                    {stats.unusedQuestions}
                  </div>
                  <div className="text-sm text-gray-600">
                    أسئلة متاحة
                  </div>
                </div>
              </div>

              <div className="mb-4">
                <div className="flex justify-between items-center mb-2">
                  <span className="text-gray-600">
                    نسبة الإنجاز
                  </span>
                  <span className="font-bold text-blue-600">
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
                <div className="text-gray-600">
                  إجمالي الأسئلة: {stats.poolSize}
                </div>
                {stats.cycleComplete && (
                  <div className="text-green-600 font-bold mt-2">
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
              className="bg-red-600 hover:bg-red-700 disabled:bg-gray-400 text-white font-bold py-3 px-6 rounded-lg transition-colors"
            >
              {resetting ? 'جاري إعادة التعيين...' : '🔄 إعادة تعيين جميع الأسئلة'}
            </button>
            <p className="text-gray-600 mt-2 text-sm">
              سيؤدي هذا إلى إتاحة جميع الأسئلة مرة أخرى
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}

export default ProfilePage