import { BrowserRouter as Router, Routes, Route, useLocation, useNavigate } from 'react-router-dom'
import { useState, useEffect, useRef, Suspense, lazy } from 'react'
import { usePresentationMode } from './hooks/usePresentationMode'
import { useAuth } from './hooks/useAuth'
import componentPreloader from './utils/componentPreloader'
import ConfirmExitModal from './components/ConfirmExitModal'

import { devLog, devWarn, prodError } from "./utils/devLog"
// Core game flow components - loaded immediately for instant navigation
import Index from './pages/Index'
import CategorySelection from './pages/CategorySelection'
import GameBoard from './pages/GameBoard'
import QuestionView from './pages/QuestionView'
import Results from './pages/Results'
import AnswerViewPage from './pages/AnswerViewPage'
import PasswordReset from './pages/PasswordReset'
import AuthAction from './pages/AuthAction'
import DrawingGame from './pages/DrawingGame'

// Less frequently used components - lazy loaded with background preloading
const Statistics = lazy(() => import('./pages/Statistics'))
const ProfilePage = lazy(() => import('./pages/ProfilePage'))
const MyGames = lazy(() => import('./pages/MyGames'))
const Admin = lazy(() => import('./pages/Admin'))
const Loader = lazy(() => import('./pages/Loader'))

// Reusable loading fallback component
const PageLoading = ({ message = "جاري التحميل..." }) => (
  <div className="min-h-screen w-full flex items-center justify-center bg-[#f7f2e6]">
    <div className="bg-white/95 backdrop-blur-sm rounded-3xl shadow-2xl p-6 text-center">
      <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-red-600 mx-auto mb-3"></div>
      <h1 className="text-lg font-bold text-red-800">{message}</h1>
    </div>
  </div>
)

// Helper function to wrap components with Suspense
const withSuspense = (Component, props = {}, loadingMessage) => (
  <Suspense fallback={<PageLoading message={loadingMessage} />}>
    <Component {...props} />
  </Suspense>
)

// Route tracker component - needs to be inside Router
function RouteTracker({ gameState, setGameState, stateLoaded }) {
  const location = useLocation()
  const navigate = useNavigate()

  // State for custom confirmation modal
  const [showExitModal, setShowExitModal] = useState(false)
  const [exitModalConfig, setExitModalConfig] = useState({ title: '', message: '', onConfirm: null })
  const confirmResolveRef = useRef(null)

  // Update currentRoute in gameState when route changes
  useEffect(() => {
    if (stateLoaded && gameState.currentRoute !== location.pathname) {
      const newState = {
        ...gameState,
        currentRoute: location.pathname
      }

      // Reset the explicit exit flag and game state when user starts a new game flow
      if (location.pathname === '/categories') {
        newState.userExplicitlyExited = false
        newState.usedQuestions = new Set() // Reset used questions for new game
        newState.usedPointValues = new Set() // Reset used point values
        newState.currentQuestion = null
        localStorage.removeItem('trivia_user_exited')
        devLog('🔄 Resetting game state for new game - user at category selection')
      }

      setGameState(prev => ({
        ...prev,
        ...newState
      }))
    }
  }, [location.pathname, stateLoaded])

  // Smart Route Restoration - Restore only on page reload, not new tabs
  useEffect(() => {
    if (!stateLoaded) return

    // Check if this is a new tab (should NOT restore)
    const isNewTab = sessionStorage.getItem('isNewTab') === 'true'

    // Check if user explicitly exited
    const userExited = localStorage.getItem('trivia_user_exited') === 'true' || gameState.userExplicitlyExited

    if (isNewTab) {
      devLog('🆕 New tab detected - skipping route restoration')
      sessionStorage.removeItem('isNewTab') // Clear flag after first check
      return
    }

    if (userExited) {
      devLog('🚪 User explicitly exited - skipping route restoration')
      return
    }

    // Restore route ONLY if we have an active game and valid saved route
    const hasActiveGame = gameState.selectedCategories?.length > 0 ||
                         gameState.gameHistory?.length > 0 ||
                         gameState.team1?.score > 0 ||
                         gameState.team2?.score > 0

    if (hasActiveGame && gameState.currentRoute && gameState.currentRoute !== location.pathname) {
      // Only restore to game pages, not to other pages like admin/profile
      const validGameRoutes = ['/game', '/question', '/answer', '/results']

      if (validGameRoutes.includes(gameState.currentRoute)) {
        devLog('🔄 Restoring route after reload:', gameState.currentRoute)
        navigate(gameState.currentRoute, { replace: true })
      }
    } else {
      devLog('✅ Game state loaded, user can navigate freely')
    }
  }, [stateLoaded])

  // Custom confirm dialog using modal
  const showConfirmDialog = (title, message) => {
    return new Promise((resolve) => {
      setExitModalConfig({ title, message, onConfirm: () => resolve(true) })
      setShowExitModal(true)
      confirmResolveRef.current = resolve
    })
  }

  const handleModalConfirm = () => {
    setShowExitModal(false)
    if (exitModalConfig.onConfirm) {
      exitModalConfig.onConfirm()
    }
  }

  const handleModalCancel = () => {
    setShowExitModal(false)
    if (confirmResolveRef.current) {
      confirmResolveRef.current(false)
    }
  }

  // Prevent accidental tab/window close during game
  useEffect(() => {
    const currentPath = location.pathname

    // Only add protection on game pages
    if (currentPath === '/game' || currentPath === '/question') {
      const handleBeforeUnload = (e) => {
        // Standard way to trigger browser's native confirmation dialog
        e.preventDefault()
        // Chrome requires returnValue to be set
        e.returnValue = 'هل أنت متأكد من الخروج؟ قد تفقد تقدمك في اللعبة.'
        // For older browsers
        return 'هل أنت متأكد من الخروج؟ قد تفقد تقدمك في اللعبة.'
      }

      window.addEventListener('beforeunload', handleBeforeUnload)

      return () => {
        window.removeEventListener('beforeunload', handleBeforeUnload)
      }
    }
  }, [location.pathname])

  // Browser Back Button Control with Warning System
  useEffect(() => {
    const currentPath = location.pathname

    // Only add back button protection on game pages
    if (currentPath === '/game' || currentPath === '/question') {
      let isNavigatingAway = false

      // Add a dummy history state to detect back button
      window.history.pushState({ page: currentPath, timestamp: Date.now() }, '', currentPath)

      const handlePopState = async (event) => {
        devLog('🔄 PopState detected on', currentPath, 'event:', event)

        // Prevent the default behavior
        if (isNavigatingAway) return

        if (currentPath === '/game') {
          devLog('🔄 Back button from gameboard → showing warning')
          const confirmed = await showConfirmDialog(
            'الخروج من اللعبة',
            'هل أنت متأكد من الخروج من اللعبة؟ سيتم إغلاق اللعبة والعودة للصفحة الرئيسية.'
          )
          if (confirmed) {
            devLog('✅ User confirmed exit from gameboard → setting immediate exit flag and redirecting to index')
            isNavigatingAway = true
            window.removeEventListener('popstate', handlePopState)

            // Set immediate localStorage flag to prevent route restoration
            localStorage.setItem('trivia_user_exited', 'true')

            // Set the exit flag and clear route to prevent automatic redirect back
            setGameState(prev => ({
              ...prev,
              currentRoute: '/',
              userExplicitlyExited: true
            }))

            // Navigate immediately - no delay needed
            window.location.href = '/'  // Force navigation to index
          } else {
            devLog('❌ User cancelled exit from gameboard → staying on page')
            // Push current state back
            window.history.pushState({ page: currentPath, timestamp: Date.now() }, '', currentPath)
          }
        } else if (currentPath === '/question') {
          devLog('🔄 Back button from question → showing warning')
          const confirmed = await showConfirmDialog(
            'الخروج من السؤال',
            'هل أنت متأكد من الخروج من السؤال؟ ستعود للوحة اللعبة وسيتم إنهاء الوقت المحدد.'
          )
          if (confirmed) {
            devLog('✅ User confirmed exit from question → updating route and redirecting to gameboard')
            isNavigatingAway = true
            window.removeEventListener('popstate', handlePopState)
            // Update the currentRoute to gameboard to prevent conflicts
            setGameState(prev => ({
              ...prev,
              currentRoute: '/game'
            }))
            navigate('/game', { replace: true })
          } else {
            devLog('❌ User cancelled exit from question → staying on page')
            // Push current state back
            window.history.pushState({ page: currentPath, timestamp: Date.now() }, '', currentPath)
          }
        }
      }

      window.addEventListener('popstate', handlePopState)
      return () => {
        window.removeEventListener('popstate', handlePopState)
      }
    }
  }, [location.pathname, navigate])

  return (
    <>
      <ConfirmExitModal
        isOpen={showExitModal}
        onConfirm={handleModalConfirm}
        onCancel={handleModalCancel}
        title={exitModalConfig.title}
        message={exitModalConfig.message}
      />
    </>
  )
}

function App() {
  const { isPresentationMode } = usePresentationMode()
  const { getGameState, saveGameState, migrateFromLocalStorage, isAuthenticated, loading: authLoading } = useAuth()

  // Detect new tab/window immediately
  if (!sessionStorage.getItem('tabId')) {
    const newTabId = Date.now() + '_' + Math.random()
    sessionStorage.setItem('tabId', newTabId)
    sessionStorage.setItem('isNewTab', 'true')
    devLog('🆕 NEW TAB DETECTED - Will not restore game state')
  }

  // Start background preloading after app loads
  useEffect(() => {
    const preloadComponents = [
      {
        importFn: () => import('./pages/Statistics'),
        name: 'Statistics',
        priority: 'low'
      },
      {
        importFn: () => import('./pages/ProfilePage'),
        name: 'ProfilePage',
        priority: 'high' // Users might access profile more often
      },
      {
        importFn: () => import('./pages/MyGames'),
        name: 'MyGames',
        priority: 'high' // Core feature for users
      },
      {
        importFn: () => import('./pages/Admin'),
        name: 'Admin',
        priority: 'low' // Admin access is rare
      }
    ]

    // Start preloading after 2 seconds to not interfere with initial load
    componentPreloader.startBackgroundPreloading(preloadComponents, 2000)
  }, [])

  // Default game state
  const getDefaultGameState = () => ({
    gameName: 'لعبة الأسئلة',
    team1: { name: 'الفريق الأول', score: 0 },
    team2: { name: 'الفريق الثاني', score: 0 },
    currentTurn: 'team1',
    selectedCategories: [],
    usedQuestions: new Set(),
    currentQuestion: null,
    gameHistory: [],
    assignedQuestions: {},
    perkUsage: {
      team1: { double: 0, phone: 0, search: 0 },
      team2: { double: 0, phone: 0, search: 0 }
    },
    activatedPerks: {
      doublePoints: { active: false, team: null }
    },
    currentRoute: null, // Track which route user should be on
    userExplicitlyExited: false // Flag to track when user confirms exit via back button
  })

  // OPTIMIZATION: Initialize gameState from cache immediately for instant restoration
  const [gameState, setGameState] = useState(() => {
    try {
      const cachedState = sessionStorage.getItem('gameState_cache')
      if (cachedState) {
        const parsedCache = JSON.parse(cachedState)
        // Convert arrays back to Sets
        if (parsedCache.usedQuestions && Array.isArray(parsedCache.usedQuestions)) {
          parsedCache.usedQuestions = new Set(parsedCache.usedQuestions)
        }
        if (parsedCache.usedPointValues && Array.isArray(parsedCache.usedPointValues)) {
          parsedCache.usedPointValues = new Set(parsedCache.usedPointValues)
        }
        devLog('⚡ Initial state loaded from cache')
        return { ...getDefaultGameState(), ...parsedCache }
      }
    } catch (e) {
      devWarn('⚠️ Cache init error:', e)
    }
    return getDefaultGameState()
  })

  // OPTIMIZATION: Initialize stateLoaded to true if cache exists (instant load)
  const [stateLoaded, setStateLoaded] = useState(() => {
    return sessionStorage.getItem('gameState_cache') !== null
  })
  const lastSavedStateRef = useRef(null)
  const saveTimeoutRef = useRef(null)
  const isSavingRef = useRef(false)
  // Check if migration was already completed (persists across page refreshes)
  const [migrationComplete, setMigrationComplete] = useState(() => {
    return localStorage.getItem('migration_complete') === 'true'
  })

  // Load game state from Firebase when user is authenticated
  useEffect(() => {
    const loadGameState = async () => {
      // Wait for auth to complete before loading state
      if (authLoading) return

      // Skip if we already loaded from cache during initialization
      if (stateLoaded && sessionStorage.getItem('gameState_cache')) {
        devLog('ℹ️ State already loaded from cache during init, skipping useEffect load')
        return
      }

      // Check if we're in preview mode - if so, don't load from Firebase
      const previewData = localStorage.getItem('questionPreview') || sessionStorage.getItem('questionPreview')
      if (previewData) {
        devLog('🔍 Preview mode detected, skipping Firebase state load')
        setStateLoaded(true)
        return
      }

      try {
        // OPTIMIZATION: Try to load from sessionStorage cache first for instant restoration
        const cachedState = sessionStorage.getItem('gameState_cache')
        if (cachedState) {
          try {
            const parsedCache = JSON.parse(cachedState)
            // Convert arrays back to Sets
            if (parsedCache.usedQuestions && Array.isArray(parsedCache.usedQuestions)) {
              parsedCache.usedQuestions = new Set(parsedCache.usedQuestions)
            }
            if (parsedCache.usedPointValues && Array.isArray(parsedCache.usedPointValues)) {
              parsedCache.usedPointValues = new Set(parsedCache.usedPointValues)
            }

            const completeState = {
              ...getDefaultGameState(),
              ...parsedCache
            }

            setGameState(completeState)
            setStateLoaded(true)
            devLog('⚡ Instant state restoration from cache (useEffect)')

            // DON'T sync from Firebase in background - cache is the source of truth
            // Firebase is only for persistence across sessions, not for real-time sync
            // The cache is always the most recent state in the current session
            devLog('ℹ️ Using cache as source of truth (Firebase sync disabled to prevent overwrites)')
            return
          } catch (e) {
            devWarn('⚠️ Cache parse error, loading from Firebase:', e)
          }
        }

        // No cache available, load from Firebase (first time)
        setStateLoaded(true) // Mark as loaded immediately to prevent blocking

        // Migrate localStorage data first (one-time operation)
        if (!migrationComplete && isAuthenticated) {
          await migrateFromLocalStorage()
          setMigrationComplete(true)
          localStorage.setItem('migration_complete', 'true')
        }

        // Load saved game state from Firebase
        if (isAuthenticated) {
          const savedState = await getGameState()
          if (savedState) {
            // Convert arrays back to Sets
            if (savedState.usedQuestions && Array.isArray(savedState.usedQuestions)) {
              savedState.usedQuestions = new Set(savedState.usedQuestions)
            }
            if (savedState.usedPointValues && Array.isArray(savedState.usedPointValues)) {
              savedState.usedPointValues = new Set(savedState.usedPointValues)
            }

            // Ensure required properties exist
            const completeState = {
              ...getDefaultGameState(),
              ...savedState
            }

            setGameState(completeState)
            // Cache for next reload
            sessionStorage.setItem('gameState_cache', JSON.stringify(savedState))
          }
        }
      } catch (error) {
        prodError('❌ Error loading game state:', error)
        setStateLoaded(true) // Still mark as loaded to prevent infinite loading
      }
    }

    loadGameState()
  }, [isAuthenticated, authLoading, migrationComplete])

  // Save game state to Firebase whenever it changes (debounced)
  useEffect(() => {
    if (!stateLoaded || !isAuthenticated) return
    if (isSavingRef.current) return // Skip if already saving

    // Don't save to Firebase in preview mode
    const previewData = localStorage.getItem('questionPreview') || sessionStorage.getItem('questionPreview')
    if (previewData) {
      devLog('🔍 Preview mode active, skipping Firebase save')
      return
    }

    // OPTIMIZATION: Save to BOTH sessionStorage AND localStorage for instant restoration + backup
    const stateToSave = {
      ...gameState,
      // Convert Sets to arrays for JSON serialization
      usedQuestions: Array.from(gameState.usedQuestions || []),
      usedPointValues: Array.from(gameState.usedPointValues || [])
    }
    const stateString = JSON.stringify(stateToSave)

    // Save to sessionStorage for instant same-session restoration
    sessionStorage.setItem('gameState_cache', stateString)

    // ALSO save to localStorage as backup in case tab is closed before Firebase saves
    localStorage.setItem('gameState_backup', stateString)

    // Clear any existing timeout
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current)
    }

    saveTimeoutRef.current = setTimeout(async () => {
      try {
        // Only save if state actually changed
        const stateString = JSON.stringify(stateToSave)
        if (lastSavedStateRef.current === stateString) {
          return // No changes, skip save
        }

        isSavingRef.current = true
        await saveGameState(stateToSave)
        lastSavedStateRef.current = stateString
        isSavingRef.current = false
      } catch (error) {
        prodError('❌ Error saving game state:', error)
        isSavingRef.current = false
      }
    }, 3000) // 3 seconds - only for non-critical updates (team names, game setup, etc.)
    // Critical updates (scores, answers) are saved immediately in QuestionView

    return () => {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current)
      }
    }
  }, [gameState, stateLoaded, isAuthenticated])

  // Add/remove presentation mode class to body
  useEffect(() => {
    if (isPresentationMode) {
      document.body.classList.add('presentation-mode')
    } else {
      document.body.classList.remove('presentation-mode')
    }

    return () => {
      document.body.classList.remove('presentation-mode')
    }
  }, [isPresentationMode])

  // OPTIMIZATION: Skip loading screen entirely if we have cached state
  // Only show on absolute first visit when no cache exists
  const hasCachedState = sessionStorage.getItem('gameState_cache')

  if (authLoading && !isAuthenticated && !hasCachedState) {
    return (
      <div className="min-h-screen w-full flex items-center justify-center bg-[#f7f2e6]">
        <div className="bg-white/95 backdrop-blur-sm rounded-3xl shadow-2xl p-8 text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-4 border-red-600 mx-auto mb-4"></div>
          <h1 className="text-xl font-bold text-red-800">جاري التحميل...</h1>
        </div>
      </div>
    )
  }

  return (
    <>
      <Router>
        <div className="min-h-screen w-full">
          <RouteTracker gameState={gameState} setGameState={setGameState} stateLoaded={stateLoaded} />
          <Routes>
            <Route
              path="/"
              element={<Index setGameState={setGameState} />}
            />
            <Route
              path="/categories"
              element={<CategorySelection gameState={gameState} setGameState={setGameState} stateLoaded={stateLoaded} />}
            />
            <Route
              path="/game"
              element={<GameBoard gameState={gameState} setGameState={setGameState} stateLoaded={stateLoaded} />}
            />
            <Route
              path="/question"
              element={<QuestionView gameState={gameState} setGameState={setGameState} stateLoaded={stateLoaded} />}
            />
            <Route
              path="/results"
              element={<Results gameState={gameState} setGameState={setGameState} />}
            />
            <Route
              path="/answer-view/:questionId"
              element={<AnswerViewPage />}
            />
            <Route
              path="/statistics"
              element={withSuspense(Statistics, {}, "جاري تحميل الإحصائيات...")}
            />
            <Route
              path="/admin"
              element={withSuspense(Admin, {}, "جاري تحميل لوحة التحكم...")}
            />
            <Route
              path="/profile"
              element={withSuspense(ProfilePage, {}, "جاري تحميل الملف الشخصي...")}
            />
            <Route
              path="/my-games"
              element={withSuspense(MyGames, { gameState, setGameState }, "جاري تحميل ألعابي...")}
            />
            <Route
              path="/reset-password"
              element={<PasswordReset />}
            />
            <Route
              path="/__/auth/action"
              element={<AuthAction />}
            />
            <Route
              path="/draw/:sessionId"
              element={<DrawingGame />}
            />
            <Route
              path="/loader/:inviteCode"
              element={withSuspense(Loader, {}, "جاري التحقق من الدعوة...")}
            />
          </Routes>
        </div>
      </Router>
    </>
  )
}

export default App