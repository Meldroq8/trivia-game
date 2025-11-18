import { BrowserRouter as Router, Routes, Route, useLocation, useNavigate } from 'react-router-dom'
import { useState, useEffect } from 'react'
import { usePresentationMode } from './hooks/usePresentationMode'
import { useAuth } from './hooks/useAuth'

import { devLog, devWarn, prodError } from "./utils/devLog"
// All components loaded immediately for instant navigation - no lazy loading
import Index from './pages/Index'
import CategorySelection from './pages/CategorySelection'
import GameBoard from './pages/GameBoard'
import QuestionView from './pages/QuestionView'
import Results from './pages/Results'
import AnswerViewPage from './pages/AnswerViewPage'
import Statistics from './pages/Statistics'
import ProfilePage from './pages/ProfilePage'
import MyGames from './pages/MyGames'
import Admin from './pages/Admin'
import Loader from './pages/Loader'

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

      // Check if we're in preview mode - if so, don't load from Firebase
      const previewData = localStorage.getItem('questionPreview') || sessionStorage.getItem('questionPreview')
      if (previewData) {
        devLog('🔍 Preview mode detected, skipping Firebase state load')
        setStateLoaded(true)
        return
      }

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

    // Don't save to Firebase in preview mode
    const previewData = localStorage.getItem('questionPreview') || sessionStorage.getItem('questionPreview')
    if (previewData) {
      devLog('🔍 Preview mode active, skipping Firebase save')
      return
    }

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

  // Removed loading screen - app loads instantly without blocking UI

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
              element={<Statistics />}
            />
            <Route
              path="/admin"
              element={<Admin />}
            />
            <Route
              path="/profile"
              element={<ProfilePage />}
            />
            <Route
              path="/my-games"
              element={<MyGames gameState={gameState} setGameState={setGameState} />}
            />
            <Route
              path="/loader/:inviteCode"
              element={<Loader />}
            />
          </Routes>
        </div>
      </Router>
    </>
  )
}

export default App