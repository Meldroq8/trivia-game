import { useState, useEffect, useRef, useMemo, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import Header from '../components/Header'
import { useAuth } from '../hooks/useAuth'
import { debounce } from '../utils/debounce'
import { devLog, devWarn, prodError } from '../utils/devLog'

function Index({ setGameState }) {
  const navigate = useNavigate()
  const { getAppSettings, getPublicLeaderboard, updateLeaderboard } = useAuth()
  const [settings, setSettings] = useState(() => {
    try {
      const cachedSettings = localStorage.getItem('app_settings')
      return cachedSettings ? JSON.parse(cachedSettings) : {}
    } catch {
      return {}
    }
  })
  const [leaderboard, setLeaderboard] = useState([])
  const [leaderboardLoading, setLeaderboardLoading] = useState(false)
  const [dimensions, setDimensions] = useState({ width: window.innerWidth, height: window.innerHeight })
  const [tipsExpanded, setTipsExpanded] = useState(false)

  useEffect(() => {
    const updateDimensions = () => {
      setDimensions({ width: window.innerWidth, height: window.innerHeight })
    }

    updateDimensions()
    window.addEventListener('resize', updateDimensions)
    return () => window.removeEventListener('resize', updateDimensions)
  }, [])

  useEffect(() => {
    const loadSettings = async () => {
      try {
        const appSettings = await getAppSettings()
        if (appSettings) {
          setSettings(appSettings)
          // Cache settings for instant loading next time
          localStorage.setItem('app_settings', JSON.stringify(appSettings))
        }

        // Load leaderboard data in background (non-blocking)
        loadLeaderboard()
      } catch (error) {
        prodError('Error loading settings:', error)
        // Don't block UI on settings error - continue showing cached settings
      }
    }

    // Load data in background without blocking UI
    loadSettings()
  }, [getAppSettings])

  // Create debounced leaderboard refresh to prevent spam queries (500ms delay)
  const debouncedLoadLeaderboard = useCallback(
    debounce(() => {
      devLog('🔄 Loading leaderboard (debounced)')
      loadLeaderboard()
    }, 500),
    []
  )

  // Refresh leaderboard when page becomes visible (user returns from game)
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (!document.hidden) {
        devLog('🔄 Page visible - refreshing leaderboard')
        debouncedLoadLeaderboard()
      }
    }

    document.addEventListener('visibilitychange', handleVisibilityChange)
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange)
  }, [debouncedLoadLeaderboard])

  // Also refresh leaderboard when navigating back to this page
  useEffect(() => {
    const handleFocus = () => {
      devLog('🔄 Page focused - refreshing leaderboard')
      debouncedLoadLeaderboard()
    }

    window.addEventListener('focus', handleFocus)
    return () => window.removeEventListener('focus', handleFocus)
  }, [debouncedLoadLeaderboard])

  const loadLeaderboard = async () => {
    setLeaderboardLoading(true)
    try {
      // Load public leaderboard from users collection
      const leaderboardData = await getPublicLeaderboard()
      devLog('📊 Leaderboard data loaded:', leaderboardData)
      setLeaderboard(leaderboardData)
    } catch (error) {
      prodError('Error loading leaderboard:', error)
      setLeaderboard([])
    } finally {
      setLeaderboardLoading(false)
    }
  }

  // Memoize responsive styles for performance
  const responsiveStyles = useMemo(() => {
    const { width, height } = dimensions
    const isPortrait = height > width
    const isPC = width >= 1024 && height >= 768
    const pcScaleFactor = isPC ? 1.3 : 1.0

    const basePadding = Math.max(6, Math.min(16, height * 0.015))
    const baseGap = Math.max(8, Math.min(20, height * 0.025))
    const titleFontSize = Math.max(20, Math.min(36, width * 0.045)) * pcScaleFactor
    const buttonFontSize = Math.max(14, Math.min(20, height * 0.025)) * pcScaleFactor

    return {
      titleFontSize,
      buttonFontSize,
      basePadding,
      baseGap,
      availableWidth: width,
      availableHeight: height,
      isPortrait,
      pcScaleFactor
    }
  }, [dimensions.width, dimensions.height])

  const handleCreateGame = () => {
    // Clear game state for a fresh game
    setGameState(prev => ({
      ...prev,
      selectedCategories: [],
      gameName: '',
      team1: { name: '', score: 0 },
      team2: { name: '', score: 0 },
      usedQuestions: new Set(),
      currentQuestion: null,
      gameHistory: [],
      assignedQuestions: {}
    }))
    navigate('/categories')
  }

  return (
    <div className="h-screen bg-[#f7f2e6] flex flex-col">
      {/* Header */}
      <Header title="الصفحة الرئيسية" />

      {/* Main Content */}
      <div className="flex-1 flex items-start justify-center overflow-auto pt-8 px-4">
        <div className="text-center w-full">

          {/* Large Logo */}
          <div style={{ marginBottom: `${responsiveStyles.baseGap * 0.5}px` }}>
            {settings.largeLogo ? (
              <img
                src={settings.largeLogo}
                alt="شعار اللعبة"
                className="mx-auto object-cover"
                fetchPriority="high"
                style={{
                  maxWidth: (() => {
                    const baseSize = settings.largeLogoSize === 'small' ? 384 :
                                   settings.largeLogoSize === 'large' ? 640 : 512;
                    const maxWidth = responsiveStyles.availableWidth < 480 ? responsiveStyles.availableWidth * 0.9 :
                                   responsiveStyles.availableWidth < 768 ? responsiveStyles.availableWidth * 0.8 :
                                   responsiveStyles.availableWidth * 0.6;
                    return Math.min(baseSize, maxWidth) + 'px';
                  })(),
                  height: 'auto'
                }}
              />
            ) : (
              <div
                className="mx-auto flex items-center justify-center"
                style={{
                  maxWidth: (() => {
                    const baseSize = settings.largeLogoSize === 'small' ? 384 :
                                   settings.largeLogoSize === 'large' ? 640 : 512;
                    const maxWidth = responsiveStyles.availableWidth < 480 ? responsiveStyles.availableWidth * 0.9 :
                                   responsiveStyles.availableWidth < 768 ? responsiveStyles.availableWidth * 0.8 :
                                   responsiveStyles.availableWidth * 0.6;
                    return Math.min(baseSize, maxWidth) + 'px';
                  })(),
                  height: 'auto'
                }}
              >
                <span className="text-white font-bold text-6xl">🎯</span>
              </div>
            )}
          </div>

          {/* Slogan */}
          <div style={{ marginBottom: `${responsiveStyles.baseGap * 3}px` }}>
            <h1
              className="font-bold text-gray-800 mb-4 leading-relaxed"
              style={{ fontSize: `${responsiveStyles.titleFontSize}px` }}
            >
              {settings.slogan || 'مرحباً بكم في لعبة المعرفة'}
            </h1>
            <p
              className="text-gray-600"
              style={{
                fontSize: `${Math.max(14, responsiveStyles.titleFontSize * 0.5)}px`,
                marginBottom: `${responsiveStyles.baseGap * 2}px`
              }}
            >
              اختبر معلوماتك واستمتع بالتحدي مع الأصدقاء والعائلة
            </p>
          </div>

          {/* Create Game Button */}
          <button
            onClick={handleCreateGame}
            className="bg-gradient-to-r from-red-600 to-red-700 hover:from-red-700 hover:to-red-800 text-white font-bold rounded-2xl shadow-lg transform transition-all duration-200 hover:scale-105 hover:shadow-xl"
            style={{
              fontSize: `${responsiveStyles.buttonFontSize}px`,
              padding: `${responsiveStyles.basePadding * 1.5}px ${responsiveStyles.basePadding * 3}px`
            }}
          >
            إنشاء لعبة جديدة
          </button>

          {/* Additional Info */}
          <div style={{ marginTop: `${responsiveStyles.baseGap * 2}px` }}>
            <p
              className="text-gray-500"
              style={{ fontSize: `${Math.max(12, responsiveStyles.buttonFontSize * 0.7)}px` }}
            >
              اضغط على "إنشاء لعبة جديدة" للبدء في إعداد لعبتك
            </p>
          </div>

          {/* Leaderboard */}
          {(
            <div style={{ marginTop: `${responsiveStyles.baseGap * 3}px` }}>
              <h3
                className="font-bold text-gray-800 mb-4"
                style={{ fontSize: `${Math.max(16, responsiveStyles.titleFontSize * 0.6)}px` }}
              >
                🏆 لوحة المتصدرين
              </h3>

              <div
                className="bg-white/80 backdrop-blur-sm rounded-xl shadow-lg overflow-hidden mx-auto"
                style={{
                  maxWidth: responsiveStyles.availableWidth > 768 ? '600px' : '100%'
                }}
              >
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead className="bg-red-600 text-white">
                      <tr>
                        <th
                          className="px-4 py-2 text-center font-bold"
                          style={{ fontSize: `${Math.max(12, responsiveStyles.buttonFontSize * 0.8)}px` }}
                        >
                          عدد الألعاب
                        </th>
                        <th
                          className="px-4 py-2 text-right font-bold"
                          style={{ fontSize: `${Math.max(12, responsiveStyles.buttonFontSize * 0.8)}px` }}
                        >
                          اسم اللاعب
                        </th>
                        <th
                          className="px-4 py-2 text-center font-bold"
                          style={{ fontSize: `${Math.max(12, responsiveStyles.buttonFontSize * 0.8)}px` }}
                        >
                          الترتيب
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {leaderboardLoading ? (
                        <tr>
                          <td
                            colSpan="3"
                            className="px-4 py-8 text-center text-gray-500"
                            style={{ fontSize: `${Math.max(12, responsiveStyles.buttonFontSize * 0.8)}px` }}
                          >
                            جاري تحميل البيانات...
                          </td>
                        </tr>
                      ) : leaderboard.length > 0 ? (
                        leaderboard.map((player, index) => (
                          <tr key={index} className={index % 2 === 0 ? 'bg-gray-50' : 'bg-white'}>
                            <td
                              className="px-4 py-2 text-center text-gray-600 font-bold"
                              style={{ fontSize: `${Math.max(12, responsiveStyles.buttonFontSize * 0.8)}px` }}
                            >
                              {player.gamesPlayed}
                            </td>
                            <td
                              className="px-4 py-2 text-right text-gray-800"
                              style={{ fontSize: `${Math.max(12, responsiveStyles.buttonFontSize * 0.8)}px` }}
                            >
                              {player.name}
                            </td>
                            <td
                              className="px-4 py-2 text-center font-bold"
                              style={{ fontSize: `${Math.max(12, responsiveStyles.buttonFontSize * 0.8)}px` }}
                            >
                              {index + 1 === 1 && '🥇'}
                              {index + 1 === 2 && '🥈'}
                              {index + 1 === 3 && '🥉'}
                              {index + 1 > 3 && (index + 1)}
                            </td>
                          </tr>
                        ))
                      ) : (
                        <tr>
                          <td
                            colSpan="3"
                            className="px-4 py-8 text-center text-gray-500"
                            style={{ fontSize: `${Math.max(12, responsiveStyles.buttonFontSize * 0.8)}px` }}
                          >
                            لا توجد بيانات لعرضها حاليًا. ابدأ لعبتك الأولى!
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* Tips & How to Play Section - Collapsible */}
          <div style={{ marginTop: `${responsiveStyles.baseGap * 3}px` }}>
            <div className="flex justify-center">
              <button
                onClick={() => setTipsExpanded(!tipsExpanded)}
                className="text-right bg-white/60 hover:bg-white/80 backdrop-blur-sm rounded-xl shadow-lg p-4 mb-4 transition-all duration-200"
                style={{
                  width: responsiveStyles.availableWidth > 768 ? 'auto' : '100%',
                  minWidth: responsiveStyles.availableWidth > 768 ? '400px' : 'auto',
                  maxWidth: responsiveStyles.availableWidth > 768 ? '600px' : '100%'
                }}
              >
                <div className="flex items-center justify-between" style={{ gap: '20px' }}>
                  <h3
                    className="font-bold text-gray-800"
                    style={{ fontSize: `${Math.max(16, responsiveStyles.titleFontSize * 0.6)}px` }}
                  >
                    💡 نصائح وطريقة اللعب
                  </h3>
                  <span
                    className="text-gray-600 font-bold transform transition-transform duration-200"
                    style={{
                      fontSize: `${Math.max(14, responsiveStyles.buttonFontSize)}px`,
                      transform: tipsExpanded ? 'rotate(180deg)' : 'rotate(0deg)'
                    }}
                  >
                    ▼
                  </span>
                </div>
              </button>
            </div>

            {tipsExpanded && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 animate-fadeIn">
                {/* Game Rules Card */}
                <div className="bg-white/80 backdrop-blur-sm rounded-xl shadow-lg p-4">
                  <h4
                    className="font-bold text-red-600 mb-3 flex items-center gap-2"
                    style={{ fontSize: `${Math.max(14, responsiveStyles.buttonFontSize * 0.9)}px` }}
                  >
                    📋 قواعد اللعبة
                  </h4>
                  <ul className="space-y-2 text-gray-700" style={{ fontSize: `${Math.max(12, responsiveStyles.buttonFontSize * 0.8)}px` }}>
                    <li>• اختر الفئات التي تريد اللعب بها</li>
                    <li>• كل فئة تحتوي على 6 أسئلة (سهل، متوسط، صعب)</li>
                    <li>• 200 نقطة للأسئلة السهلة، 400 للمتوسطة، 600 للصعبة</li>
                    <li>• الفريق الذي يحصل على أعلى نقاط يفوز</li>
                  </ul>
                </div>

                {/* Tips Card */}
                <div className="bg-white/80 backdrop-blur-sm rounded-xl shadow-lg p-4">
                  <h4
                    className="font-bold text-green-600 mb-3 flex items-center gap-2"
                    style={{ fontSize: `${Math.max(14, responsiveStyles.buttonFontSize * 0.9)}px` }}
                  >
                    🎯 نصائح للفوز
                  </h4>
                  <ul className="space-y-2 text-gray-700" style={{ fontSize: `${Math.max(12, responsiveStyles.buttonFontSize * 0.8)}px` }}>
                    <li>• ابدأ بالأسئلة السهلة لبناء الثقة</li>
                    <li>• استخدم القوى الخاصة في الوقت المناسب</li>
                    <li>• ناقش مع فريقك قبل الإجابة</li>
                    <li>• لا تتسرع في الإجابة على الأسئلة الصعبة</li>
                  </ul>
                </div>

                {/* Perks Explanation Card */}
                <div className="bg-white/80 backdrop-blur-sm rounded-xl shadow-lg p-4">
                  <h4
                    className="font-bold text-purple-600 mb-3 flex items-center gap-2"
                    style={{ fontSize: `${Math.max(14, responsiveStyles.buttonFontSize * 0.9)}px` }}
                  >
                    ⚡ القوى الخاصة
                  </h4>
                  <ul className="space-y-2 text-gray-700" style={{ fontSize: `${Math.max(12, responsiveStyles.buttonFontSize * 0.8)}px` }}>
                    <li>• <span className="font-bold inline-flex items-center gap-1"><svg width={Math.max(18, responsiveStyles.buttonFontSize * 1.2)} height={Math.max(18, responsiveStyles.buttonFontSize * 1.2)} viewBox="0 0 24 24" fill="currentColor" className="inline"><path d="M12 2L15.09 8.26L22 9.27L17 14.14L18.18 21.02L12 17.77L5.82 21.02L7 14.14L2 9.27L8.91 8.26L12 2Z"/><text x="12" y="15" textAnchor="middle" fontSize="10" fill="white" fontWeight="bold">2</text></svg>:</span> مضاعفة النقاط للسؤال التالي</li>
                    <li>• <span className="font-bold inline-flex items-center gap-1"><svg width={Math.max(18, responsiveStyles.buttonFontSize * 1.2)} height={Math.max(18, responsiveStyles.buttonFontSize * 1.2)} viewBox="0 0 24 24" fill="currentColor" className="inline"><path d="M6.62 10.79c1.44 2.83 3.76 5.14 6.59 6.59l2.2-2.2c.27-.27.67-.36 1.02-.24 1.12.37 2.33.57 3.57.57.55 0 1 .45 1 1V20c0 .55-.45 1-1 1-9.39 0-17-7.61-17-17 0-.55.45-1 1-1h3.5c.55 0 1 .45 1 1 0 1.25.2 2.45.57 3.57.11.35.03.74-.25 1.02l-2.2 2.2z"/></svg>:</span> اتصال بصديق للمساعدة</li>
                    <li>• <span className="font-bold inline-flex items-center gap-1"><svg width={Math.max(18, responsiveStyles.buttonFontSize * 1.2)} height={Math.max(18, responsiveStyles.buttonFontSize * 1.2)} viewBox="0 0 24 24" fill="currentColor" className="inline"><path d="M15.5 14h-.79l-.28-.27C15.41 12.59 16 11.11 16 9.5 16 5.91 13.09 3 9.5 3S3 5.91 3 9.5 5.91 16 9.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z"/></svg>:</span> البحث عن معلومات إضافية</li>
                    <li className="text-red-600">• كل قوة تُستخدم مرة واحدة فقط</li>
                  </ul>
                </div>

                {/* Scoring System Card */}
                <div className="bg-white/80 backdrop-blur-sm rounded-xl shadow-lg p-4">
                  <h4
                    className="font-bold text-blue-600 mb-3 flex items-center gap-2"
                    style={{ fontSize: `${Math.max(14, responsiveStyles.buttonFontSize * 0.9)}px` }}
                  >
                    🏆 نظام النقاط
                  </h4>
                  <ul className="space-y-2 text-gray-700" style={{ fontSize: `${Math.max(12, responsiveStyles.buttonFontSize * 0.8)}px` }}>
                    <li>• <span className="font-bold text-green-600">إجابة صحيحة:</span> تكسب النقاط المحددة</li>
                    <li>• <span className="font-bold text-red-600">إجابة خاطئة:</span> لا تكسب نقاط</li>
                    <li>• <span className="font-bold text-purple-600 inline-flex items-center gap-1">مع قوة <svg width={Math.max(18, responsiveStyles.buttonFontSize * 1.2)} height={Math.max(18, responsiveStyles.buttonFontSize * 1.2)} viewBox="0 0 24 24" fill="currentColor" className="inline"><path d="M12 2L15.09 8.26L22 9.27L17 14.14L18.18 21.02L12 17.77L5.82 21.02L7 14.14L2 9.27L8.91 8.26L12 2Z"/><text x="12" y="15" textAnchor="middle" fontSize="10" fill="white" fontWeight="bold">2</text></svg>:</span> مضاعفة النقاط</li>
                    <li>• النقاط لا تقل عن الصفر أبداً</li>
                  </ul>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

export default Index