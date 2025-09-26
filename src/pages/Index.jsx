import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import HeaderAuth from '../components/HeaderAuth'
import LogoDisplay from '../components/LogoDisplay'
import { useAuth } from '../hooks/useAuth'

function Index() {
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
  const headerRef = useRef(null)
  const [headerHeight, setHeaderHeight] = useState(0)
  const [tipsExpanded, setTipsExpanded] = useState(false)

  useEffect(() => {
    const updateDimensions = () => {
      setDimensions({ width: window.innerWidth, height: window.innerHeight })

      if (headerRef.current) {
        const headerRect = headerRef.current.getBoundingClientRect()
        setHeaderHeight(headerRect.height)
      }
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
        console.error('Error loading settings:', error)
        // Don't block UI on settings error - continue showing cached settings
      }
    }

    // Load data in background without blocking UI
    loadSettings()
  }, [getAppSettings])

  const loadLeaderboard = async () => {
    setLeaderboardLoading(true)
    try {
      // Try to load existing public leaderboard
      let leaderboardData = await getPublicLeaderboard()

      // If no data exists, create initial leaderboard automatically
      if (leaderboardData.length === 0) {
        leaderboardData = await updateLeaderboard()
      }

      setLeaderboard(leaderboardData)
    } catch (error) {
      console.error('Error loading leaderboard:', error)
      setLeaderboard([])
    } finally {
      setLeaderboardLoading(false)
    }
  }

  // Perfect scaling system similar to GameSetup but scaled down
  const getResponsiveStyles = () => {
    const { width, height } = dimensions
    const isPortrait = height > width

    // PC Auto-scaling: Reduced scaling for Index page
    const isPC = width >= 1024 && height >= 768
    const pcScaleFactor = isPC ? 1.3 : 1.0 // Reduced from 2.0 to 1.3

    const actualHeaderHeight = headerHeight || (isPortrait ? 60 : 80)

    // Calculate available space below header
    const availableHeight = height - actualHeaderHeight
    const availableWidth = width

    // Content padding and margins - smaller for Index
    const basePadding = Math.max(6, Math.min(16, availableHeight * 0.015)) // Reduced
    const baseGap = Math.max(8, Math.min(20, availableHeight * 0.025)) // Reduced

    // Font sizing - smaller for Index
    const headerFontSize = Math.max(14, Math.min(24, availableWidth * 0.03)) * pcScaleFactor // Reduced
    const titleFontSize = Math.max(20, Math.min(36, availableWidth * 0.045)) * pcScaleFactor // Reduced
    const buttonFontSize = Math.max(14, Math.min(20, availableHeight * 0.025)) * pcScaleFactor // Reduced

    return {
      headerFontSize,
      titleFontSize,
      buttonFontSize,
      basePadding,
      baseGap,
      availableHeight,
      availableWidth,
      isPortrait,
      pcScaleFactor
    }
  }

  const handleCreateGame = () => {
    navigate('/game-setup')
  }


  const styles = getResponsiveStyles()

  return (
    <div className="h-screen bg-[#f7f2e6] flex flex-col">
      {/* Red Header Bar - Fixed Height */}
      <div
        ref={headerRef}
        className="bg-red-600 text-white flex-shrink-0 overflow-visible"
        style={{
          padding: `${styles.basePadding}px`,
          height: `${Math.max(60, styles.basePadding * 4)}px`
        }}
      >
        <div className="flex justify-between items-center h-full">
          <div className="flex items-center">
            <LogoDisplay />
          </div>

          <div className="flex-1 text-center">
            <h1 className="font-bold text-center" style={{ fontSize: `${styles.headerFontSize}px` }}>
              الصفحة الرئيسية
            </h1>
          </div>

          <div className="flex items-center" style={{ gap: `${styles.baseGap}px` }}>
            <HeaderAuth fontSize={styles.headerFontSize} />
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div
        className="flex-1 flex items-start justify-center overflow-auto pt-8"
        style={{
          padding: `${styles.basePadding}px`,
          minHeight: `${styles.availableHeight}px`
        }}
      >
        <div className="text-center w-full"
             style={{ padding: `${styles.basePadding}px` }}>

          {/* Large Logo */}
          <div style={{ marginBottom: `${styles.baseGap * 0.5}px` }}>
            {settings.largeLogo ? (
              <img
                src={settings.largeLogo}
                alt="شعار اللعبة"
                className="mx-auto object-cover"
                style={{
                  maxWidth: (() => {
                    const baseSize = settings.largeLogoSize === 'small' ? 384 :
                                   settings.largeLogoSize === 'large' ? 640 : 512;
                    const maxWidth = styles.availableWidth < 480 ? styles.availableWidth * 0.9 :
                                   styles.availableWidth < 768 ? styles.availableWidth * 0.8 :
                                   styles.availableWidth * 0.6;
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
                    const maxWidth = styles.availableWidth < 480 ? styles.availableWidth * 0.9 :
                                   styles.availableWidth < 768 ? styles.availableWidth * 0.8 :
                                   styles.availableWidth * 0.6;
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
          <div style={{ marginBottom: `${styles.baseGap * 3}px` }}>
            <h1
              className="font-bold text-gray-800 mb-4 leading-relaxed"
              style={{ fontSize: `${styles.titleFontSize}px` }}
            >
              {settings.slogan || 'مرحباً بكم في لعبة المعرفة'}
            </h1>
            <p
              className="text-gray-600"
              style={{
                fontSize: `${Math.max(14, styles.titleFontSize * 0.5)}px`,
                marginBottom: `${styles.baseGap * 2}px`
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
              fontSize: `${styles.buttonFontSize}px`,
              padding: `${styles.basePadding * 1.5}px ${styles.basePadding * 3}px`
            }}
          >
            إنشاء لعبة جديدة
          </button>

          {/* Additional Info */}
          <div style={{ marginTop: `${styles.baseGap * 2}px` }}>
            <p
              className="text-gray-500"
              style={{ fontSize: `${Math.max(12, styles.buttonFontSize * 0.7)}px` }}
            >
              اضغط على "إنشاء لعبة جديدة" للبدء في إعداد لعبتك
            </p>
          </div>

          {/* Leaderboard */}
          {(
            <div style={{ marginTop: `${styles.baseGap * 3}px` }}>
              <h3
                className="font-bold text-gray-800 mb-4"
                style={{ fontSize: `${Math.max(16, styles.titleFontSize * 0.6)}px` }}
              >
                🏆 لوحة المتصدرين
              </h3>

              <div
                className="bg-white/80 backdrop-blur-sm rounded-xl shadow-lg overflow-hidden mx-auto"
                style={{
                  maxWidth: styles.availableWidth > 768 ? '600px' : '100%'
                }}
              >
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead className="bg-red-600 text-white">
                      <tr>
                        <th
                          className="px-4 py-2 text-center font-bold"
                          style={{ fontSize: `${Math.max(12, styles.buttonFontSize * 0.8)}px` }}
                        >
                          عدد الألعاب
                        </th>
                        <th
                          className="px-4 py-2 text-right font-bold"
                          style={{ fontSize: `${Math.max(12, styles.buttonFontSize * 0.8)}px` }}
                        >
                          اسم اللاعب
                        </th>
                        <th
                          className="px-4 py-2 text-center font-bold"
                          style={{ fontSize: `${Math.max(12, styles.buttonFontSize * 0.8)}px` }}
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
                            style={{ fontSize: `${Math.max(12, styles.buttonFontSize * 0.8)}px` }}
                          >
                            جاري تحميل البيانات...
                          </td>
                        </tr>
                      ) : leaderboard.length > 0 ? (
                        leaderboard.map((player, index) => (
                          <tr key={index} className={index % 2 === 0 ? 'bg-gray-50' : 'bg-white'}>
                            <td
                              className="px-4 py-2 text-center text-gray-600 font-bold"
                              style={{ fontSize: `${Math.max(12, styles.buttonFontSize * 0.8)}px` }}
                            >
                              {player.gamesPlayed}
                            </td>
                            <td
                              className="px-4 py-2 text-right text-gray-800"
                              style={{ fontSize: `${Math.max(12, styles.buttonFontSize * 0.8)}px` }}
                            >
                              {player.name}
                            </td>
                            <td
                              className="px-4 py-2 text-center font-bold"
                              style={{ fontSize: `${Math.max(12, styles.buttonFontSize * 0.8)}px` }}
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
                            style={{ fontSize: `${Math.max(12, styles.buttonFontSize * 0.8)}px` }}
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
          <div style={{ marginTop: `${styles.baseGap * 3}px` }}>
            <div className="flex justify-center">
              <button
                onClick={() => setTipsExpanded(!tipsExpanded)}
                className="text-right bg-white/60 hover:bg-white/80 backdrop-blur-sm rounded-xl shadow-lg p-4 mb-4 transition-all duration-200"
                style={{
                  width: styles.availableWidth > 768 ? 'auto' : '100%',
                  minWidth: styles.availableWidth > 768 ? '400px' : 'auto',
                  maxWidth: styles.availableWidth > 768 ? '600px' : '100%'
                }}
              >
                <div className="flex items-center justify-between" style={{ gap: '20px' }}>
                  <h3
                    className="font-bold text-gray-800"
                    style={{ fontSize: `${Math.max(16, styles.titleFontSize * 0.6)}px` }}
                  >
                    💡 نصائح وطريقة اللعب
                  </h3>
                  <span
                    className="text-gray-600 font-bold transform transition-transform duration-200"
                    style={{
                      fontSize: `${Math.max(14, styles.buttonFontSize)}px`,
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
                    style={{ fontSize: `${Math.max(14, styles.buttonFontSize * 0.9)}px` }}
                  >
                    📋 قواعد اللعبة
                  </h4>
                  <ul className="space-y-2 text-gray-700" style={{ fontSize: `${Math.max(12, styles.buttonFontSize * 0.8)}px` }}>
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
                    style={{ fontSize: `${Math.max(14, styles.buttonFontSize * 0.9)}px` }}
                  >
                    🎯 نصائح للفوز
                  </h4>
                  <ul className="space-y-2 text-gray-700" style={{ fontSize: `${Math.max(12, styles.buttonFontSize * 0.8)}px` }}>
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
                    style={{ fontSize: `${Math.max(14, styles.buttonFontSize * 0.9)}px` }}
                  >
                    ⚡ القوى الخاصة
                  </h4>
                  <ul className="space-y-2 text-gray-700" style={{ fontSize: `${Math.max(12, styles.buttonFontSize * 0.8)}px` }}>
                    <li>• <span className="font-bold">×2:</span> مضاعفة النقاط للسؤال التالي</li>
                    <li>• <span className="font-bold">📞:</span> اتصال بصديق للمساعدة</li>
                    <li>• <span className="font-bold">🔍:</span> البحث عن معلومات إضافية</li>
                    <li className="text-red-600">• كل قوة تُستخدم مرة واحدة فقط</li>
                  </ul>
                </div>

                {/* Scoring System Card */}
                <div className="bg-white/80 backdrop-blur-sm rounded-xl shadow-lg p-4">
                  <h4
                    className="font-bold text-blue-600 mb-3 flex items-center gap-2"
                    style={{ fontSize: `${Math.max(14, styles.buttonFontSize * 0.9)}px` }}
                  >
                    🏆 نظام النقاط
                  </h4>
                  <ul className="space-y-2 text-gray-700" style={{ fontSize: `${Math.max(12, styles.buttonFontSize * 0.8)}px` }}>
                    <li>• <span className="font-bold text-green-600">إجابة صحيحة:</span> تكسب النقاط المحددة</li>
                    <li>• <span className="font-bold text-red-600">إجابة خاطئة:</span> تخسر نصف النقاط</li>
                    <li>• <span className="font-bold text-purple-600">مع قوة ×2:</span> مضاعفة النقاط</li>
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