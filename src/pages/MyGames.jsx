import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'
import Header from '../components/Header'
import { GameDataLoader } from '../utils/gameDataLoader'
import { devLog, devWarn, prodError } from '../utils/devLog'

function MyGames({ gameState, setGameState }) {
  const [games, setGames] = useState([])
  const [loading, setLoading] = useState(true)
  const [selectedGame, setSelectedGame] = useState(null)
  const [showResumeModal, setShowResumeModal] = useState(false)
  const [showDeleteModal, setShowDeleteModal] = useState(false)
  const [gameToDelete, setGameToDelete] = useState(null)
  const [indexError, setIndexError] = useState(null)
  const [dimensions, setDimensions] = useState({
    width: typeof window !== 'undefined' ? window.innerWidth : 375,
    height: typeof window !== 'undefined' ? window.innerHeight : 667
  })
  const [categories, setCategories] = useState([])
  const [categoriesLoaded, setCategoriesLoaded] = useState(false)
  const navigate = useNavigate()
  const { isAuthenticated, user, getUserGames, deleteGame, loading: authLoading } = useAuth()

  // Set page title
  useEffect(() => {
    document.title = 'راس براس - ألعابي'
  }, [])

  // Responsive scaling system
  useEffect(() => {
    const updateDimensions = () => {
      setDimensions({ width: window.innerWidth, height: window.innerHeight })
    }

    updateDimensions()
    window.addEventListener('resize', updateDimensions)
    return () => window.removeEventListener('resize', updateDimensions)
  }, [])

  const getResponsiveStyles = () => {
    const { width } = dimensions

    // Button font size based on screen width
    const buttonFontSize = Math.max(12, Math.min(16, width * 0.022))

    return {
      buttonFontSize
    }
  }

  // Redirect if not authenticated (but wait for auth loading to complete)
  useEffect(() => {
    if (!authLoading && !isAuthenticated) {
      navigate('/')
      return
    }
  }, [authLoading, isAuthenticated, navigate])

  // Load categories and games in PARALLEL for faster loading
  useEffect(() => {
    // Don't load data until auth check is complete and user is authenticated
    if (authLoading || !isAuthenticated || !user) return

    const loadAllData = async () => {
      setLoading(true)
      setIndexError(null)

      // Pending game sync is handled by App.jsx with proper delay
      // Just clear any stale pending games that don't belong to this user
      try {
        const pendingGameStr = localStorage.getItem('pending_game')
        if (pendingGameStr) {
          const pendingGame = JSON.parse(pendingGameStr)
          if (pendingGame.userId !== user?.uid) {
            devLog('🗑️ Removing stale pending game from different user')
            localStorage.removeItem('pending_game')
          }
        }
      } catch (e) {
        localStorage.removeItem('pending_game')
      }

      // Check for cached categories first
      const CACHE_KEY = 'trivia_categories_cache'
      const CACHE_EXPIRY_KEY = 'trivia_categories_cache_expiry'
      const CACHE_DURATION = 30 * 60 * 1000 // 30 minutes

      let cachedCategories = null
      try {
        const cached = sessionStorage.getItem(CACHE_KEY)
        const expiry = sessionStorage.getItem(CACHE_EXPIRY_KEY)
        if (cached && expiry && Date.now() < parseInt(expiry, 10)) {
          cachedCategories = JSON.parse(cached)
          devLog('📦 Using cached categories:', cachedCategories.length, 'categories')
        }
      } catch (e) {
        devWarn('⚠️ Cache read error:', e)
      }

      // If we have cached categories, use them immediately and skip loading
      if (cachedCategories) {
        setCategories(cachedCategories)
        setCategoriesLoaded(true)
      }

      // Load categories (if not cached) and games in parallel
      const [categoriesResult, gamesResult] = await Promise.allSettled([
        // Load categories (skip if cached)
        cachedCategories
          ? Promise.resolve(cachedCategories)
          : GameDataLoader.loadGameData().then(gameData => {
              if (gameData && gameData.categories) {
                setCategories(gameData.categories)
                // Cache categories
                try {
                  sessionStorage.setItem(CACHE_KEY, JSON.stringify(gameData.categories))
                  sessionStorage.setItem(CACHE_EXPIRY_KEY, String(Date.now() + CACHE_DURATION))
                  devLog('💾 Cached categories for 30 minutes')
                } catch (e) {
                  devWarn('⚠️ Cache write error:', e)
                }
                devLog('📂 Loaded categories for MyGames:', gameData.categories)
              }
              return gameData?.categories || []
            }),
        // Load games
        getUserGames().then(userGames => {
          devLog('🎮 Loading user games...')
          devLog('📖 Loaded games:', userGames)

          // Deduplicate games by ID (remove duplicates from Firebase rate limiting)
          const uniqueGames = userGames.reduce((acc, game) => {
            const key = game.id || `${game.gameName}_${new Date(game.createdAt).getTime()}`
            if (!acc.has(key)) {
              acc.set(key, game)
            }
            return acc
          }, new Map())

          // Sort games by date (newest first) and calculate progress
          const sortedGames = Array.from(uniqueGames.values())
            .filter(game => game.gameData && game.gameData.selectedCategories)
            .map(game => {
              let usedQuestionsSize = 0
              if (game.gameData.usedQuestions) {
                if (Array.isArray(game.gameData.usedQuestions)) {
                  usedQuestionsSize = game.gameData.usedQuestions.length
                } else if (typeof game.gameData.usedQuestions === 'object') {
                  usedQuestionsSize = Object.keys(game.gameData.usedQuestions).length
                } else if (game.gameData.usedQuestions.size !== undefined) {
                  usedQuestionsSize = game.gameData.usedQuestions.size
                }
              }

              const totalQuestions = game.gameData.selectedCategories?.length * 6 || 0

              return {
                ...game,
                totalQuestions,
                answeredQuestions: usedQuestionsSize,
                isComplete: game.isComplete || (usedQuestionsSize >= totalQuestions && totalQuestions > 0)
              }
            })
            .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))

          setGames(sortedGames)
          return sortedGames
        })
      ])

      // Handle errors
      if (categoriesResult.status === 'rejected') {
        prodError('❌ Error loading categories:', categoriesResult.reason)
      }
      if (gamesResult.status === 'rejected') {
        prodError('❌ Error loading games:', gamesResult.reason)
        if (gamesResult.reason?.message?.includes('requires an index')) {
          setIndexError(gamesResult.reason)
        }
      }

      setCategoriesLoaded(true)
      setLoading(false)
    }

    loadAllData()
    // Note: updateGameStats intentionally excluded from deps to prevent infinite loop
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authLoading, isAuthenticated, user, getUserGames])

  const handleGameSelect = (game) => {
    devLog('🎯 Game selected:', game)
    devLog('🎯 Setting selected game and showing modal...')
    setSelectedGame(game)
    setShowResumeModal(true)
    devLog('🎯 Modal should now be visible')
  }

  const handleResumeGame = () => {
    devLog('🔄 Resuming game:', selectedGame)

    if (!selectedGame?.gameData) {
      prodError('❌ No game data to resume')
      return
    }

    try {
      // Restore the exact game state
      const savedGameData = selectedGame.gameData

      // Convert usedQuestions to Set (Firebase stores as array or object)
      let usedQuestions = new Set()
      if (savedGameData.usedQuestions) {
        if (Array.isArray(savedGameData.usedQuestions)) {
          usedQuestions = new Set(savedGameData.usedQuestions)
        } else if (typeof savedGameData.usedQuestions === 'object') {
          // Firebase might store Set as object, convert keys to Set
          usedQuestions = new Set(Object.keys(savedGameData.usedQuestions))
        } else if (savedGameData.usedQuestions instanceof Set) {
          usedQuestions = savedGameData.usedQuestions
        }
      }

      const restoredGameState = {
        ...savedGameData,
        usedQuestions: usedQuestions,
        // CRITICAL: Ensure assigned questions are preserved for exact continuation
        assignedQuestions: savedGameData.assignedQuestions || {},
        // Track that this is a continuation of an existing game
        gameId: selectedGame.id, // Add the game ID for updating
        isGameContinuation: true, // Flag to indicate this is not a new game
        // Ensure all required properties exist - merge with defaults to handle old saves
        perkUsage: {
          team1: {
            double: savedGameData.perkUsage?.team1?.double || 0,
            phone: savedGameData.perkUsage?.team1?.phone || 0,
            search: savedGameData.perkUsage?.team1?.search || 0,
            risk: savedGameData.perkUsage?.team1?.risk || 0,
            prison: savedGameData.perkUsage?.team1?.prison || 0,
            twoAnswers: savedGameData.perkUsage?.team1?.twoAnswers || 0
          },
          team2: {
            double: savedGameData.perkUsage?.team2?.double || 0,
            phone: savedGameData.perkUsage?.team2?.phone || 0,
            search: savedGameData.perkUsage?.team2?.search || 0,
            risk: savedGameData.perkUsage?.team2?.risk || 0,
            prison: savedGameData.perkUsage?.team2?.prison || 0,
            twoAnswers: savedGameData.perkUsage?.team2?.twoAnswers || 0
          }
        },
        activatedPerks: {
          doublePoints: savedGameData.activatedPerks?.doublePoints || { active: false, team: null },
          riskPoints: savedGameData.activatedPerks?.riskPoints || { active: false, team: null },
          twoAnswers: savedGameData.activatedPerks?.twoAnswers || { active: false, team: null },
          prison: savedGameData.activatedPerks?.prison || { active: false, team: null, targetTeam: null }
        },
        // Preserve selected perks
        selectedPerks: savedGameData.selectedPerks || []
      }

      devLog('📋 Restored game state:', restoredGameState)
      devLog('🔒 Assigned questions for continuation:', restoredGameState.assignedQuestions)
      devLog('✅ Used questions restored:', Array.from(usedQuestions))
      setGameState(restoredGameState)

      // Navigate to game board to continue
      navigate('/game')
    } catch (error) {
      prodError('❌ Error resuming game:', error)
    }

    setShowResumeModal(false)
  }

  const handleRestartGame = () => {
    devLog('🆕 Restarting game with exact same questions:', selectedGame)

    if (!selectedGame?.gameData?.selectedCategories) {
      prodError('❌ No categories to restart with')
      return
    }

    try {
      // Create fresh game state with same categories AND same assigned questions
      const freshGameState = {
        gameName: selectedGame.gameData.gameName || 'لعبة الأسئلة',
        team1: {
          name: selectedGame.gameData.team1?.name || 'الفريق الأول',
          score: 0
        },
        team2: {
          name: selectedGame.gameData.team2?.name || 'الفريق الثاني',
          score: 0
        },
        currentTurn: 'team1',
        selectedCategories: [...selectedGame.gameData.selectedCategories], // Same categories
        usedQuestions: new Set(), // Reset questions (will use same questions but start over)
        currentQuestion: null,
        gameHistory: [], // Reset history
        // CRITICAL: Preserve the exact same assigned questions for payment model
        assignedQuestions: selectedGame.gameData.assignedQuestions || {},
        perkUsage: {
          team1: { double: 0, phone: 0, search: 0, risk: 0, prison: 0, twoAnswers: 0 },
          team2: { double: 0, phone: 0, search: 0, risk: 0, prison: 0, twoAnswers: 0 }
        },
        activatedPerks: {
          doublePoints: { active: false, team: null },
          riskPoints: { active: false, team: null },
          twoAnswers: { active: false, team: null },
          prison: { active: false, team: null, targetTeam: null }
        },
        // Preserve selected perks from original game
        selectedPerks: selectedGame.gameData.selectedPerks || [],
        // Track that this is updating an existing game (prevent duplicate creation)
        gameId: selectedGame.id, // Add the game ID for updating
        isGameContinuation: true // Flag to indicate this updates the existing game, not create new
      }

      devLog('🆕 Fresh game state with SAME assigned questions:', freshGameState)
      devLog('🔒 Assigned questions preserved for payment model:', freshGameState.assignedQuestions)
      devLog('🆔 Game ID for update (prevents duplicate):', freshGameState.gameId)
      setGameState(freshGameState)

      // Navigate to game board to start fresh with same questions
      navigate('/game')
    } catch (error) {
      prodError('❌ Error restarting game:', error)
    }

    setShowResumeModal(false)
  }

  const handleDeleteClick = (e, game) => {
    e.stopPropagation() // Prevent triggering the game select
    devLog('🗑️ Delete clicked for game:', game)
    setGameToDelete(game)
    setShowDeleteModal(true)
  }

  const handleDeleteConfirm = async () => {
    if (!gameToDelete) return

    try {
      devLog('🗑️ Deleting game:', gameToDelete.id)
      await deleteGame(gameToDelete.id)

      // Remove the deleted game from the local state
      setGames(prevGames => prevGames.filter(game => game.id !== gameToDelete.id))

      devLog('✅ Game deleted successfully')
    } catch (error) {
      prodError('❌ Error deleting game:', error)
      alert('حدث خطأ أثناء حذف اللعبة. حاول مرة أخرى.')
    } finally {
      setShowDeleteModal(false)
      setGameToDelete(null)
    }
  }

  const handleDeleteCancel = () => {
    setShowDeleteModal(false)
    setGameToDelete(null)
  }

  const formatDate = (dateString) => {
    return new Date(dateString).toLocaleDateString('ar-EG', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    })
  }

  const styles = getResponsiveStyles()

  const getProgressColor = (progress) => {
    if (progress === 100) return 'text-green-600'
    if (progress >= 50) return 'text-yellow-600'
    return 'text-red-600'
  }

  // Consolidated loading and auth checks - wait for both games AND categories to load
  if (authLoading || loading || !categoriesLoaded) {
    return (
      <div className="min-h-screen w-full flex items-center justify-center bg-[#f7f2e6] dark:bg-slate-900">
        <div className="bg-white/95 dark:bg-slate-800/95 backdrop-blur-sm rounded-3xl shadow-2xl p-6 text-center">
          <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-red-600 mx-auto mb-3"></div>
          <h1 className="text-lg font-bold text-red-800 dark:text-red-400">{authLoading ? 'جاري التحقق من تسجيل الدخول...' : 'جاري تحميل ألعابك...'}</h1>
        </div>
      </div>
    )
  }

  // Redirect handled in useEffect, but don't show content if not authenticated
  if (!isAuthenticated) {
    return null
  }

  return (
    <div className="min-h-screen bg-[#f7f2e6] dark:bg-slate-900">
      {/* Header */}
      <Header title="ألعابي" />

      {/* Content */}
      <div className="container mx-auto px-4 py-8 max-w-6xl">
        {indexError ? (
          <div className="text-center py-12">
            <div className="text-6xl mb-4">⚠️</div>
            <h2 className="text-2xl font-bold text-red-700 dark:text-red-400 mb-4">مطلوب إعداد قاعدة البيانات</h2>
            <div className="bg-red-50 dark:bg-slate-800 border border-red-200 dark:border-slate-700 rounded-lg p-6 max-w-2xl mx-auto mb-6">
              <p className="text-gray-700 dark:text-gray-300 mb-4 leading-relaxed">
                لعرض تاريخ الألعاب، نحتاج إلى إنشاء فهرس في قاعدة البيانات. هذا إعداد لمرة واحدة فقط.
              </p>
              <div className="text-sm text-gray-600 dark:text-gray-400 mb-4">
                <strong>الخطوات:</strong>
                <ol className="list-decimal list-inside mt-2 space-y-1 text-right">
                  <li>انقر على الرابط أدناه</li>
                  <li>سجل الدخول إلى Firebase Console</li>
                  <li>انقر على "Create Index" لإنشاء الفهرس</li>
                  <li>انتظر بضع دقائق حتى ينتهي الإنشاء</li>
                  <li>ارجع إلى هذه الصفحة وحدثها</li>
                </ol>
              </div>
              <a
                href={indexError.message.match(/https:\/\/[^\s]+/)?.[0]}
                target="_blank"
                rel="noopener noreferrer"
                className="bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 px-6 rounded-xl transition-colors inline-block"
              >
                إنشاء الفهرس المطلوب
              </a>
            </div>
            <div className="space-x-4">
              <button
                onClick={() => window.location.reload()}
                className="bg-green-600 hover:bg-green-700 text-white font-bold py-3 px-6 rounded-xl transition-colors"
              >
                تحديث الصفحة
              </button>
              <button
                onClick={() => navigate('/categories')}
                className="bg-red-600 hover:bg-red-700 text-white font-bold py-3 px-6 rounded-xl transition-colors"
              >
                ابدأ لعبة جديدة
              </button>
            </div>
          </div>
        ) : games.length === 0 ? (
          <div className="text-center py-12">
            <div className="text-6xl mb-4">🎮</div>
            <h2 className="text-2xl font-bold text-gray-700 dark:text-gray-100 mb-2">لا توجد ألعاب محفوظة</h2>
            <p className="text-gray-600 dark:text-gray-400 mb-6">ابدأ لعبة جديدة لترى تاريخ ألعابك هنا</p>
            <button
              onClick={() => navigate('/categories')}
              className="bg-red-600 hover:bg-red-700 text-white font-bold py-3 px-6 rounded-xl transition-colors"
            >
              ابدأ لعبة جديدة
            </button>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="mb-6">
              <h2 className="text-xl font-bold text-gray-800 dark:text-gray-100 mb-2">تاريخ الألعاب ({games.length})</h2>
              <p className="text-gray-600 dark:text-gray-400">انقر على أي لعبة للمتابعة من حيث توقفت أو البدء من جديد</p>
            </div>

            {games.map((game, index) => {
              const progress = Math.round((game.answeredQuestions / game.totalQuestions) * 100) || 0

              return (
                <div
                  key={game.id || index}
                  onClick={() => handleGameSelect(game)}
                  className="bg-white dark:bg-slate-800 rounded-lg p-6 shadow-md hover:shadow-lg transition-shadow cursor-pointer border border-gray-200 dark:border-slate-700"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-4 mb-2">
                        <h3 className="text-lg font-bold text-gray-800 dark:text-gray-100">
                          {game.gameData.gameName || `لعبة #{index + 1}`}
                        </h3>
                        <span className={`text-sm font-medium ${getProgressColor(progress)}`}>
                          {game.isComplete ? '✅ مكتملة' : '⏳ قيد التقدم'}
                        </span>
                      </div>

                      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm text-gray-600 dark:text-gray-400">
                        <div>
                          <span className="font-medium">التاريخ:</span>
                          <div>{formatDate(game.createdAt)}</div>
                        </div>
                        <div>
                          <span className="font-medium">الفرق:</span>
                          <div>{game.gameData.team1?.name} مقابل {game.gameData.team2?.name}</div>
                        </div>
                        <div>
                          <span className="font-medium">النتيجة:</span>
                          <div>{game.gameData.team1?.score || 0} - {game.gameData.team2?.score || 0}</div>
                        </div>
                        <div>
                          <span className="font-medium">التقدم:</span>
                          <div>{game.answeredQuestions} / {game.totalQuestions} سؤال ({progress}%)</div>
                        </div>
                      </div>

                      {/* Categories */}
                      <div className="mt-3">
                        <span className="text-sm font-medium text-gray-600 dark:text-gray-400">الفئات: </span>
                        <div className="flex flex-wrap gap-2 mt-1">
                          {game.gameData.selectedCategories?.map((categoryId) => {
                            // Map category IDs to proper Arabic names
                            const getCategoryName = (id) => {
                              const category = categories.find(cat => cat.id === id)
                              if (category) {
                                return category.name
                              }
                              if (id === 'mystery') {
                                return 'الفئة الغامضة'
                              }
                              return id.replace(/_/g, ' ')
                            }

                            return (
                              <span
                                key={categoryId}
                                className="bg-red-100 text-red-800 text-xs font-medium px-2 py-1 rounded-full"
                              >
                                {getCategoryName(categoryId)}
                              </span>
                            )
                          })}
                        </div>
                      </div>

                      {/* Progress bar */}
                      <div className="mt-4">
                        <div className="bg-gray-200 dark:bg-slate-700 rounded-full h-2">
                          <div
                            className={`h-2 rounded-full transition-all duration-300 ${
                              progress === 100 ? 'bg-green-500' :
                              progress >= 50 ? 'bg-yellow-500' : 'bg-red-500'
                            }`}
                            style={{ width: `${progress}%` }}
                          ></div>
                        </div>
                      </div>
                    </div>

                    <div className="mr-4 flex items-center gap-2">
                      <button
                        onClick={(e) => handleDeleteClick(e, game)}
                        className="p-2 text-red-500 hover:text-red-700 hover:bg-red-50 rounded-lg transition-colors"
                        title="حذف اللعبة"
                      >
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                        </svg>
                      </button>
                      <div className="text-gray-400">
                        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                        </svg>
                      </div>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Resume/Restart Modal */}
      {showResumeModal && selectedGame && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-slate-800 rounded-2xl p-6 max-w-md w-full">
            <div className="text-center mb-6">
              <div className="text-4xl mb-3">🎮</div>
              <h3 className="text-xl font-bold text-gray-800 dark:text-gray-100 mb-2">
                {selectedGame.gameData.gameName || `لعبة #{games.indexOf(selectedGame) + 1}`}
              </h3>
              <p className="text-gray-600 dark:text-gray-400">
                {selectedGame.answeredQuestions} / {selectedGame.totalQuestions} سؤال تم الإجابة عليه
              </p>
            </div>

            <div className="space-y-3">
              {selectedGame.answeredQuestions < selectedGame.totalQuestions && (
                <button
                  onClick={handleResumeGame}
                  className="w-full bg-green-600 hover:bg-green-700 text-white font-bold py-3 px-6 rounded-xl transition-colors"
                >
                  🔄 المتابعة من حيث توقفت
                </button>
              )}

              <button
                onClick={handleRestartGame}
                className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 px-6 rounded-xl transition-colors"
              >
                🆕 البدء من جديد بنفس الفئات
              </button>

              <button
                onClick={() => setShowResumeModal(false)}
                className="w-full bg-gray-500 hover:bg-gray-600 text-white font-bold py-3 px-6 rounded-xl transition-colors"
              >
                إلغاء
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {showDeleteModal && gameToDelete && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-slate-800 rounded-2xl p-6 max-w-md w-full">
            <div className="text-center mb-6">
              <div className="text-4xl mb-3">🗑️</div>
              <h3 className="text-xl font-bold text-gray-800 dark:text-gray-100 mb-2">
                تأكيد الحذف
              </h3>
              <p className="text-gray-600 dark:text-gray-400">
                هل أنت متأكد من حذف "{gameToDelete.gameData.gameName || `لعبة #{games.indexOf(gameToDelete) + 1}`}"؟
              </p>
              <p className="text-sm text-red-600 mt-2">
                لن يمكن التراجع عن هذا الإجراء
              </p>
            </div>

            <div className="space-y-3">
              <button
                onClick={handleDeleteConfirm}
                className="w-full bg-red-600 hover:bg-red-700 text-white font-bold py-3 px-6 rounded-xl transition-colors"
              >
                🗑️ نعم، احذف اللعبة
              </button>

              <button
                onClick={handleDeleteCancel}
                className="w-full bg-gray-500 hover:bg-gray-600 text-white font-bold py-3 px-6 rounded-xl transition-colors"
              >
                إلغاء
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default MyGames