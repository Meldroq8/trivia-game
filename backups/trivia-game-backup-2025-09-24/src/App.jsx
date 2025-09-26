import { BrowserRouter as Router, Routes, Route } from 'react-router-dom'
import { useState, useEffect } from 'react'
import { usePresentationMode } from './hooks/usePresentationMode'
import GameSetup from './pages/GameSetup'
import CategorySelection from './pages/CategorySelection'
import GameBoard from './pages/GameBoard'
import QuestionView from './pages/QuestionView'
import Results from './pages/Results'
import Statistics from './pages/Statistics'
import Admin from './pages/Admin'
import ProfilePage from './pages/ProfilePage'

function App() {
  const { isPresentationMode } = usePresentationMode()

  // Load game state from localStorage on app start
  const loadGameState = () => {
    try {
      const savedState = localStorage.getItem('trivia-game-state')
      if (savedState) {
        const parsed = JSON.parse(savedState)
        // Convert usedQuestions array back to Set
        if (parsed.usedQuestions && Array.isArray(parsed.usedQuestions)) {
          parsed.usedQuestions = new Set(parsed.usedQuestions)
        }
        // Convert usedPointValues array back to Set
        if (parsed.usedPointValues && Array.isArray(parsed.usedPointValues)) {
          parsed.usedPointValues = new Set(parsed.usedPointValues)
        }

        // Ensure perkUsage exists for backward compatibility
        if (!parsed.perkUsage) {
          parsed.perkUsage = {
            team1: { double: 0, phone: 0, search: 0 },
            team2: { double: 0, phone: 0, search: 0 }
          }
        }

        // Ensure activatedPerks exists for backward compatibility
        if (!parsed.activatedPerks) {
          parsed.activatedPerks = {
            doublePoints: { active: false, team: null }
          }
        }

        return parsed
      }
    } catch (error) {
      console.error('❌ Error loading game state from localStorage:', error)
    }

    // Return default state if no saved state or error
    return {
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
      }
    }
  }

  const [gameState, setGameState] = useState(loadGameState)
  const [stateLoaded, setStateLoaded] = useState(false)

  // Mark state as loaded after initial load
  useEffect(() => {
    setStateLoaded(true)
  }, [])

  // Save game state to localStorage whenever it changes
  useEffect(() => {
    try {
      const stateToSave = {
        ...gameState,
        // Convert Sets to arrays for JSON serialization
        usedQuestions: Array.from(gameState.usedQuestions || []),
        usedPointValues: Array.from(gameState.usedPointValues || [])
      }
      localStorage.setItem('trivia-game-state', JSON.stringify(stateToSave))
    } catch (error) {
      console.error('❌ Error saving game state to localStorage:', error)
    }
  }, [gameState])

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

  return (
    <>
      <Router>
        <div className="min-h-screen w-full">
          <Routes>
            <Route
              path="/"
              element={<GameSetup gameState={gameState} setGameState={setGameState} />}
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
          </Routes>
        </div>
      </Router>
    </>
  )
}

export default App