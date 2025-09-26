import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import HeaderAuth from '../components/HeaderAuth'
import { useAuth } from '../hooks/useAuth'

function GameSetup({ gameState, setGameState }) {
  console.log('GameSetup: gameState.gameName =', gameState.gameName)
  const [gameName, setGameName] = useState('')
  const [team1Name, setTeam1Name] = useState('')
  const [team2Name, setTeam2Name] = useState('')
  const [dimensions, setDimensions] = useState({ width: window.innerWidth, height: window.innerHeight })
  const headerRef = useRef(null)
  const [headerHeight, setHeaderHeight] = useState(0)
  const navigate = useNavigate()
  const { isAdmin, isAuthenticated, loading, user } = useAuth()

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

  // Perfect scaling system to fit entire content below header
  const getResponsiveStyles = () => {
    const { width, height } = dimensions
    const isPortrait = height > width

    // PC Auto-scaling: Apply 2x scaling for desktop/PC users for better visibility
    const isPC = width >= 1024 && height >= 768 // Desktop/laptop detection
    const pcScaleFactor = isPC ? 2.0 : 1.0 // 200% scaling for PC, normal for mobile/tablet

    const actualHeaderHeight = headerHeight || (isPortrait ? 60 : 80)

    // Calculate available space below header
    const availableHeight = height - actualHeaderHeight
    const availableWidth = width

    // Content padding and margins
    const basePadding = Math.max(8, Math.min(20, availableHeight * 0.02))
    const baseGap = Math.max(12, Math.min(24, availableHeight * 0.03))

    // Calculate space for each section - ensure everything fits in viewport
    const contentPadding = basePadding * 2 // top and bottom of main container
    const titleSectionHeight = availableHeight * (isPortrait ? 0.12 : 0.15)
    const buttonSectionHeight = availableHeight * (isPortrait ? 0.12 : 0.15)

    // Reserve more space for forms and ensure total height never exceeds viewport
    const maxFormsHeight = availableHeight * 0.75 // Maximum 75% of available height for forms
    const calculatedFormsHeight = availableHeight - contentPadding - titleSectionHeight - buttonSectionHeight - (baseGap * 2)
    const formsHeight = Math.min(maxFormsHeight, calculatedFormsHeight)

    // Font sizes based on available space (apply PC scaling)
    const headerFontSize = Math.max(10, Math.min(24, width * (isPortrait ? 0.035 : 0.02))) * pcScaleFactor
    const titleFontSize = Math.max(14, Math.min(28, titleSectionHeight * 0.3)) * pcScaleFactor
    const subtitleFontSize = Math.max(10, Math.min(20, titleSectionHeight * 0.2)) * pcScaleFactor

    // Form section sizing - Responsive proportions
    // Distinguish between phone landscape (small height) and desktop landscape (large height)
    const isPhoneLandscape = !isPortrait && height < 600
    // Container-First Approach: Calculate containers first, then fit content inside

    // Step 1: Calculate space left after title and button sections
    const usedSpace = titleSectionHeight + buttonSectionHeight + (baseGap * 3) + (basePadding * 2)
    const remainingSpace = availableHeight - usedSpace

    // Step 2: Use 75% of remaining space for forms (more space for readability)
    const totalFormsAvailableHeight = remainingSpace * 0.75

    // Step 3: Divide equally among 3 sections (game name + 2 teams)
    const singleSectionHeight = totalFormsAvailableHeight / 3

    // Step 4: Define container heights
    const gameNameSectionHeight = singleSectionHeight
    const teamBoxHeight = singleSectionHeight
    const teamsSectionHeight = singleSectionHeight * 2 // Area for both teams

    // Step 5: Calculate content with minimum readable sizes
    const sectionPadding = Math.max(12, Math.min(singleSectionHeight * 0.15, 20)) // Min 12px for readability
    const labelFontSize = Math.max(14, Math.min(singleSectionHeight * 0.2, 18)) * pcScaleFactor   // Min 14px for readability - SCALE FONTS
    const inputHeight = Math.max(40, Math.min(singleSectionHeight * 0.4, 55))     // Min 40px for usability
    const inputFontSize = Math.max(12, Math.min(singleSectionHeight * 0.15, 16)) * pcScaleFactor  // Min 12px for readability - SCALE FONTS
    const inputPadding = Math.max(8, Math.min(singleSectionHeight * 0.08, 12))    // Min 8px for comfort

    // All sections use the same variables
    const gameNameInputHeight = inputHeight
    const teamInputHeight = inputHeight
    const teamLabelFontSize = labelFontSize
    const teamInputFontSize = inputFontSize
    const teamInputPadding = inputPadding
    const teamSectionPadding = sectionPadding

    // Button sizing
    const buttonFontSize = Math.max(12, Math.min(20, buttonSectionHeight * 0.3)) * pcScaleFactor  // SCALE FONTS
    const buttonPadding = Math.max(8, Math.min(20, buttonSectionHeight * 0.15))

    return {
      headerFontSize,
      titleFontSize,
      subtitleFontSize,
      labelFontSize,
      inputFontSize,
      buttonFontSize,
      basePadding,
      baseGap,
      inputPadding,
      sectionPadding,
      buttonPadding,
      availableHeight,
      availableWidth,
      titleSectionHeight,
      buttonSectionHeight,
      gameNameSectionHeight,
      teamsSectionHeight,
      teamBoxHeight,
      teamLabelFontSize,
      teamInputFontSize,
      teamInputPadding,
      teamSectionPadding,
      gameNameInputHeight,
      teamInputHeight,
      totalFormsAvailableHeight,
      isPortrait,
      pcScaleFactor
    }
  }

  const styles = getResponsiveStyles()

  const handleStartGame = () => {
    // Check if user is authenticated before starting game
    if (!isAuthenticated) {
      alert('يجب تسجيل الدخول أولاً لبدء اللعبة')
      return
    }

    setGameState(prev => ({
      ...prev,
      gameName: gameName,
      team1: { ...prev.team1, name: team1Name },
      team2: { ...prev.team2, name: team2Name },
      // Initialize/reset turn to team1 for new game
      currentTurn: 'team1',
      // Reset perk usage for new game
      perkUsage: {
        team1: { double: 0, phone: 0, search: 0 },
        team2: { double: 0, phone: 0, search: 0 }
      }
    }))
    navigate('/categories')
  }

  return (
    <div className="h-screen bg-[#f7f2e6] flex flex-col">
      {/* Red Header Bar - Fixed Height */}
      <div ref={headerRef} className="bg-red-600 text-white flex-shrink-0" style={{ padding: `${styles.basePadding}px` }}>
        <div className="flex justify-between items-center">
          <div className="flex items-center" style={{ gap: `${styles.baseGap}px` }}>
            <span className="font-bold text-white" style={{ fontSize: `${styles.headerFontSize}px` }}>
              🧠 لعبة الأسئلة والأجوبة
            </span>
          </div>

          <div className="flex items-center">
            <h1 className="font-bold text-center" style={{ fontSize: `${styles.headerFontSize}px` }}>
              إعداد اللعبة
            </h1>
          </div>

          <div className="flex items-center" style={{ gap: `${styles.baseGap}px` }}>
            <HeaderAuth fontSize={styles.headerFontSize} />
            {isAdmin && (
              <button
                onClick={() => {
                  console.log('Admin button clicked, navigating to /admin')
                  console.log('isAdmin:', isAdmin)
                  console.log('isAuthenticated:', isAuthenticated)
                  console.log('loading:', loading)
                  console.log('user:', user)
                  navigate('/admin')
                }}
                className="bg-red-700 hover:bg-red-800 text-white rounded-lg transition-colors font-bold"
                style={{
                  fontSize: `${styles.headerFontSize * 0.8}px`,
                  padding: `${styles.basePadding * 0.5}px ${styles.basePadding}px`
                }}
              >
                إعدادات المدير
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Main Content - Perfectly Scaled to Fill Remaining Space */}
      <div
        className="flex-1 bg-[#f7f2e6] flex flex-col justify-center"
        style={{
          minHeight: `${styles.availableHeight}px`,
          maxHeight: `${styles.availableHeight}px`,
          padding: `${styles.basePadding}px`,
          overflow: 'visible'
        }}
      >
        <div className="bg-[#f7f2e6] rounded-2xl shadow-lg w-full max-w-4xl mx-auto flex flex-col justify-between" style={{
          height: 'auto',
          minHeight: `${styles.availableHeight * 0.9}px`,
          padding: `${styles.basePadding}px`,
          boxSizing: 'border-box'
        }}>
          {/* Title Section */}
          <div className="text-center flex flex-col justify-center" style={{
            height: `${styles.titleSectionHeight}px`,
            marginBottom: `${styles.baseGap}px`
          }}>
            <h2 className="font-bold text-gray-800" style={{
              fontSize: `${styles.titleFontSize}px`,
              marginBottom: `${styles.baseGap * 0.5}px`
            }}>
              إعداد فرق اللعبة
            </h2>
            <p className="text-gray-600" style={{ fontSize: `${styles.subtitleFontSize}px` }}>
              أدخل أسماء الفرق لبدء اللعبة
            </p>
          </div>

          {/* Forms Section - Auto-sized for content */}
          <div className="flex flex-col justify-start" style={{
            marginBottom: `${styles.baseGap * 2}px`
          }}>
            {/* Game Name Section - Clean */}
            <div style={{ marginBottom: `${styles.baseGap * 2}px` }}>
              <h3 className="font-bold text-gray-800 text-center" style={{
                fontSize: `${styles.labelFontSize}px`,
                marginBottom: `${styles.baseGap}px`
              }}>
                اسم اللعبة
              </h3>
              <input
                type="text"
                value={gameName}
                onChange={(e) => setGameName(e.target.value)}
                onFocus={() => setGameName('')}
                className="w-full border-2 border-gray-300 rounded-full text-center font-bold focus:border-red-500 focus:outline-none bg-white shadow-sm placeholder-gray-400"
                style={{
                  padding: `${styles.inputPadding}px ${styles.inputPadding * 2}px`,
                  fontSize: `${styles.inputFontSize}px`,
                  height: `${styles.gameNameInputHeight}px`,
                  boxSizing: 'border-box',
                  color: '#374151'
                }}
                placeholder="أدخل اسم اللعبة"
                maxLength={30}
              />
            </div>

            {/* Teams Section - Clean */}
            <div className={`${styles.isPortrait ? 'flex flex-col' : 'grid grid-cols-2'}`} style={{
              gap: `${styles.baseGap * 2}px`
            }}>
              {/* Team 1 */}
              <div style={{ marginBottom: styles.isPortrait ? `${styles.baseGap}px` : '0' }}>
                <h3 className="font-bold text-gray-800 text-center" style={{
                  fontSize: `${styles.teamLabelFontSize}px`,
                  marginBottom: `${styles.baseGap}px`
                }}>
                  الفريق الأول
                </h3>
                <input
                  type="text"
                  value={team1Name}
                  onChange={(e) => setTeam1Name(e.target.value)}
                  onFocus={() => setTeam1Name('')}
                  className="w-full border-2 border-gray-300 rounded-full text-center font-bold focus:border-red-500 focus:outline-none bg-white shadow-sm placeholder-gray-400"
                  style={{
                    padding: `${styles.teamInputPadding}px ${styles.teamInputPadding * 2}px`,
                    fontSize: `${styles.teamInputFontSize}px`,
                    height: `${styles.teamInputHeight}px`,
                    boxSizing: 'border-box',
                    color: '#374151'
                  }}
                  placeholder="اسم الفريق"
                  maxLength={20}
                />
              </div>

              {/* Team 2 */}
              <div>
                <h3 className="font-bold text-gray-800 text-center" style={{
                  fontSize: `${styles.teamLabelFontSize}px`,
                  marginBottom: `${styles.baseGap}px`
                }}>
                  الفريق الثاني
                </h3>
                <input
                  type="text"
                  value={team2Name}
                  onChange={(e) => setTeam2Name(e.target.value)}
                  onFocus={() => setTeam2Name('')}
                  className="w-full border-2 border-gray-300 rounded-full text-center font-bold focus:border-red-500 focus:outline-none bg-white shadow-sm placeholder-gray-400"
                  style={{
                    padding: `${styles.teamInputPadding}px ${styles.teamInputPadding * 2}px`,
                    fontSize: `${styles.teamInputFontSize}px`,
                    height: `${styles.teamInputHeight}px`,
                    boxSizing: 'border-box',
                    color: '#374151'
                  }}
                  placeholder="اسم الفريق"
                  maxLength={20}
                />
              </div>
            </div>
          </div>

          {/* Button Section - Bottom positioned */}
          <div className="text-center flex flex-col justify-center mt-auto" style={{
            minHeight: `${styles.buttonSectionHeight}px`,
            paddingTop: `${styles.baseGap * 2}px`
          }}>
            <button
              onClick={handleStartGame}
              disabled={!gameName?.trim() || !team1Name?.trim() || !team2Name?.trim() || !isAuthenticated}
              className={`font-bold rounded-lg shadow-lg transition-all duration-200 hover:shadow-xl disabled:cursor-not-allowed ${
                !isAuthenticated
                  ? 'bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400'
                  : 'bg-red-600 hover:bg-red-700 disabled:bg-gray-400'
              } text-white`}
              style={{
                fontSize: `${styles.buttonFontSize}px`,
                padding: `${styles.buttonPadding}px ${styles.buttonPadding * 2}px`
              }}
            >
              {!isAuthenticated ? (styles.isPortrait ? 'تسجيل دخول 🔐' : 'يجب تسجيل الدخول أولاً 🔐') : 'ابدأ اللعبة 🎮'}
            </button>



          </div>
        </div>
      </div>
    </div>
  )
}

export default GameSetup