import { BrowserRouter as Router, Routes, Route, useLocation, useNavigate } from 'react-router-dom'
import { useState, useEffect, useRef, Suspense, lazy } from 'react'
import { usePresentationMode } from './hooks/usePresentationMode'
import { useAuth } from './hooks/useAuth'
import componentPreloader from './utils/componentPreloader'
import ConfirmExitModal from './components/ConfirmExitModal'
import InstallPrompt from './components/InstallPrompt'

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
import HeadbandGame from './pages/HeadbandGame'
import GuessWordGame from './pages/GuessWordGame'
import CategoryPreview from './pages/CategoryPreview'

// Less frequently used components - lazy loaded with background preloading
const Statistics = lazy(() => import('./pages/Statistics'))
const ProfilePage = lazy(() => import('./pages/ProfilePage'))
const MyGames = lazy(() => import('./pages/MyGames'))
const Admin = lazy(() => import('./pages/Admin'))
const Loader = lazy(() => import('./pages/Loader'))

// Reusable loading fallback component
const PageLoading = ({ message = "جاري التحميل..." }) => (
  <div className="min-h-screen w-full flex items-center justify-center bg-[#f7f2e6] dark:bg-slate-900">
    <div className="bg-white/95 dark:bg-slate-800/95 backdrop-blur-sm rounded-3xl shadow-2xl p-6 text-center">
      <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-red-600 mx-auto mb-3"></div>
      <h1 className="text-lg font-bold text-red-800 dark:text-red-400">{message}</h1>
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
  // Also reset game state when on /categories (regardless of previous route)
  const hasResetForCategories = useRef(false)

  useEffect(() => {
    const routeChanged = gameState.currentRoute !== location.pathname
    const needsCategoriesReset = location.pathname === '/categories' && !hasResetForCategories.current

    if (stateLoaded && (routeChanged || needsCategoriesReset)) {
      const newState = {
        ...gameState,
        currentRoute: location.pathname
      }

      // Reset the explicit exit flag and game state when user starts a new game flow
      if (location.pathname === '/categories') {
        hasResetForCategories.current = true
        newState.userExplicitlyExited = false
        newState.usedQuestions = new Set() // Reset used questions for new game
        newState.usedPointValues = new Set() // Reset used point values
        newState.currentQuestion = null
        newState.assignedQuestions = {} // Reset button-to-question assignments for new game
        newState.gameHistory = [] // Reset game history for new game
        newState.currentTurn = 'team1' // Reset to team 1 starting
        newState.gameName = 'لعبة الأسئلة' // Reset game name to default
        newState.team1 = { name: 'الفريق الأول', score: 0 } // Reset to defaults
        newState.team2 = { name: 'الفريق الثاني', score: 0 } // Reset to defaults
        newState.selectedCategories = [] // Reset selected categories
        newState.selectedPerks = [] // Reset selected perks
        newState.perkUsage = {
          team1: { double: 0, phone: 0, search: 0, risk: 0, prison: 0, twoAnswers: 0 },
          team2: { double: 0, phone: 0, search: 0, risk: 0, prison: 0, twoAnswers: 0 }
        }
        newState.activatedPerks = {
          doublePoints: { active: false, team: null },
          riskPoints: { active: false, team: null },
          twoAnswers: { active: false, team: null },
          prison: { active: false, team: null, targetTeam: null }
        }
        localStorage.removeItem('trivia_user_exited')
        // Clear the session cache to prevent old state from being restored
        sessionStorage.removeItem('gameState_cache')
        devLog('🔄 Resetting game state for new game - user at category selection')
      } else {
        // Reset the flag when leaving /categories so it can reset again on next visit
        hasResetForCategories.current = false
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
                         gameState.team2?.score > 0 ||
                         gameState.currentQuestion !== null // Also consider having a current question as active game

    // Valid game routes that should be preserved on reload
    const validGameRoutes = ['/game', '/question', '/answer', '/results']

    // If user is already on a valid game route, DON'T navigate away
    // This fixes the issue where reloading on /question would redirect to /game
    if (validGameRoutes.includes(location.pathname)) {
      devLog('✅ User already on valid game route:', location.pathname, '- staying here')
      return
    }

    if (hasActiveGame && gameState.currentRoute && gameState.currentRoute !== location.pathname) {
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
  const { getGameState, saveGameState, migrateFromLocalStorage, isAuthenticated, loading: authLoading, updateGameStats, user } = useAuth()

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
      team1: { double: 0, phone: 0, search: 0, risk: 0, prison: 0, twoAnswers: 0 },
      team2: { double: 0, phone: 0, search: 0, risk: 0, prison: 0, twoAnswers: 0 }
    },
    activatedPerks: {
      doublePoints: { active: false, team: null },
      riskPoints: { active: false, team: null },
      twoAnswers: { active: false, team: null },
      prison: { active: false, team: null, targetTeam: null }
    },
    selectedPerks: [],
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
      const previewData = localStorage.getItem('questionPreview') || sessionStorage.getItem('questionPreview') || sessionStorage.getItem('isPreviewMode')
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

        // Pending game sync moved to a separate delayed effect to ensure auth is ready

        // Load saved game state from Firebase
        if (isAuthenticated) {
          const savedState = await getGameState()

          // Check if we have a more recent backup in localStorage
          const backupState = localStorage.getItem('gameState_backup')
          const backupTimestamp = localStorage.getItem('gameState_backup_timestamp')

          let stateToUse = savedState

          // Use backup if it exists and is more recent (e.g., tab was closed before Firebase saved)
          if (backupState && backupTimestamp) {
            try {
              const parsedBackup = JSON.parse(backupState)
              const backupTime = parseInt(backupTimestamp, 10)

              // Check if backup is recent (within last 24 hours) and has game data
              const isRecentBackup = (Date.now() - backupTime) < 24 * 60 * 60 * 1000
              const hasGameData = parsedBackup.selectedCategories?.length > 0 ||
                                  parsedBackup.gameHistory?.length > 0 ||
                                  parsedBackup.team1?.score > 0 ||
                                  parsedBackup.team2?.score > 0

              if (isRecentBackup && hasGameData) {
                devLog('📦 Found recent localStorage backup, checking if newer than Firebase...')

                // Compare timestamps or use backup if Firebase has no game data
                const firebaseHasGameData = savedState &&
                  (savedState.selectedCategories?.length > 0 ||
                   savedState.gameHistory?.length > 0 ||
                   savedState.team1?.score > 0 ||
                   savedState.team2?.score > 0)

                if (!firebaseHasGameData) {
                  devLog('✅ Using localStorage backup (Firebase has no active game)')
                  stateToUse = parsedBackup
                  // Save backup to Firebase now
                  saveGameState(parsedBackup).then(() => {
                    devLog('💾 Synced localStorage backup to Firebase')
                    localStorage.removeItem('gameState_backup')
                    localStorage.removeItem('gameState_backup_timestamp')
                  })
                }
              }
            } catch (e) {
              devWarn('⚠️ Error parsing backup:', e)
            }
          }

          if (stateToUse) {
            // Convert arrays back to Sets
            if (stateToUse.usedQuestions && Array.isArray(stateToUse.usedQuestions)) {
              stateToUse.usedQuestions = new Set(stateToUse.usedQuestions)
            }
            if (stateToUse.usedPointValues && Array.isArray(stateToUse.usedPointValues)) {
              stateToUse.usedPointValues = new Set(stateToUse.usedPointValues)
            }

            // Ensure required properties exist
            const completeState = {
              ...getDefaultGameState(),
              ...stateToUse
            }

            setGameState(completeState)
            // Cache for next reload
            sessionStorage.setItem('gameState_cache', JSON.stringify(stateToUse))
          }
        }
      } catch (error) {
        prodError('❌ Error loading game state:', error)
        setStateLoaded(true) // Still mark as loaded to prevent infinite loading
      }
    }

    loadGameState()
    // Note: updateGameStats intentionally excluded from deps to prevent infinite loop
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAuthenticated, authLoading, migrationComplete, user])

  // Separate effect for pending game sync - runs after auth is fully ready
  useEffect(() => {
    // Only run when auth is fully loaded and user is authenticated
    if (authLoading || !isAuthenticated || !user) return

    const syncPendingGame = async () => {
      try {
        const pendingGameStr = localStorage.getItem('pending_game')
        if (!pendingGameStr) return

        const pendingGame = JSON.parse(pendingGameStr)

        // Only sync if it belongs to current user and has game data
        if (pendingGame.userId !== user.uid) {
          devLog('⚠️ Pending game belongs to different user, removing')
          localStorage.removeItem('pending_game')
          return
        }

        if (!pendingGame.gameData?.selectedCategories?.length) {
          localStorage.removeItem('pending_game')
          return
        }

        devLog('📤 Syncing pending game to Firebase...')
        await updateGameStats({
          gameData: pendingGame.gameData,
          finalScore: pendingGame.finalScore || 0,
          isComplete: false
        })
        devLog('✅ Pending game synced successfully')
        localStorage.removeItem('pending_game')
      } catch (syncError) {
        devWarn('⚠️ Error syncing pending game:', syncError.message)
        // Don't remove on permission errors - might be temporary
        if (!syncError.message?.includes('permission')) {
          localStorage.removeItem('pending_game')
        }
      }
    }

    // Delay sync to ensure Firebase is fully ready
    const timeoutId = setTimeout(syncPendingGame, 2000)
    return () => clearTimeout(timeoutId)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authLoading, isAuthenticated, user])

  // Helper function to get current state for saving
  const getCurrentStateToSave = () => ({
    ...gameState,
    // Convert Sets to arrays for JSON serialization
    usedQuestions: Array.from(gameState.usedQuestions || []),
    usedPointValues: Array.from(gameState.usedPointValues || [])
  })

  // Save game state to Firebase whenever it changes (debounced)
  useEffect(() => {
    if (!stateLoaded || !isAuthenticated) return
    if (isSavingRef.current) return // Skip if already saving

    // Don't save to Firebase in preview mode
    const previewData = localStorage.getItem('questionPreview') || sessionStorage.getItem('questionPreview') || sessionStorage.getItem('isPreviewMode')
    if (previewData) {
      devLog('🔍 Preview mode active, skipping Firebase save')
      return
    }

    // OPTIMIZATION: Save to BOTH sessionStorage AND localStorage for instant restoration + backup
    const stateToSave = getCurrentStateToSave()
    const stateString = JSON.stringify(stateToSave)

    // Save to sessionStorage for instant same-session restoration
    sessionStorage.setItem('gameState_cache', stateString)

    // ALSO save to localStorage as backup in case tab is closed before Firebase saves
    localStorage.setItem('gameState_backup', stateString)
    localStorage.setItem('gameState_backup_timestamp', Date.now().toString())

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
        // Clear backup after successful Firebase save
        localStorage.removeItem('gameState_backup')
        localStorage.removeItem('gameState_backup_timestamp')
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

  // CRITICAL: Save to Firebase immediately when tab is about to close or becomes hidden
  useEffect(() => {
    if (!isAuthenticated || !stateLoaded) return

    // Force immediate save function
    const forceImmediateSave = async () => {
      // Don't save in preview mode
      const isPreviewMode = localStorage.getItem('questionPreview') || sessionStorage.getItem('questionPreview') || sessionStorage.getItem('isPreviewMode')
      if (isPreviewMode) {
        devLog('🔍 Preview mode active, skipping forced save')
        return
      }

      // Cancel debounced save
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current)
      }

      const stateToSave = getCurrentStateToSave()
      const stateString = JSON.stringify(stateToSave)

      // Skip if nothing changed
      if (lastSavedStateRef.current === stateString) return

      try {
        // Save to localStorage immediately as backup
        localStorage.setItem('gameState_backup', stateString)
        localStorage.setItem('gameState_backup_timestamp', Date.now().toString())

        // Try to save to Firebase (might not complete if tab closes)
        await saveGameState(stateToSave)
        lastSavedStateRef.current = stateString
        devLog('💾 Forced save completed (tab closing/hidden)')

        // CRITICAL: Also save to games collection so game appears in "My Games"
        // Only if there's an active game with categories selected
        if (stateToSave.selectedCategories?.length > 0 && user) {
          // Generate a gameId if not present (for new games)
          if (!stateToSave.gameId) {
            stateToSave.gameId = `${user.uid}_${Date.now()}`
          }

          // Save to games collection (this is what shows in "My Games")
          const gamePayload = {
            gameData: stateToSave,
            finalScore: Math.max(stateToSave.team1?.score || 0, stateToSave.team2?.score || 0),
            isComplete: false // Mark as incomplete since tab was closed mid-game
          }
          await updateGameStats(gamePayload)
          devLog('💾 Game saved to games collection (for My Games page)')
        }
      } catch (error) {
        prodError('❌ Error during forced save:', error)
      }
    }

    // Handle tab visibility change (more reliable than beforeunload)
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'hidden') {
        devLog('👁️ Tab hidden - forcing immediate save')
        forceImmediateSave()
      }
    }

    // Handle before unload (backup - may not complete for async operations)
    const handleBeforeUnload = () => {
      devLog('🚪 Tab closing - forcing immediate save')
      // Use synchronous localStorage save as last resort
      const stateToSave = getCurrentStateToSave()

      // Generate gameId if not present (for new games)
      if (stateToSave.selectedCategories?.length > 0 && user && !stateToSave.gameId) {
        stateToSave.gameId = `${user.uid}_${Date.now()}`
      }

      localStorage.setItem('gameState_backup', JSON.stringify(stateToSave))
      localStorage.setItem('gameState_backup_timestamp', Date.now().toString())

      // Also save as pending game for MyGames to pick up
      if (stateToSave.selectedCategories?.length > 0 && user) {
        const pendingGame = {
          gameData: stateToSave,
          userId: user.uid,
          userName: user.displayName || user.email?.split('@')[0] || 'لاعب مجهول',
          finalScore: Math.max(stateToSave.team1?.score || 0, stateToSave.team2?.score || 0),
          isComplete: false,
          createdAt: new Date().toISOString(),
          pendingSync: true
        }
        localStorage.setItem('pending_game', JSON.stringify(pendingGame))
        devLog('🚪 Saved pending game to localStorage')
      }

      // Try async save (might not complete)
      forceImmediateSave()
    }

    // Handle page hide (works better on mobile)
    const handlePageHide = () => {
      devLog('📱 Page hide - forcing immediate save')
      const stateToSave = getCurrentStateToSave()

      // Generate gameId if not present (for new games)
      if (stateToSave.selectedCategories?.length > 0 && user && !stateToSave.gameId) {
        stateToSave.gameId = `${user.uid}_${Date.now()}`
      }

      localStorage.setItem('gameState_backup', JSON.stringify(stateToSave))
      localStorage.setItem('gameState_backup_timestamp', Date.now().toString())

      // Also save as pending game for MyGames to pick up
      if (stateToSave.selectedCategories?.length > 0 && user) {
        const pendingGame = {
          gameData: stateToSave,
          userId: user.uid,
          userName: user.displayName || user.email?.split('@')[0] || 'لاعب مجهول',
          finalScore: Math.max(stateToSave.team1?.score || 0, stateToSave.team2?.score || 0),
          isComplete: false,
          createdAt: new Date().toISOString(),
          pendingSync: true
        }
        localStorage.setItem('pending_game', JSON.stringify(pendingGame))
        devLog('📱 Saved pending game to localStorage')
      }
    }

    document.addEventListener('visibilitychange', handleVisibilityChange)
    window.addEventListener('beforeunload', handleBeforeUnload)
    window.addEventListener('pagehide', handlePageHide)

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange)
      window.removeEventListener('beforeunload', handleBeforeUnload)
      window.removeEventListener('pagehide', handlePageHide)
    }
  }, [isAuthenticated, stateLoaded, gameState, saveGameState, updateGameStats, user])

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
      <div className="min-h-screen w-full flex items-center justify-center bg-[#f7f2e6] dark:bg-slate-900">
        <div className="bg-white/95 dark:bg-slate-800/95 backdrop-blur-sm rounded-3xl shadow-2xl p-6 text-center">
          <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-red-600 mx-auto mb-3"></div>
          <h1 className="text-lg font-bold text-red-800 dark:text-red-400">جاري التحميل...</h1>
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
              path="/category-preview"
              element={<CategoryPreview />}
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
              path="/answer-view/:sessionId"
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
              path="/headband/:sessionId"
              element={<HeadbandGame />}
            />
            <Route
              path="/guessword/:sessionId"
              element={<GuessWordGame />}
            />
            <Route
              path="/loader/:inviteCode"
              element={withSuspense(Loader, {}, "جاري التحقق من الدعوة...")}
            />
          </Routes>
        </div>
        {/* PWA Install Prompt */}
        <InstallPrompt />
      </Router>
    </>
  )
}

export default App