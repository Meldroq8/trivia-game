import { useState, useEffect, useRef, useMemo } from 'react'
import { useNavigate, useSearchParams, useLocation } from 'react-router-dom'
import Header from '../components/Header'
import AuthModal from '../components/AuthModal'
import BackgroundImage from '../components/BackgroundImage'
import { useAuth } from '../hooks/useAuth'
import { AuthService } from '../firebase/authService'
import { GameDataLoader } from '../utils/gameDataLoader'
import { devLog, devWarn, prodError } from '../utils/devLog'

// Perk data for the Perks section
const PERKS_DATA = [
  {
    id: 'double',
    title: 'دبلها',
    description: 'يحصل الفريق على ضعف النقاط إذا أجاب بشكل صحيح',
    icon: (
      <svg width="32" height="32" viewBox="0 0 24 24" fill="currentColor">
        <path d="M12 2L15.09 8.26L22 9.27L17 14.14L18.18 21.02L12 17.77L5.82 21.02L7 14.14L2 9.27L8.91 8.26L12 2Z"/>
        <text x="12" y="15" textAnchor="middle" fontSize="8" fill="#dc2626" fontWeight="bold">2</text>
      </svg>
    ),
    gradient: 'from-[#D4A574] to-[#8B6914]'
  },
  {
    id: 'phone',
    title: 'اتصال بصديق',
    description: 'يمكن للفريق الاتصال بصديق للمساعدة لمدة 30 ثانية',
    icon: (
      <svg width="32" height="32" viewBox="0 0 24 24" fill="currentColor">
        <path d="M6.62 10.79c1.44 2.83 3.76 5.14 6.59 6.59l2.2-2.2c.27-.27.67-.36 1.02-.24 1.12.37 2.33.57 3.57.57.55 0 1 .45 1 1V20c0 .55-.45 1-1 1-9.39 0-17-7.61-17-17 0-.55.45-1 1-1h3.5c.55 0 1 .45 1 1 0 1.25.2 2.45.57 3.57.11.35.03.74-.25 1.02l-2.2 2.2z"/>
      </svg>
    ),
    gradient: 'from-[#2D5A4A] to-[#1A3D2E]'
  },
  {
    id: 'search',
    title: 'جوجلها',
    description: 'يمكن للفريق البحث في جوجل لمدة 15 ثانية',
    icon: (
      <svg width="32" height="32" viewBox="0 0 24 24" fill="currentColor">
        <path d="M15.5 14h-.79l-.28-.27C15.41 12.59 16 11.11 16 9.5 16 5.91 13.09 3 9.5 3S3 5.91 3 9.5 5.91 16 9.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z"/>
      </svg>
    ),
    gradient: 'from-[#34568B] to-[#1E3A5F]'
  },
  {
    id: 'risk',
    title: 'يا تصيب يا تخيب',
    description: '3 أضعاف النقاط إذا صح، وخصم ضعف إذا خطأ',
    icon: (
      <svg width="32" height="32" viewBox="0 0 24 24" fill="currentColor">
        <rect x="3" y="3" width="18" height="18" rx="3"/>
        <circle cx="7" cy="7" r="1.5" fill="#dc2626"/>
        <circle cx="17" cy="7" r="1.5" fill="#dc2626"/>
        <circle cx="7" cy="17" r="1.5" fill="#dc2626"/>
        <circle cx="17" cy="17" r="1.5" fill="#dc2626"/>
        <circle cx="12" cy="12" r="1.5" fill="#dc2626"/>
      </svg>
    ),
    gradient: 'from-[#8B2942] to-[#5C1A2B]'
  },
  {
    id: 'twoAnswers',
    title: 'جوابين',
    description: 'يمكن للفريق إعطاء إجابتين بدلاً من واحدة',
    icon: (
      <svg width="32" height="32" viewBox="0 0 72 72" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="4">
        <path d="m52.62 31.13 1.8-22.18c-0.3427-4.964-6.779-5.02-7.227-0.026l-2.42 17.36c-0.3 2.179-1.278 3.962-2.166 3.962s-1.845-1.785-2.126-3.967l-2.231-17.34c-0.8196-5.278-7.439-4.322-7.037 0.0011l2.527 21.03"/>
        <path d="m53.63 50.08c0 9.872-8.02 16.88-17.89 16.88"/>
        <path d="m43.74 47.29v-2.333c0-1.1-1.789-2.2-3.976-2.441l-1.049-0.117c-2.187-0.242-3.976-1.851-3.976-3.774s1.8-3.334 4-3.334h10c2.201-0.0448 4.057 1.632 4.235 3.826l0.657 11.21"/>
        <path d="m37.96 50.36c1.63-1.48 3.624-2.5 5.777-2.958"/>
        <path d="m18.53 52.1c1.142 8.6 8.539 14.98 17.21 14.86 9.667 0 17.89-6.833 17.89-16.88"/>
        <path d="m31.75 49.72c0 1.258-0.6709 2.42-1.76 3.048s-2.431 0.6288-3.52 0-1.76-1.791-1.76-3.048v-15.96c0-1.258 0.6709-2.42 1.76-3.048s2.431-0.6288 3.52 0c1.089 0.6288 1.76 1.791 1.76 3.049z"/>
        <path d="m24.71 44.94c0 1.262-0.6709 2.427-1.76 3.058s-2.431 0.6308-3.52 0c-1.089-0.6308-1.76-1.796-1.76-3.058v-7.937c0-1.262 0.6709-2.427 1.76-3.058 1.089-0.6308 2.431-0.6308 3.52 0s1.76 1.796 1.76 3.058z"/>
      </svg>
    ),
    gradient: 'from-[#4A6741] to-[#2E4A28]'
  },
  {
    id: 'prison',
    title: 'السجن',
    description: 'سجن لاعب من الفريق الآخر لهذا السؤال',
    icon: (
      <svg width="32" height="32" viewBox="0 0 24 24" fill="currentColor">
        <path d="M6 2V22H8V2H6M10 2V22H12V2H10M14 2V22H16V2H14M18 2V22H20V2H18M2 2V4H22V2H2M2 20V22H22V20H2Z"/>
      </svg>
    ),
    gradient: 'from-[#4A4A4A] to-[#2A2A2A]'
  }
]

function Index({ setGameState }) {
  const navigate = useNavigate()
  const location = useLocation()
  const [searchParams, setSearchParams] = useSearchParams()
  const { user, isAuthenticated, loading: authLoading, getAppSettings, getPublicLeaderboard } = useAuth()
  const [showAuthModal, setShowAuthModal] = useState(false)
  const [settings, setSettings] = useState(() => {
    try {
      const cachedSettings = localStorage.getItem('app_settings')
      return cachedSettings ? JSON.parse(cachedSettings) : {}
    } catch {
      return {}
    }
  })
  const [settingsLoaded, setSettingsLoaded] = useState(() => {
    try {
      return !!localStorage.getItem('app_settings')
    } catch {
      return false
    }
  })
  const [leaderboard, setLeaderboard] = useState([])
  const [leaderboardLoading, setLeaderboardLoading] = useState(false)
  const [categories, setCategories] = useState([])
  const [categoriesLoading, setCategoriesLoading] = useState(true)
  const [showPasswordResetSuccess, setShowPasswordResetSuccess] = useState(false)
  const categoriesScrollRef = useRef(null)

  // Set page title
  useEffect(() => {
    document.title = 'راس براس'
  }, [])

  // Check for password reset success
  useEffect(() => {
    if (searchParams.get('passwordReset') === 'success') {
      setShowPasswordResetSuccess(true)
      searchParams.delete('passwordReset')
      setSearchParams(searchParams, { replace: true })
      setTimeout(() => {
        setShowPasswordResetSuccess(false)
      }, 5000)
    }
  }, [searchParams, setSearchParams])

  // Load settings
  useEffect(() => {
    const loadSettings = async (retryCount = 0) => {
      try {
        const appSettings = await getAppSettings()
        if (appSettings && Object.keys(appSettings).length > 0) {
          setSettings(appSettings)
          setSettingsLoaded(true)
          localStorage.setItem('app_settings', JSON.stringify(appSettings))
          devLog('✅ Settings loaded successfully')
        } else if (retryCount < 3) {
          devLog(`⏳ Settings empty, retrying in ${(retryCount + 1) * 500}ms...`)
          setTimeout(() => loadSettings(retryCount + 1), (retryCount + 1) * 500)
          return
        } else {
          setSettingsLoaded(true)
        }
      } catch (error) {
        prodError('Error loading settings:', error)
        if (retryCount < 3) {
          devLog(`⏳ Settings error, retrying in ${(retryCount + 1) * 500}ms...`)
          setTimeout(() => loadSettings(retryCount + 1), (retryCount + 1) * 500)
        } else {
          setSettingsLoaded(true)
        }
      }
    }
    loadSettings()
  }, [getAppSettings])

  // Load leaderboard with real-time updates
  useEffect(() => {
    devLog('🏆 Setting up real-time leaderboard subscription')
    setLeaderboardLoading(true)
    const unsubscribe = AuthService.subscribeToLeaderboard((leaderboardData) => {
      devLog('📊 Real-time leaderboard update received:', leaderboardData?.length || 0, 'entries')
      setLeaderboard(leaderboardData || [])
      setLeaderboardLoading(false)
    })
    return () => {
      devLog('🏆 Cleaning up leaderboard subscription')
      unsubscribe()
    }
  }, [])

  // Load categories for display
  useEffect(() => {
    const loadCategories = async () => {
      try {
        setCategoriesLoading(true)
        const gameData = await GameDataLoader.loadCategoriesOnly()
        if (gameData && gameData.categories) {
          // Filter out mystery category and hidden categories, limit to 14 for display
          const visibleCategories = gameData.categories
            .filter(cat => cat.id !== 'mystery' && !cat.hidden)
            .slice(0, 14)
          setCategories(visibleCategories)
          devLog('📚 Categories loaded for Index:', visibleCategories.length)
        }
      } catch (error) {
        prodError('Error loading categories:', error)
      } finally {
        setCategoriesLoading(false)
      }
    }
    loadCategories()
  }, [])

  const handleCreateGame = () => {
    if (!isAuthenticated) {
      setShowAuthModal(true)
      return
    }
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

  const handleExploreCategories = () => {
    // Navigate to public category preview page (no auth required)
    navigate('/category-preview')
  }

  // Scroll categories left/right
  const scrollCategories = (direction) => {
    if (categoriesScrollRef.current) {
      const scrollAmount = 300
      categoriesScrollRef.current.scrollBy({
        left: direction === 'left' ? -scrollAmount : scrollAmount,
        behavior: 'smooth'
      })
    }
  }

  // Show loading screen until settings are loaded
  if (!settingsLoaded) {
    return (
      <div className="min-h-screen w-full flex items-center justify-center bg-[#f7f2e6] dark:bg-slate-900">
        <div className="bg-white/95 dark:bg-slate-800/95 backdrop-blur-sm rounded-3xl shadow-2xl p-6 text-center">
          <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-red-600 mx-auto mb-3"></div>
          <h1 className="text-lg font-bold text-red-800 dark:text-red-400">جاري التحميل...</h1>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-[#f7f2e6] dark:bg-slate-900 flex flex-col">
      {/* Header */}
      <div className="relative z-20">
        <Header title="" />
      </div>

      {/* Main Content */}
      <div className="flex-1">
        {/* Password Reset Success Message */}
        {showPasswordResetSuccess && (
          <div className="mx-auto mb-6 max-w-md animate-fadeIn px-4 pt-4">
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

        {/* Hero Section */}
        <section className="relative py-8 pb-16 md:py-12 md:pb-20 px-4">
          <div className="max-w-4xl mx-auto">
            {/* Side-by-side only on landscape phones (sm to md), stacked on portrait and larger screens */}
            <div className="flex flex-col sm:flex-row-reverse sm:items-center sm:justify-between sm:gap-6 lg:flex-col lg:gap-0 text-center">
              {/* Logo - Left side on landscape phones */}
              <div className="mb-6 sm:mb-0 lg:mb-6 sm:flex-shrink-0">
                {settings.largeLogo ? (
                  <img
                    src={settings.largeLogo}
                    alt="شعار اللعبة"
                    className="mx-auto sm:mx-0 lg:mx-auto object-contain max-w-[280px] sm:max-w-[180px] lg:max-w-[420px] h-auto"
                    fetchPriority="high"
                  />
                ) : (
                  <div className="mx-auto sm:mx-0 lg:mx-auto flex items-center justify-center">
                    <span className="text-7xl sm:text-5xl lg:text-7xl">🎯</span>
                  </div>
                )}
              </div>

              {/* Slogan + Button - Right side on landscape phones */}
              <div className="sm:text-right lg:text-center sm:flex-1">
                {/* Slogan */}
                {settings.showSlogan !== false && (
                  <div className="mb-6 sm:mb-4 lg:mb-8">
                    <h1 className="text-2xl sm:text-xl lg:text-4xl font-bold text-gray-800 dark:text-gray-100 mb-2 sm:mb-1 lg:mb-3 leading-relaxed">
                      {settings.slogan || 'مرحباً بكم في لعبة المعرفة'}
                    </h1>
                    <p className="text-base sm:text-sm lg:text-lg text-gray-600 dark:text-gray-300">
                      اختبر معلوماتك واستمتع بالتحدي مع الأصدقاء والعائلة
                    </p>
                  </div>
                )}

                {/* Create Game Button */}
                <button
                  onClick={handleCreateGame}
                  className="bg-gradient-to-r from-red-600 to-red-700 hover:from-red-700 hover:to-red-800 text-white text-lg sm:text-base lg:text-xl font-bold py-4 px-8 sm:px-6 lg:px-12 rounded-2xl shadow-lg transform transition-all duration-200 hover:scale-105 hover:shadow-xl"
                >
                  إنشاء لعبة جديدة
                </button>
              </div>
            </div>
          </div>

          {/* Curved bottom edge */}
          <div className="absolute bottom-0 left-0 right-0 overflow-hidden leading-none">
            <svg
              viewBox="0 0 1440 120"
              preserveAspectRatio="none"
              className="w-full h-12 md:h-16 lg:h-20"
            >
              <path
                className="fill-white dark:fill-slate-800"
                d="M0,40 C480,100 960,0 1440,40 L1440,120 L0,120 Z"
              />
            </svg>
          </div>
        </section>

        {/* Categories Section */}
        <section className="relative py-8 pb-16 md:py-12 md:pb-20 px-4 bg-white dark:bg-slate-800">
          <div className="max-w-6xl mx-auto">
            <div className="mb-6">
              <h2 className="text-xl sm:text-2xl font-bold text-gray-800 dark:text-gray-100">
                فئات راس براس
              </h2>
            </div>

            {/* Categories Grid - 2 rows max */}
            {categoriesLoading ? (
              <div className="flex justify-center py-12">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-red-600"></div>
              </div>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 xl:grid-cols-7 gap-3 sm:gap-4">
                {categories.slice(0, 14).map((category, index) => (
                  <div
                    key={category.id}
                    onClick={handleExploreCategories}
                    className={`cursor-pointer group ${
                      // Hide items beyond 2 rows at each breakpoint
                      index >= 4 ? 'hidden sm:block' : ''
                    } ${
                      index >= 8 ? 'sm:hidden md:block' : ''
                    } ${
                      index >= 10 ? 'md:hidden lg:block' : ''
                    } ${
                      index >= 12 ? 'lg:hidden xl:block' : ''
                    }`}
                  >
                    <div className="relative aspect-[3/4] rounded-2xl overflow-hidden shadow-lg group-hover:shadow-xl transition-all duration-300 group-hover:scale-105 border-2 border-transparent group-hover:border-red-400">
                      <BackgroundImage
                        src={category.imageUrl}
                        size="medium"
                        context="category"
                        categoryId={category.id}
                        className="absolute inset-0 w-full h-full"
                        fallbackGradient="from-amber-400 to-amber-600"
                      />
                      {/* Gradient overlay */}
                      <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent" />
                      {/* Category info */}
                      <div className="absolute bottom-0 left-0 right-0 p-2 sm:p-3">
                        <h3 className="text-white font-bold text-xs sm:text-sm text-center leading-tight drop-shadow-lg">
                          {category.name}
                        </h3>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Explore More Button */}
            <div className="text-center mt-6">
              <button
                onClick={handleExploreCategories}
                className="inline-flex items-center gap-2 bg-white dark:bg-slate-700 text-gray-700 dark:text-gray-200 font-bold py-3 px-6 rounded-xl shadow-md hover:shadow-lg transition-all duration-200 hover:scale-105 border border-gray-200 dark:border-slate-600"
              >
                <span>استكشف المزيد</span>
                <svg className="w-5 h-5 rtl:rotate-180" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 8l4 4m0 0l-4 4m4-4H3" />
                </svg>
              </button>
            </div>
          </div>

          {/* Curved bottom edge */}
          <div className="absolute bottom-0 left-0 right-0 overflow-hidden leading-none">
            <svg
              viewBox="0 0 1440 120"
              preserveAspectRatio="none"
              className="w-full h-12 md:h-16 lg:h-20"
            >
              <path
                className="fill-[#f7f2e6] dark:fill-slate-900"
                d="M0,40 C480,100 960,0 1440,40 L1440,120 L0,120 Z"
              />
            </svg>
          </div>
        </section>

        {/* Leaderboard Section */}
        <section className="relative py-8 pb-16 md:py-12 md:pb-20 px-4">
          <div className="max-w-2xl mx-auto">
            <h2 className="text-xl sm:text-2xl font-bold text-gray-800 dark:text-gray-100 text-center mb-6">
              🏆 لوحة المتصدرين
            </h2>

            <div className="bg-white/90 dark:bg-slate-800/90 backdrop-blur-sm rounded-2xl shadow-xl overflow-hidden border border-gray-200 dark:border-slate-700">
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-gradient-to-r from-red-600 to-red-700 text-white">
                    <tr>
                      <th className="px-4 py-3 text-center font-bold text-sm sm:text-base">عدد الألعاب</th>
                      <th className="px-4 py-3 text-right font-bold text-sm sm:text-base">اسم اللاعب</th>
                      <th className="px-4 py-3 text-center font-bold text-sm sm:text-base">الترتيب</th>
                    </tr>
                  </thead>
                  <tbody>
                    {leaderboardLoading ? (
                      <tr>
                        <td colSpan="3" className="px-4 py-8 text-center text-gray-500 dark:text-gray-400">
                          <div className="flex items-center justify-center gap-2">
                            <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-red-600"></div>
                            <span>جاري تحميل البيانات...</span>
                          </div>
                        </td>
                      </tr>
                    ) : leaderboard.length > 0 ? (
                      leaderboard.map((player, index) => (
                        <tr
                          key={index}
                          className={`${
                            index % 2 === 0
                              ? 'bg-gray-50 dark:bg-slate-700/50'
                              : 'bg-white dark:bg-slate-800/50'
                          } hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors`}
                        >
                          <td className="px-4 py-3 text-center text-gray-600 dark:text-gray-300 font-bold text-sm sm:text-base">
                            {player.gamesPlayed}
                          </td>
                          <td className="px-4 py-3 text-right text-gray-800 dark:text-gray-200 text-sm sm:text-base">
                            {player.name}
                          </td>
                          <td className="px-4 py-3 text-center font-bold text-lg sm:text-xl">
                            {index + 1 === 1 && '🥇'}
                            {index + 1 === 2 && '🥈'}
                            {index + 1 === 3 && '🥉'}
                            {index + 1 > 3 && <span className="text-gray-500 dark:text-gray-400 text-sm sm:text-base">{index + 1}</span>}
                          </td>
                        </tr>
                      ))
                    ) : (
                      <tr>
                        <td colSpan="3" className="px-4 py-8 text-center text-gray-500 dark:text-gray-400">
                          لا توجد بيانات لعرضها حاليًا. ابدأ لعبتك الأولى!
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          {/* Curved bottom edge */}
          <div className="absolute bottom-0 left-0 right-0 overflow-hidden leading-none">
            <svg
              viewBox="0 0 1440 120"
              preserveAspectRatio="none"
              className="w-full h-12 md:h-16 lg:h-20"
            >
              <path
                className="fill-white dark:fill-slate-800"
                d="M0,40 C480,100 960,0 1440,40 L1440,120 L0,120 Z"
              />
            </svg>
          </div>
        </section>

        {/* Perks Section */}
        <section className="relative py-8 pb-16 md:py-12 md:pb-20 px-4 bg-white dark:bg-slate-800">
          <div className="max-w-5xl mx-auto">
            <div className="flex flex-col md:flex-row gap-8 md:gap-16 lg:gap-24 items-center">
              {/* Right side - Title and description */}
              <div className="md:w-2/5 text-center md:text-right">
                <h2 className="text-2xl sm:text-3xl lg:text-4xl font-bold text-gray-800 dark:text-gray-100 mb-4">
                  وسائل المساعدة
                </h2>
                <p className="text-base sm:text-lg text-gray-600 dark:text-gray-400 leading-relaxed">
                  لكل فريق ٣ وسائل مساعدة يختارونها من ٦ وسائل، استخدمهم بذكاء وسيطر على مجريات الجولة!
                </p>
              </div>

              {/* Left side - Perk Cards */}
              <div className="md:w-3/5 space-y-3">
                {PERKS_DATA.map((perk) => (
                  <div
                    key={perk.id}
                    className={`bg-gradient-to-r ${perk.gradient} rounded-xl p-4 shadow-lg hover:shadow-xl transition-all duration-300 hover:scale-[1.02]`}
                  >
                    <div className="flex items-center gap-4">
                      {/* Icon */}
                      <div className="flex-shrink-0 w-12 h-12 bg-white/20 rounded-xl flex items-center justify-center text-white">
                        {perk.icon}
                      </div>
                      {/* Text */}
                      <div className="flex-1 text-right">
                        <h3 className="text-white font-bold text-base sm:text-lg mb-1">
                          {perk.title}
                        </h3>
                        <p className="text-white/90 text-sm leading-relaxed">
                          {perk.description}
                        </p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Curved bottom edge */}
          <div className="absolute bottom-0 left-0 right-0 overflow-hidden leading-none">
            <svg
              viewBox="0 0 1440 120"
              preserveAspectRatio="none"
              className="w-full h-12 md:h-16 lg:h-20"
            >
              <path
                className="fill-slate-800 dark:fill-slate-900"
                d="M0,40 C480,100 960,0 1440,40 L1440,120 L0,120 Z"
              />
            </svg>
          </div>
        </section>

        {/* Footer Section */}
        <footer className="bg-slate-800 dark:bg-slate-900 py-8 px-4">
          <div className="max-w-4xl mx-auto text-center">
            {/* Social Media Icons */}
            <div className="flex items-center justify-center gap-4 mb-6">
              {/* Email */}
              <a
                href="#"
                className="w-10 h-10 bg-slate-700 hover:bg-red-600 rounded-full flex items-center justify-center text-gray-300 hover:text-white transition-all duration-200"
                aria-label="Email"
              >
                <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M20 4H4c-1.1 0-1.99.9-1.99 2L2 18c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zm0 4l-8 5-8-5V6l8 5 8-5v2z"/>
                </svg>
              </a>
              {/* Instagram */}
              <a
                href="#"
                className="w-10 h-10 bg-slate-700 hover:bg-red-600 rounded-full flex items-center justify-center text-gray-300 hover:text-white transition-all duration-200"
                aria-label="Instagram"
              >
                <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zM12 0C8.741 0 8.333.014 7.053.072 2.695.272.273 2.69.073 7.052.014 8.333 0 8.741 0 12c0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98C8.333 23.986 8.741 24 12 24c3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98C15.668.014 15.259 0 12 0zm0 5.838a6.162 6.162 0 100 12.324 6.162 6.162 0 000-12.324zM12 16a4 4 0 110-8 4 4 0 010 8zm6.406-11.845a1.44 1.44 0 100 2.881 1.44 1.44 0 000-2.881z"/>
                </svg>
              </a>
              {/* X (Twitter) */}
              <a
                href="#"
                className="w-10 h-10 bg-slate-700 hover:bg-red-600 rounded-full flex items-center justify-center text-gray-300 hover:text-white transition-all duration-200"
                aria-label="X"
              >
                <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/>
                </svg>
              </a>
              {/* TikTok */}
              <a
                href="#"
                className="w-10 h-10 bg-slate-700 hover:bg-red-600 rounded-full flex items-center justify-center text-gray-300 hover:text-white transition-all duration-200"
                aria-label="TikTok"
              >
                <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M12.525.02c1.31-.02 2.61-.01 3.91-.02.08 1.53.63 3.09 1.75 4.17 1.12 1.11 2.7 1.62 4.24 1.79v4.03c-1.44-.05-2.89-.35-4.2-.97-.57-.26-1.1-.59-1.62-.93-.01 2.92.01 5.84-.02 8.75-.08 1.4-.54 2.79-1.35 3.94-1.31 1.92-3.58 3.17-5.91 3.21-1.43.08-2.86-.31-4.08-1.03-2.02-1.19-3.44-3.37-3.65-5.71-.02-.5-.03-1-.01-1.49.18-1.9 1.12-3.72 2.58-4.96 1.66-1.44 3.98-2.13 6.15-1.72.02 1.48-.04 2.96-.04 4.44-.99-.32-2.15-.23-3.02.37-.63.41-1.11 1.04-1.36 1.75-.21.51-.15 1.07-.14 1.61.24 1.64 1.82 3.02 3.5 2.87 1.12-.01 2.19-.66 2.77-1.61.19-.33.4-.67.41-1.06.1-1.79.06-3.57.07-5.36.01-4.03-.01-8.05.02-12.07z"/>
                </svg>
              </a>
            </div>

            {/* Copyright */}
            <p className="text-gray-400 text-sm">
              Copyright © 2025 راس براس. All rights reserved.
            </p>
          </div>
        </footer>
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
