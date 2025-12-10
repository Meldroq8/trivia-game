import { useState, useEffect, useRef, useMemo, useCallback } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import Header from '../components/Header'
import AuthModal from '../components/AuthModal'
import { useAuth } from '../hooks/useAuth'
import { debounce } from '../utils/debounce'
import { devLog, devWarn, prodError } from '../utils/devLog'

function Index({ setGameState }) {
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const { user, isAuthenticated, loading: authLoading, getAppSettings, getPublicLeaderboard, updateLeaderboard } = useAuth()
  const [showAuthModal, setShowAuthModal] = useState(false)
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
  const [showPasswordResetSuccess, setShowPasswordResetSuccess] = useState(false)

  // Set page title
  useEffect(() => {
    document.title = 'راس براس'
  }, [])

  // Check for password reset success
  useEffect(() => {
    if (searchParams.get('passwordReset') === 'success') {
      setShowPasswordResetSuccess(true)
      // Clear the param from URL
      searchParams.delete('passwordReset')
      setSearchParams(searchParams, { replace: true })

      // Hide message after 5 seconds
      setTimeout(() => {
        setShowPasswordResetSuccess(false)
      }, 5000)
    }
  }, [searchParams, setSearchParams])

  useEffect(() => {
    const updateDimensions = () => {
      setDimensions({ width: window.innerWidth, height: window.innerHeight })
    }

    updateDimensions()
    window.addEventListener('resize', updateDimensions)
    return () => window.removeEventListener('resize', updateDimensions)
  }, [])

  useEffect(() => {
    const loadSettings = async (retryCount = 0) => {
      try {
        const appSettings = await getAppSettings()
        if (appSettings && Object.keys(appSettings).length > 0) {
          setSettings(appSettings)
          // Cache settings for instant loading next time
          localStorage.setItem('app_settings', JSON.stringify(appSettings))
          devLog('✅ Settings loaded successfully')
        } else if (retryCount < 3) {
          // Retry after a delay if settings are empty (App Check might not be ready)
          devLog(`⏳ Settings empty, retrying in ${(retryCount + 1) * 500}ms...`)
          setTimeout(() => loadSettings(retryCount + 1), (retryCount + 1) * 500)
          return
        }

        // Load leaderboard data in background (non-blocking)
        loadLeaderboard()
      } catch (error) {
        prodError('Error loading settings:', error)
        // Retry on error (App Check might not be ready yet)
        if (retryCount < 3) {
          devLog(`⏳ Settings error, retrying in ${(retryCount + 1) * 500}ms...`)
          setTimeout(() => loadSettings(retryCount + 1), (retryCount + 1) * 500)
        }
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
    // Detect phone landscape: landscape orientation + small height (phones typically have height < 450px in landscape)
    // Excludes tablets which have larger heights in landscape
    const isPhoneLandscape = !isPortrait && height <= 450

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
      pcScaleFactor,
      isPhoneLandscape
    }
  }, [dimensions.width, dimensions.height])

  const handleCreateGame = () => {
    // Check if user is authenticated before proceeding
    if (!isAuthenticated) {
      // Show auth modal instead of navigating
      setShowAuthModal(true)
      return
    }

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
    <div className="h-screen bg-[#f7f2e6] dark:bg-slate-900 flex flex-col hive-pattern">
      {/* Header */}
      <div className="relative z-20">
        <Header title="" />
      </div>

      {/* Main Content */}
      <div className={`flex-1 flex items-start justify-center overflow-auto px-4 relative z-10 ${responsiveStyles.isPhoneLandscape ? 'pt-2' : 'pt-8'}`}>
        <div className={`w-full ${responsiveStyles.isPhoneLandscape ? '' : 'text-center'}`}>

          {/* Password Reset Success Message */}
          {showPasswordResetSuccess && (
            <div className="mx-auto mb-6 max-w-md animate-fadeIn">
              <div className="bg-green-100 border-2 border-green-500 text-green-800 px-6 py-4 rounded-xl shadow-lg">
                <div className="flex items-center gap-3">
                  <span className="text-3xl">✅</span>
                  <div className="text-right flex-1">
                    <p className="font-bold text-lg">تم بنجاح!</p>
                    <p className="text-sm">تم تغيير كلمة المرور. يمكنك الآن تسجيل الدخول بكلمة المرور الجديدة.</p>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Phone Landscape Layout: Side by side - Button left, Logo right */}
          {responsiveStyles.isPhoneLandscape ? (
            <div className="flex items-center justify-between gap-6 h-full px-6">
              {/* Button and text - centered in its area */}
              <div className="flex-1 flex flex-col items-center justify-center gap-3">
                {settings.showSlogan !== false && (
                  <h1
                    className="font-bold text-gray-800 dark:text-gray-100 text-center leading-tight"
                    style={{ fontSize: `${responsiveStyles.titleFontSize * 0.8}px` }}
                  >
                    {settings.slogan || 'مرحباً بكم في لعبة المعرفة'}
                  </h1>
                )}
                <button
                  onClick={handleCreateGame}
                  className="bg-gradient-to-r from-red-600 to-red-700 hover:from-red-700 hover:to-red-800 text-white font-bold rounded-2xl shadow-lg transform transition-all duration-200 hover:scale-105 hover:shadow-xl"
                  style={{
                    fontSize: `${Math.max(16, responsiveStyles.buttonFontSize * 1.1)}px`,
                    padding: `${responsiveStyles.basePadding * 1.5}px ${responsiveStyles.basePadding * 3}px`
                  }}
                >
                  إنشاء لعبة جديدة
                </button>
                <p
                  className="text-gray-600 dark:text-gray-300 text-center"
                  style={{ fontSize: `${Math.max(14, responsiveStyles.buttonFontSize * 0.85)}px` }}
                >
                  اضغط على "إنشاء لعبة جديدة" للبدء في إعداد لعبتك
                </p>
              </div>

              {/* Logo on right (in RTL this appears on left visually) */}
              <div className="flex-shrink-0">
                {settings.largeLogo ? (
                  <img
                    src={settings.largeLogo}
                    alt="شعار اللعبة"
                    className="object-contain"
                    fetchPriority="high"
                    style={{
                      maxHeight: `${responsiveStyles.availableHeight * 0.65}px`,
                      maxWidth: `${responsiveStyles.availableWidth * 0.35}px`,
                      width: 'auto',
                      height: 'auto'
                    }}
                  />
                ) : (
                  <div className="flex items-center justify-center">
                    <span className="text-white font-bold text-4xl">🎯</span>
                  </div>
                )}
              </div>
            </div>
          ) : (
            <>
              {/* Normal Layout: Vertical stacked */}
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
              {settings.showSlogan !== false && (
                <div style={{ marginBottom: `${responsiveStyles.baseGap * 3}px` }}>
                  <h1
                    className="font-bold text-gray-800 dark:text-gray-100 mb-4 leading-relaxed"
                    style={{ fontSize: `${responsiveStyles.titleFontSize}px` }}
                  >
                    {settings.slogan || 'مرحباً بكم في لعبة المعرفة'}
                  </h1>
                  <p
                    className="text-gray-600 dark:text-gray-300"
                    style={{
                      fontSize: `${Math.max(14, responsiveStyles.titleFontSize * 0.5)}px`,
                      marginBottom: `${responsiveStyles.baseGap * 2}px`
                    }}
                  >
                    اختبر معلوماتك واستمتع بالتحدي مع الأصدقاء والعائلة
                  </p>
                </div>
              )}

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
                  className="text-gray-500 dark:text-gray-400"
                  style={{ fontSize: `${Math.max(12, responsiveStyles.buttonFontSize * 0.7)}px` }}
                >
                  اضغط على "إنشاء لعبة جديدة" للبدء في إعداد لعبتك
                </p>
              </div>
            </>
          )}

          {/* Leaderboard */}
          {(
            <div className="text-center" style={{ marginTop: `${responsiveStyles.isPhoneLandscape ? responsiveStyles.baseGap : responsiveStyles.baseGap * 3}px` }}>
              <h3
                className="font-bold text-gray-800 dark:text-gray-100 mb-4"
                style={{ fontSize: `${Math.max(16, responsiveStyles.titleFontSize * 0.6)}px` }}
              >
                🏆 لوحة المتصدرين
              </h3>

              <div
                className="bg-white/80 dark:bg-slate-800/90 backdrop-blur-sm rounded-xl shadow-lg overflow-hidden mx-auto"
                style={{
                  maxWidth: responsiveStyles.availableWidth > 768 ? '600px' : '100%'
                }}
              >
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead className="bg-red-600 dark:bg-red-700 text-white">
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
                            className="px-4 py-8 text-center text-gray-500 dark:text-gray-400"
                            style={{ fontSize: `${Math.max(12, responsiveStyles.buttonFontSize * 0.8)}px` }}
                          >
                            جاري تحميل البيانات...
                          </td>
                        </tr>
                      ) : leaderboard.length > 0 ? (
                        leaderboard.map((player, index) => (
                          <tr key={index} className={index % 2 === 0 ? 'bg-gray-50 dark:bg-slate-700' : 'bg-white dark:bg-slate-800'}>
                            <td
                              className="px-4 py-2 text-center text-gray-600 dark:text-gray-300 font-bold"
                              style={{ fontSize: `${Math.max(12, responsiveStyles.buttonFontSize * 0.8)}px` }}
                            >
                              {player.gamesPlayed}
                            </td>
                            <td
                              className="px-4 py-2 text-right text-gray-800 dark:text-gray-200"
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
                            className="px-4 py-8 text-center text-gray-500 dark:text-gray-400"
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
                className="text-right bg-white/60 dark:bg-slate-800/80 hover:bg-white/80 dark:hover:bg-slate-700/90 backdrop-blur-sm rounded-xl shadow-lg p-4 mb-4 transition-all duration-200"
                style={{
                  width: responsiveStyles.availableWidth > 768 ? 'auto' : '100%',
                  minWidth: responsiveStyles.availableWidth > 768 ? '300px' : 'auto',
                  maxWidth: responsiveStyles.availableWidth > 768 ? '450px' : '100%'
                }}
              >
                <div className="flex items-center justify-between" style={{ gap: '20px' }}>
                  <h3
                    className="font-bold text-gray-800 dark:text-gray-100"
                    style={{ fontSize: `${Math.max(16, responsiveStyles.titleFontSize * 0.6)}px` }}
                  >
                    💡 نصائح وطريقة اللعب
                  </h3>
                  <span
                    className="text-gray-600 dark:text-gray-300 font-bold transform transition-transform duration-200"
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
                <div className="bg-white/80 dark:bg-slate-800/90 backdrop-blur-sm rounded-xl shadow-lg p-4">
                  <h4
                    className="font-bold text-red-600 dark:text-red-400 mb-3 flex items-center gap-2"
                    style={{ fontSize: `${Math.max(14, responsiveStyles.buttonFontSize * 0.9)}px` }}
                  >
                    📋 قواعد اللعبة
                  </h4>
                  <ul className="space-y-2 text-right text-gray-700 dark:text-gray-300" style={{ fontSize: `${Math.max(12, responsiveStyles.buttonFontSize * 0.8)}px` }}>
                    <li>• اختر الفئات التي تريد اللعب بها</li>
                    <li>• كل فئة تحتوي على 6 أسئلة (سهل، متوسط، صعب)</li>
                    <li>• 200 نقطة للأسئلة السهلة، 400 للمتوسطة، 600 للصعبة</li>
                    <li>• الفريق الذي يحصل على أعلى نقاط يفوز</li>
                  </ul>
                </div>

                {/* Tips Card */}
                <div className="bg-white/80 dark:bg-slate-800/90 backdrop-blur-sm rounded-xl shadow-lg p-4">
                  <h4
                    className="font-bold text-green-600 dark:text-green-400 mb-3 flex items-center gap-2"
                    style={{ fontSize: `${Math.max(14, responsiveStyles.buttonFontSize * 0.9)}px` }}
                  >
                    🎯 نصائح للفوز
                  </h4>
                  <ul className="space-y-2 text-right text-gray-700 dark:text-gray-300" style={{ fontSize: `${Math.max(12, responsiveStyles.buttonFontSize * 0.8)}px` }}>
                    <li>• ابدأ بالأسئلة السهلة لبناء الثقة</li>
                    <li>• استخدم القوى الخاصة في الوقت المناسب</li>
                    <li>• ناقش مع فريقك قبل الإجابة</li>
                    <li>• لا تتسرع في الإجابة على الأسئلة الصعبة</li>
                  </ul>
                </div>

                {/* Perks Explanation Card */}
                <div className="bg-white/80 dark:bg-slate-800/90 backdrop-blur-sm rounded-xl shadow-lg p-4">
                  <h4
                    className="font-bold text-purple-600 dark:text-purple-400 mb-3 flex items-center gap-2"
                    style={{ fontSize: `${Math.max(14, responsiveStyles.buttonFontSize * 0.9)}px` }}
                  >
                    ⚡ وسائل المساعدة
                  </h4>
                  <ul className="space-y-2 text-right text-gray-700 dark:text-gray-300" style={{ fontSize: `${Math.max(12, responsiveStyles.buttonFontSize * 0.8)}px` }}>
                    <li>• <span className="font-bold inline-flex items-center gap-1"><svg width={Math.max(18, responsiveStyles.buttonFontSize * 1.2)} height={Math.max(18, responsiveStyles.buttonFontSize * 1.2)} viewBox="0 0 24 24" fill="currentColor"><path d="M12 2L15.09 8.26L22 9.27L17 14.14L18.18 21.02L12 17.77L5.82 21.02L7 14.14L2 9.27L8.91 8.26L12 2Z"/><text x="12" y="15" textAnchor="middle" fontSize="10" fill="white" fontWeight="bold">2</text></svg> دبلها:</span> ضعف النقاط للسؤال الحالي</li>
                    <li>• <span className="font-bold inline-flex items-center gap-1"><svg width={Math.max(18, responsiveStyles.buttonFontSize * 1.2)} height={Math.max(18, responsiveStyles.buttonFontSize * 1.2)} viewBox="0 0 24 24" fill="currentColor"><path d="M6.62 10.79c1.44 2.83 3.76 5.14 6.59 6.59l2.2-2.2c.27-.27.67-.36 1.02-.24 1.12.37 2.33.57 3.57.57.55 0 1 .45 1 1V20c0 .55-.45 1-1 1-9.39 0-17-7.61-17-17 0-.55.45-1 1-1h3.5c.55 0 1 .45 1 1 0 1.25.2 2.45.57 3.57.11.35.03.74-.25 1.02l-2.2 2.2z"/></svg> اتصال بصديق:</span> مساعدة من صديق لمدة 30 ثانية</li>
                    <li>• <span className="font-bold inline-flex items-center gap-1"><svg width={Math.max(18, responsiveStyles.buttonFontSize * 1.2)} height={Math.max(18, responsiveStyles.buttonFontSize * 1.2)} viewBox="0 0 24 24" fill="currentColor"><path d="M15.5 14h-.79l-.28-.27C15.41 12.59 16 11.11 16 9.5 16 5.91 13.09 3 9.5 3S3 5.91 3 9.5 5.91 16 9.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z"/></svg> جوجلها:</span> البحث في جوجل لمدة 15 ثانية</li>
                    <li>• <span className="font-bold inline-flex items-center gap-1"><svg width={Math.max(18, responsiveStyles.buttonFontSize * 1.2)} height={Math.max(18, responsiveStyles.buttonFontSize * 1.2)} viewBox="0 0 24 24" fill="currentColor"><rect x="3" y="3" width="18" height="18" rx="3"/><circle cx="7" cy="7" r="1.5" fill="white"/><circle cx="17" cy="7" r="1.5" fill="white"/><circle cx="7" cy="17" r="1.5" fill="white"/><circle cx="17" cy="17" r="1.5" fill="white"/><circle cx="12" cy="12" r="1.5" fill="white"/></svg> يا تصيب يا تخيب:</span> 3 أضعاف إن صحيح، وخصم ضعف النقاط إن خطأ</li>
                    <li>• <span className="font-bold inline-flex items-center gap-1"><svg width={Math.max(18, responsiveStyles.buttonFontSize * 1.2)} height={Math.max(18, responsiveStyles.buttonFontSize * 1.2)} viewBox="0 0 72 72" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2"><path d="m52.62 31.13 1.8-22.18c-0.3427-4.964-6.779-5.02-7.227-0.026l-2.42 17.36c-0.3 2.179-1.278 3.962-2.166 3.962s-1.845-1.785-2.126-3.967l-2.231-17.34c-0.8196-5.278-7.439-4.322-7.037 0.0011l2.527 21.03"/><path d="m53.63 50.08c0 9.872-8.02 16.88-17.89 16.88"/><path d="m43.74 47.29v-2.333c0-1.1-1.789-2.2-3.976-2.441l-1.049-0.117c-2.187-0.242-3.976-1.851-3.976-3.774s1.8-3.334 4-3.334h10c2.201-0.0448 4.057 1.632 4.235 3.826l0.657 11.21"/><path d="m37.96 50.36c1.63-1.48 3.624-2.5 5.777-2.958"/><path d="m18.53 52.1c1.142 8.6 8.539 14.98 17.21 14.86 9.667 0 17.89-6.833 17.89-16.88"/><path d="m31.75 49.72c0 1.258-0.6709 2.42-1.76 3.048s-2.431 0.6288-3.52 0-1.76-1.791-1.76-3.048v-15.96c0-1.258 0.6709-2.42 1.76-3.048s2.431-0.6288 3.52 0c1.089 0.6288 1.76 1.791 1.76 3.049z"/><path d="m24.71 44.94c0 1.262-0.6709 2.427-1.76 3.058s-2.431 0.6308-3.52 0c-1.089-0.6308-1.76-1.796-1.76-3.058v-7.937c0-1.262 0.6709-2.427 1.76-3.058 1.089-0.6308 2.431-0.6308 3.52 0s1.76 1.796 1.76 3.058z"/></svg> جوابين:</span> إعطاء إجابتين بدلاً من واحدة</li>
                    <li>• <span className="font-bold inline-flex items-center gap-1"><svg width={Math.max(18, responsiveStyles.buttonFontSize * 1.2)} height={Math.max(18, responsiveStyles.buttonFontSize * 1.2)} viewBox="0 0 24 24" fill="currentColor"><path d="M6 2V22H8V2H6M10 2V22H12V2H10M14 2V22H16V2H14M18 2V22H20V2H18M2 2V4H22V2H2M2 20V22H22V20H2Z"/></svg> السجن:</span> سجن لاعب من الفريق الآخر</li>
                  </ul>
                </div>

                {/* Scoring System Card */}
                <div className="bg-white/80 dark:bg-slate-800/90 backdrop-blur-sm rounded-xl shadow-lg p-4">
                  <h4
                    className="font-bold text-blue-600 dark:text-blue-400 mb-3 flex items-center gap-2"
                    style={{ fontSize: `${Math.max(14, responsiveStyles.buttonFontSize * 0.9)}px` }}
                  >
                    🏆 نظام النقاط
                  </h4>
                  <ul className="space-y-2 text-right text-gray-700 dark:text-gray-300" style={{ fontSize: `${Math.max(12, responsiveStyles.buttonFontSize * 0.8)}px` }}>
                    <li>• <span className="font-bold text-green-600 dark:text-green-400">إجابة صحيحة:</span> تكسب النقاط (200، 400، أو 600)</li>
                    <li>• <span className="font-bold text-red-600 dark:text-red-400">إجابة خاطئة:</span> لا تكسب نقاط</li>
                    <li>• <span className="font-bold text-purple-600 dark:text-purple-400">مع دبلها:</span> ضعف النقاط</li>
                    <li>• <span className="font-bold text-orange-600 dark:text-orange-400">مع يا تصيب يا تخيب:</span> 3 أضعاف إن صحيح، أو خصم ضعفين إن خطأ</li>
                    <li>• <span className="font-bold text-blue-600 dark:text-blue-400">مع جوابين:</span> إحدى الإجابتين صحيحة تكفي</li>
                    <li>• <span className="font-bold text-gray-700 dark:text-gray-300">محد جاوب:</span> لا نقاط لأي فريق</li>
                    <li className="font-bold text-amber-600 dark:text-amber-400">• تحذير: النقاط يمكن أن تصبح سالبة مع يا تصيب يا تخيب!</li>
                  </ul>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Auth Modal for Sign In/Sign Up */}
      <AuthModal
        isOpen={showAuthModal}
        onClose={() => setShowAuthModal(false)}
      />
    </div>
  )
}

export default Index