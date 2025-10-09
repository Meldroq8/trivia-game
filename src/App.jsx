import { BrowserRouter as Router, Routes, Route, useLocation, useNavigate } from 'react-router-dom'
import { useState, useEffect, Suspense, lazy } from 'react'
import { usePresentationMode } from './hooks/usePresentationMode'
import { useAuth } from './hooks/useAuth'
import componentPreloader from './utils/componentPreloader'

import { devLog, devWarn, prodError } from "./utils/devLog"
// Core game flow components - loaded immediately for instant navigation
import Index from './pages/Index'
import CategorySelection from './pages/CategorySelection'
import GameBoard from './pages/GameBoard'
import QuestionView from './pages/QuestionView'
import Results from './pages/Results'

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

  // Update currentRoute in gameState when route changes
  useEffect(() => {
    if (stateLoaded && gameState.currentRoute !== location.pathname) {
      const newState = {
        ...gameState,
        currentRoute: location.pathname
      }

      // Reset the explicit exit flag when user starts a new game flow
      if (location.pathname === '/categories') {
        newState.userExplicitlyExited = false
        localStorage.removeItem('trivia_user_exited')
        devLog('🔄 Resetting explicit exit flags (gameState + localStorage) - user starting new game flow')
      }

      setGameState(prev => ({
        ...prev,
        ...newState
      }))
    }
  }, [location.pathname, stateLoaded])

  // BULLETPROOF Route Restoration (run only once when state loads)
  useEffect(() => {
    if (!stateLoaded) return

    // Check immediate localStorage flag for explicit exit
    const userExplicitlyExited = localStorage.getItem('trivia_user_exited') === 'true'
    if (userExplicitlyExited) {
      devLog('🚫 BULLETPROOF: User explicitly exited (localStorage check) - skipping route restoration')
      return
    }

    // Don't restore routes if user explicitly exited the game (gameState check)
    if (gameState.userExplicitlyExited) {
      devLog('🚫 BULLETPROOF: User explicitly exited (gameState check) - skipping route restoration')
      return
    }

    // All game-related routes should be restored
    const validRoutesToRestore = ['/game', '/question', '/categories']

    // Only restore if we have a saved route AND we're currently on index
    if (gameState.currentRoute && location.pathname === '/' && gameState.currentRoute !== '/') {
      if (validRoutesToRestore.includes(gameState.currentRoute)) {
        devLog(`🔄 BULLETPROOF: Restoring route from ${location.pathname} to ${gameState.currentRoute}`)
        navigate(gameState.currentRoute, { replace: true })
      }
    }
  }, [stateLoaded]) // Only run when stateLoaded changes from false to true

  // Browser Back Button Control with Warning System
  useEffect(() => {
    const currentPath = location.pathname

    // Only add back button protection on game pages
    if (currentPath === '/game' || currentPath === '/question') {
      let isNavigatingAway = false

      // Add a dummy history state to detect back button
      window.history.pushState({ page: currentPath, timestamp: Date.now() }, '', currentPath)

      const handlePopState = (event) => {
        devLog('🔄 PopState detected on', currentPath, 'event:', event)

        // Prevent the default behavior
        if (isNavigatingAway) return

        if (currentPath === '/game') {
          devLog('🔄 Back button from gameboard → showing warning')
          const confirmed = window.confirm('هل أنت متأكد من الخروج من اللعبة؟ سيتم إغلاق اللعبة والعودة للصفحة الرئيسية.')
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
          const confirmed = window.confirm('هل أنت متأكد من الخروج من السؤال؟ ستعود للوحة اللعبة وسيتم إنهاء الوقت المحدد.')
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

  return null
}

function App() {
  const { isPresentationMode } = usePresentationMode()
  const { getGameState, saveGameState, migrateFromLocalStorage, isAuthenticated, loading: authLoading } = useAuth()

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

  const [gameState, setGameState] = useState(getDefaultGameState)
  const [stateLoaded, setStateLoaded] = useState(false)
  // Check if migration was already completed (persists across page refreshes)
  const [migrationComplete, setMigrationComplete] = useState(() => {
    return localStorage.getItem('migration_complete') === 'true'
  })

  // Load game state from Firebase when user is authenticated
  useEffect(() => {
    const loadGameState = async () => {
      // Wait for auth to complete before loading state
      if (authLoading) return

      try {
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
          }
        }
      } catch (error) {
        prodError('❌ Error loading game state:', error)
      } finally {
        setStateLoaded(true)
      }
    }

    loadGameState()
  }, [isAuthenticated, authLoading, migrationComplete])

  // Save game state to Firebase whenever it changes (debounced)
  useEffect(() => {
    if (!stateLoaded || !isAuthenticated) return

    const saveStateDebounced = setTimeout(async () => {
      try {
        const stateToSave = {
          ...gameState,
          // Convert Sets to arrays for JSON serialization
          usedQuestions: Array.from(gameState.usedQuestions || []),
          usedPointValues: Array.from(gameState.usedPointValues || [])
        }

        await saveGameState(stateToSave)
      } catch (error) {
        prodError('❌ Error saving game state:', error)
      }
    }, 1000) // Debounce saves by 1 second

    return () => clearTimeout(saveStateDebounced)
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

  // Show loading screen while auth and state are initializing (only on first load)
  if (authLoading || !stateLoaded) {
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