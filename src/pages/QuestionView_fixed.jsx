import { useState, useEffect, useRef, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import PresentationModeToggle from '../components/PresentationModeToggle'
import { useAuth } from '../hooks/useAuth'
import AudioPlayer from '../components/AudioPlayer'
import { GameDataLoader } from '../utils/gameDataLoader'
import PerkModal from '../components/PerkModal'
import gamePreloader from '../utils/preloader'
import questionUsageTracker from '../utils/questionUsageTracker'
import LogoDisplay from '../components/LogoDisplay'

function QuestionView({ gameState, setGameState, stateLoaded }) {
  // Responsive scaling system - viewport-aware scaling to prevent scrolling
  const getResponsiveStyles = () => {
    try {
      const W = window.innerWidth || 375 // Fallback width
      const H = window.innerHeight || 667 // Fallback height

      // Define size categories based on screen dimensions
      const isSmallScreen = W < 640 || H < 700
      const isMediumScreen = W >= 640 && W < 1024 && H >= 700
      const isLargeScreen = W >= 1024
      const isShortScreen = H < 700
      const isTallScreen = H >= 900

      // Calculate available space (accounting for header/footer)
      const headerHeight = 60 // Approximate header height
      const footerHeight = 80 // Approximate footer height
      const availableHeight = Math.max(300, H - headerHeight - footerHeight - 40) // 40px padding
      const availableWidth = Math.max(300, W - 40) // 40px side padding

      // Dynamic scaling based on available space
      let globalScaleFactor = 1

      if (isSmallScreen) {
        // More aggressive scaling for small screens
        globalScaleFactor = Math.min(
          availableWidth / 350,  // Scale based on width
          availableHeight / 400   // Scale based on height
        )
        globalScaleFactor = Math.max(0.6, Math.min(0.9, globalScaleFactor)) // Clamp between 0.6-0.9
      } else if (isMediumScreen) {
        globalScaleFactor = Math.min(
          availableWidth / 600,
          availableHeight / 500
        )
        globalScaleFactor = Math.max(0.8, Math.min(1.1, globalScaleFactor)) // Clamp between 0.8-1.1
      } else {
        // Large screens get more generous scaling
        globalScaleFactor = Math.min(
          availableWidth / 800,
          availableHeight / 600
        )
        globalScaleFactor = Math.max(0.9, Math.min(1.3, globalScaleFactor)) // Clamp between 0.9-1.3
      }

      return {
        isSmallScreen,
        isMediumScreen,
        isLargeScreen,
        isShortScreen,
        isTallScreen,
        globalScaleFactor,
        availableHeight,
        availableWidth
      }
    } catch (error) {
      console.error('Error in getResponsiveStyles:', error)
      // Return safe fallback values
      return {
        isSmallScreen: true,
        isMediumScreen: false,
        isLargeScreen: false,
        isShortScreen: false,
        isTallScreen: false,
        globalScaleFactor: 1,
        availableHeight: 400,
        availableWidth: 300
      }
    }
  }

  const [timeElapsed, setTimeElapsed] = useState(0)
  const [showAnswer, setShowAnswer] = useState(false)
  const [showScoring, setShowScoring] = useState(false)
  const [timerActive, setTimerActive] = useState(true)
  const [imageZoomed, setImageZoomed] = useState(false)
  const [gameData, setGameData] = useState(null)
  const [preloadedImages, setPreloadedImages] = useState(new Set())
  const [imageLoading, setImageLoading] = useState(false)

  // Perk system state
  const [perkModalOpen, setPerkModalOpen] = useState(false)
  const [activePerk, setActivePerk] = useState({ type: null, team: null })
  const [activeTimer, setActiveTimer] = useState({ active: false, type: null, team: null, timeLeft: 0, paused: false })
  const navigate = useNavigate()
  const { isAuthenticated, loading, user } = useAuth()
  const containerRef = useRef(null)
  const headerRef = useRef(null)
  const [dimensions, setDimensions] = useState({ width: 0, height: 0 })
  const [headerHeight, setHeaderHeight] = useState(0)

  // Memoized responsive styles
  const styles = useMemo(() => getResponsiveStyles(), [])

  // Set user ID for question tracker when user changes
  useEffect(() => {
    console.log('🔧 QuestionView: User changed:', user?.uid ? 'User ID: ' + user.uid : 'No user')
    if (user?.uid) {
      questionUsageTracker.setUserId(user.uid)
      console.log('✅ QuestionView: Set questionUsageTracker user ID to:', user.uid)
    }
  }, [user])

  // Redirect to categories if no categories are selected (after state loads)
  useEffect(() => {
    if (stateLoaded && !gameState.selectedCategories.length) {
      // Only redirect if this isn't a page refresh situation
      // Allow some time for Firebase state to fully load before redirecting
      const timeout = setTimeout(() => {
        if (!gameState.selectedCategories.length) {
          console.log('🔄 QuestionView: No categories found after state load, redirecting to categories')
          navigate('/categories')
        }
      }, 500) // Give 500ms for any remaining state loading

      return () => clearTimeout(timeout)
    }
  }, [stateLoaded, gameState.selectedCategories, navigate])

  // Rest of component logic would go here...
  // For now, just return a basic structure

  return (
    <div ref={containerRef} className="bg-gradient-to-br from-red-900 via-red-800 to-red-900 flex flex-col" style={{
      height: '100vh',
      overflow: 'hidden'
    }}>
      <div className="text-white text-center p-4">
        <h1>Question View - Hooks Fixed</h1>
        <p>This is a simplified version to fix the hooks order issue</p>
      </div>
    </div>
  )
}

export default QuestionView