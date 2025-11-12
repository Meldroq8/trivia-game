import { useState, useEffect, useRef } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { GameDataLoader } from '../utils/gameDataLoader'
import PresentationModeToggle from '../components/PresentationModeToggle'
import { useAuth } from '../hooks/useAuth'
import AudioPlayer from '../components/AudioPlayer'
import PerkModal from '../components/PerkModal'
import SmartImage from '../components/SmartImage'
import BackgroundImage from '../components/BackgroundImage'
import { convertToLocalMediaUrl, getCategoryImageUrl, generateResponsiveSrcSet, getOptimizedMediaUrl as getOptimizedMediaUrlUtil } from '../utils/mediaUrlConverter'
import questionUsageTracker from '../utils/questionUsageTracker'
import LogoDisplay from '../components/LogoDisplay'
import QRCodeWithLogo from '../components/QRCodeWithLogo'
import { hasGameStarted, shouldStayOnCurrentPage } from '../utils/gameStateUtils'
import gamePreloader from '../utils/preloader'
import { devLog, devWarn, prodError } from '../utils/devLog'
import { debounce } from '../utils/debounce'

function GameBoard({ gameState, setGameState, stateLoaded }) {
  const navigate = useNavigate()
  const location = useLocation()
  const { user, isAuthenticated, loading: authLoading, getAppSettings } = useAuth()
  const containerRef = useRef(null)
  const headerRef = useRef(null)
  const footerRef = useRef(null)
  const [dimensions, setDimensions] = useState({ width: 0, height: 0 })
  const [headerHeight, setHeaderHeight] = useState(0)
  const [footerHeight, setFooterHeight] = useState(0)
  const [gameData, setGameData] = useState(null)
  const [loadingError, setLoadingError] = useState(null)
  const [initialLoadComplete, setInitialLoadComplete] = useState(false)
  const [loadedImages, setLoadedImages] = useState(new Set())

  // Perk system state
  const [perkModalOpen, setPerkModalOpen] = useState(false)
  const [activePerk, setActivePerk] = useState({ type: null, team: null })

  // Portrait menu state
  const [portraitMenuOpen, setPortraitMenuOpen] = useState(false)

  // Sponsor logo state
  const [sponsorLogo, setSponsorLogo] = useState(null)
  const [sponsorLogoLoaded, setSponsorLogoLoaded] = useState(false)
  const [showSponsorLogo, setShowSponsorLogo] = useState(true)

  // Helper function to get optimized media URL (CloudFront → Firebase → local fallback chain)
  const getOptimizedMediaUrl = (originalUrl, size = 'medium', context = 'category') => {
    if (!originalUrl) return null

    // Use CloudFront-enabled optimization with fallback chain
    const optimizedUrl = getOptimizedMediaUrlUtil(originalUrl, size, context)
    devLog(`🚀 Using CloudFront-optimized URL: ${originalUrl.split('/').pop()?.split('?')[0]} -> ${optimizedUrl}`)
    return optimizedUrl
  }

  // Set up automatic cache updates for React re-renders
  useEffect(() => {
    if (!gameData?.categories) return

    const updateCachedImages = () => {
      // Images are now served as local static files - no cache checking needed
    }

    // Check for cache updates periodically
    const interval = setInterval(updateCachedImages, 1000)
    return () => clearInterval(interval)
  }, [gameData, gameState.selectedCategories])

  // Close portrait menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (portraitMenuOpen && !event.target.closest('.portrait-menu')) {
        setPortraitMenuOpen(false)
      }
    }

    document.addEventListener('click', handleClickOutside)
    return () => document.removeEventListener('click', handleClickOutside)
  }, [portraitMenuOpen])

  // Set user ID for question tracker when user changes
  useEffect(() => {
    devLog('🔧 GameBoard: User changed:', user?.uid ? 'User ID: ' + user.uid : 'No user')
    if (user?.uid) {
      questionUsageTracker.setUserId(user.uid)
      devLog('✅ GameBoard: Set questionUsageTracker user ID to:', user.uid)

      // If we have game data but hadn't set up question tracking yet, do it now
      if (gameData) {
        devLog('🔄 GameBoard: Updating question pool after user authentication')
        questionUsageTracker.updateQuestionPool(gameData)
      }
    }
  }, [user, gameData])

  // Redirect to home if not authenticated (but only after loading is complete)
  useEffect(() => {
    if (!authLoading && !isAuthenticated) {
      navigate('/')
    }
  }, [isAuthenticated, authLoading])

  // Load sponsor logo from settings
  useEffect(() => {
    const loadSponsorLogo = async () => {
      try {
        const settings = await getAppSettings()
        if (settings?.sponsorLogo) {
          setSponsorLogo(settings.sponsorLogo)
        }
        if (settings?.showSponsorLogo !== undefined) {
          setShowSponsorLogo(settings.showSponsorLogo)
        }
      } catch (error) {
        devLog('Could not load sponsor logo:', error)
      } finally {
        setSponsorLogoLoaded(true)
      }
    }

    if (getAppSettings) {
      loadSponsorLogo()
    }
  }, [getAppSettings])

  // BULLETPROOF: No redirects to categories after game starts
  useEffect(() => {
    // Only wait for critical loading - game data is most important
    if (!gameData) {
      devLog('🔄 GameBoard: Waiting for game data before redirect checks')
      return
    }

    // If we're loading user data but have basic auth, proceed with some checks
    if (authLoading && !user) {
      devLog('🔄 GameBoard: Auth still loading, deferring redirect checks')
      return
    }

    // Check if we should stay on this page
    if (shouldStayOnCurrentPage(gameState, location.pathname)) {
      devLog('🛡️ GameBoard: Staying on current page - no redirects allowed')
      return
    }

    // Check if we're on the GameBoard page (page refresh scenario)
    if (location.pathname === '/game') {
      devLog('🛡️ GameBoard: On GameBoard page after refresh - no redirects needed')
      return
    }

    // Only redirect if explicitly starting fresh (no game started, no route restoration)
    if (!gameState.selectedCategories.length && !hasGameStarted(gameState)) {
      // Wait for state to be loaded before redirecting away from game
      if (!stateLoaded) {
        devLog('🔄 GameBoard: State still loading, waiting before redirect')
        return
      }
      devLog('🔄 GameBoard: Fresh start - redirecting to categories')
      navigate('/categories')
    }
  }, [gameData, authLoading, user, stateLoaded, gameState, location.pathname, navigate])

  // Load game data and prepare local media URLs
  useEffect(() => {
    if (!gameData?.categories) return

    // Pre-log optimized URLs for debugging
    gameData.categories.forEach(category => {
      if (category.imageUrl) {
        const optimizedUrl = getOptimizedMediaUrl(category.imageUrl, 'medium', 'category')
        if (optimizedUrl !== category.imageUrl) {
          devLog(`☁️ Optimized: ${category.name} -> ${optimizedUrl}`)
        }
      }
    })
  }, [gameData])

  // Immediate category image preloading for selected categories only
  const preloadSelectedCategoryImages = async (data) => {
    if (!data?.categories || !gameState.selectedCategories.length) return

    try {
      const selectedCategoryImages = []

      gameState.selectedCategories.forEach(categoryId => {
        const category = data.categories?.find(cat => cat.id === categoryId)
        if (category?.imageUrl) {
          selectedCategoryImages.push(category.imageUrl)
        }
      })

      if (selectedCategoryImages.length > 0) {
        devLog(`🖼️ Immediately preloading ${selectedCategoryImages.length} selected category images...`)

        // Preload all selected category images in parallel with persistent caching
        const preloadResults = await Promise.allSettled(selectedCategoryImages.map(async (imageUrl) => {
          try {
            const localImageUrl = getOptimizedMediaUrl(imageUrl)

            // Simple browser preload - no localStorage needed since files are now local
            const img = new Image()
            await new Promise((resolve, reject) => {
              img.onload = resolve
              img.onerror = reject
              img.src = localImageUrl
            })

            devLog(`✅ Category image preloaded: ${imageUrl.split('/').pop()?.split('?')[0]}`)
            setLoadedImages(prev => new Set([...prev, imageUrl]))
            return { url: imageUrl, cached: true }
          } catch (error) {
            // Image will load normally via background-image, no need to fail here
            devLog(`ℹ️ Category image will load on-demand: ${imageUrl.split('/').pop()?.split('?')[0]}`)
            return { url: imageUrl, cached: false }
          }
        }))

        // Log caching results
        const successful = preloadResults.filter(r => r.status === 'fulfilled' && r.value.cached).length
        devLog(`🎯 Cached ${successful}/${selectedCategoryImages.length} category images persistently`)

        devLog('🎯 Selected category images preloading complete')
      }
    } catch (error) {
      devWarn('⚠️ Category image preloading error (non-critical):', error)
    }
  }

  // Smart preloading function - preload questions and category images that might be used
  const startSmartPreloading = async (data) => {
    if (!data || !gameState.selectedCategories.length) return

    try {
      // Get only the questions we might actually use (2 per difficulty per category)
      const questionsToPreload = []

      gameState.selectedCategories.forEach(categoryId => {
        if (data.questions[categoryId]) {
          const questions = data.questions[categoryId]

          // Group by difficulty
          const byDifficulty = {
            easy: questions.filter(q => q.difficulty === 'easy'),
            medium: questions.filter(q => q.difficulty === 'medium'),
            hard: questions.filter(q => q.difficulty === 'hard')
          }

          // Take up to 2 questions per difficulty (6 total per category)
          Object.values(byDifficulty).forEach(difficultyQuestions => {
            questionsToPreload.push(...difficultyQuestions.slice(0, 2))
          })
        }
      })

      devLog(`🎯 Smart preloading ${questionsToPreload.length} likely questions`)

      // Start background preloading of question images without blocking UI
      try {
        devLog('🎯 Starting background preloading of question images')
        const questionImagePreloads = questionsToPreload
          .filter(q => q.imageUrl)
          .map(async (question) => {
            try {
              const localImageUrl = getOptimizedMediaUrl(question.imageUrl)

              // Simple browser preload for question images
              const img = new Image()
              await new Promise((resolve, reject) => {
                img.onload = resolve
                img.onerror = reject
                img.src = localImageUrl
              })

              devLog(`✅ Question image preloaded: ${question.imageUrl.split('/').pop()?.split('?')[0]}`)
            } catch (error) {
              devWarn(`⚠️ Question image will load on-demand: ${question.imageUrl}`)
            }
          })
        await Promise.allSettled(questionImagePreloads)
      } catch (error) {
        devWarn('⚠️ Question image preloading failed (non-critical):', error)
      }

    } catch (error) {
      devWarn('⚠️ Smart preloading error (non-critical):', error)
    }
  }

  // Preload media for current GameBoard questions only
  const preloadGameBoardMedia = async (data) => {
    if (!data || !gameState.selectedCategories.length) return

    try {
      // Preload the first 2 questions of each difficulty for each selected category
      // This matches the GameBoard grid (6 questions per category: 2 easy, 2 medium, 2 hard)
      const gameBoardQuestions = []

      for (const categoryId of gameState.selectedCategories) {
        const categoryQuestions = data.questions[categoryId] || []

        // For each difficulty level, get the first 2 questions
        const difficulties = ['easy', 'medium', 'hard']

        difficulties.forEach(difficulty => {
          const questionsOfDifficulty = categoryQuestions.filter(q => q.difficulty === difficulty)
          // Take first 2 questions of this difficulty (matching GameBoard layout)
          const selectedQuestions = questionsOfDifficulty.slice(0, 2)
          gameBoardQuestions.push(...selectedQuestions)
        })
      }

      const expectedQuestions = gameState.selectedCategories.length * 6 // 6 questions per category
      devLog(`🚀 Preloading media for ${gameBoardQuestions.length}/${expectedQuestions} GameBoard questions...`)

      // Use the gamePreloader to preload GameBoard questions
      await gamePreloader.preloadQuestionAssets(gameBoardQuestions, 8, (completed, total) => {
        devLog(`📦 GameBoard media preload progress: ${completed}/${total}`)
      })

      devLog('✅ GameBoard media preloading completed!')

    } catch (error) {
      devWarn('⚠️ GameBoard media preloading failed (non-critical):', error)
    }
  }

  // Load game data from Firebase - runs once per mount
  useEffect(() => {
    const loadGameData = async () => {
      try {
        setLoadingError(null)
        const data = await GameDataLoader.loadGameData(false) // Use cache if available

        if (data) {
          setGameData(data)
          setInitialLoadComplete(true)

          // Defer non-critical operations to avoid blocking UI
          setTimeout(() => {
            // Update question pool for global usage tracking (only if user is set)
            if (user?.uid) {
              questionUsageTracker.setUserId(user.uid)
              questionUsageTracker.updateQuestionPool(data)
            }

            // Start background preloading (non-blocking)
            preloadSelectedCategoryImages(data)
            startSmartPreloading(data)

            // Preload media for current gameboard questions
            preloadGameBoardMedia(data)
          }, 100) // Small delay to let UI render first
        } else {
          throw new Error('No game data received')
        }
      } catch (error) {
        prodError('❌ GameBoard: Error loading game data:', error)
        setLoadingError(error.message)

        // Try fallback
        try {
          const fallbackData = await GameDataLoader.loadSampleData()
          setGameData(fallbackData)
          setInitialLoadComplete(true)

          // Update question pool for global usage tracking with fallback data (only if user is set)
          if (user?.uid) {
            questionUsageTracker.setUserId(user.uid)
            questionUsageTracker.updateQuestionPool(fallbackData)
          }

          // Start smart preloading with fallback data (deferred)
          setTimeout(() => startSmartPreloading(fallbackData), 100)
        } catch (fallbackError) {
          prodError('❌ GameBoard: Fallback failed:', fallbackError)
          setLoadingError('Unable to load game data. Please refresh the page.')
        }
      }
    }

    loadGameData()
  }, []) // Run once on mount - component fully unmounts when switching routes

  useEffect(() => {
    // Only wait for essential data for dimensions - don't block on everything
    if (!gameData) return

    // BULLETPROOF: Never redirect if game has started or should stay on page
    if (hasGameStarted(gameState) || shouldStayOnCurrentPage(gameState, location.pathname)) {
      devLog('🛡️ GameBoard (dimensions): Game active or route restored - no redirects')
      // Continue with normal dimensions setup
    } else if (!gameState.selectedCategories.length && location.pathname !== '/game' && stateLoaded) {
      // Only redirect if absolutely fresh start AND not on GameBoard page AND state is loaded
      devLog('🔄 GameBoard (dimensions): Fresh start - redirecting to categories')
      navigate('/categories')
      return
    }

    const updateDimensions = () => {
      if (containerRef.current) {
        const rect = containerRef.current.getBoundingClientRect()
        setDimensions({ width: rect.width, height: rect.height })
      }

      if (headerRef.current) {
        const headerRect = headerRef.current.getBoundingClientRect()
        setHeaderHeight(headerRect.height)
      }

      if (footerRef.current) {
        const footerRect = footerRef.current.getBoundingClientRect()
        setFooterHeight(footerRect.height)
      }
    }

    // Call immediately on mount
    updateDimensions()

    // Debounce resize events to prevent excessive re-renders (150ms delay)
    const debouncedResize = debounce(updateDimensions, 150)
    window.addEventListener('resize', debouncedResize)
    return () => window.removeEventListener('resize', debouncedResize)
  }, [gameData, stateLoaded, gameState.selectedCategories.length, navigate])

  // Check if all questions are finished and navigate to results
  useEffect(() => {
    if (!gameState.selectedCategories.length) return

    const totalQuestions = gameState.selectedCategories.length * 6 // 6 questions per category (3 difficulty levels × 2 questions each)
    const answeredQuestions = gameState.usedQuestions.size

    devLog(`GameBoard completion check: ${answeredQuestions}/${totalQuestions} questions answered`)

    // If all questions have been answered, automatically go to results
    if (answeredQuestions >= totalQuestions && answeredQuestions > 0) {
      devLog('🎉 All questions completed from GameBoard! Navigating to results...')
      // Small delay to allow any UI updates
      setTimeout(() => {
        navigate('/results')
      }, 1000)
    }
  }, [gameState.usedQuestions.size, gameState.selectedCategories.length, navigate])

  const getCategoryById = (categoryId) => {
    if (gameData && gameData.categories) {
      return gameData.categories.find(cat => cat.id === categoryId)
    }
    return null
  }

  const shouldShowImageInQuestion = (categoryId) => {
    const category = getCategoryById(categoryId)
    return category ? category.showImageInQuestion !== false : true
  }

  const shouldShowImageInAnswer = (categoryId) => {
    const category = getCategoryById(categoryId)
    return category ? category.showImageInAnswer !== false : true
  }

  const isQuestionUsed = (categoryId, questionIndex) => {
    return gameState.usedQuestions.has(`${categoryId}-${questionIndex}`)
  }

  const isPointValueUsed = (categoryId, points, buttonIndex) => {
    // Create button key for this specific button
    const buttonKey = `${categoryId}-${points}-${buttonIndex}`

    // Debug: Show all used questions (removed for performance)

    // Check if we have an assigned question for this button
    const assignment = gameState.assignedQuestions?.[buttonKey]

    if (assignment && assignment.questionId) {
      // If there's an assigned question, check if it has been answered
      const isAnswered = gameState.usedQuestions.has(assignment.questionId)
      // Debug logging removed for performance

      // Also check for variations of the question ID format
      const possibleFormats = [
        assignment.questionId,
        `${categoryId}-${assignment.questionId}`,
        `${assignment.questionId}-answered`,
        `question-${assignment.questionId}`
      ]

      // Debug: Checking possible ID formats (removed for performance)
      for (const format of possibleFormats) {
        if (gameState.usedQuestions.has(format)) {
          // Found match with format (debug removed)
          return true
        }
      }

      return false
    }

    // If no assigned question yet, check the old usedPointValues system for backwards compatibility
    const pointValueKey = `${categoryId}-${points}-${buttonIndex}`
    const isUsedOld = gameState.usedPointValues && gameState.usedPointValues.has(pointValueKey)

    return isUsedOld || false
  }

  const getPoints = () => [200, 400, 600]

  const getQuestionPoints = (questionIndex) => {
    const points = getPoints()
    return points[questionIndex]
  }

  const handleMysteryQuestionClick = async (points, buttonIndex = 0) => {
    // Create unique button key for mystery category
    const buttonKey = `mystery-${points}-${buttonIndex}`

    // Check if we already have a mystery question assigned to this button
    if (gameState.assignedQuestions?.[buttonKey]) {
      const assignment = gameState.assignedQuestions[buttonKey]

      // Get questions from the original category
      if (gameData && gameData.questions && gameData.questions[assignment.originalCategoryId]) {
        const questions = gameData.questions[assignment.originalCategoryId]
        const question = questions.find(q => q.id === assignment.questionId)

        if (question) {
          const questionData = {
            categoryId: 'mystery',
            originalCategoryId: assignment.originalCategoryId,
            questionIndex: questions.indexOf(question),
            question: question,
            points: assignment.points,
            category: 'الفئة الغامضة',
            originalCategory: assignment.originalCategory,
            questionKey: `mystery-${questions.indexOf(question)}`,
            pointValueKey: buttonKey,
            isMystery: true
          }

          setGameState(prev => ({
            ...prev,
            currentQuestion: questionData
          }))
          navigate('/question')
          return
        }
      }
    }

    // Get all available categories except the selected ones (excluding mystery)
    const selectedCategoryIds = gameState.selectedCategories.filter(id => id !== 'mystery')
    const allCategories = gameData?.categories || []

    devLog('🔍 Mystery Category Debug:')
    devLog('  - All categories:', allCategories.map(c => c.name))
    devLog('  - Selected categories:', selectedCategoryIds)
    devLog('  - Categories with questions:', Object.keys(gameData?.questions || {}))

    const unselectedCategories = allCategories.filter(cat =>
      !selectedCategoryIds.includes(cat.id) &&
      cat.id !== 'mystery' &&
      gameData.questions[cat.id] &&
      gameData.questions[cat.id].length > 0
    )

    devLog('  - Unselected categories available for mystery:', unselectedCategories.map(c => `${c.name} (${gameData.questions[c.id].length} questions)`))

    if (unselectedCategories.length === 0) {
      devWarn('❌ No unselected categories available for mystery question')
      alert('لا توجد فئات غير محددة متاحة للفئة الغامضة')
      return
    }

    // Determine difficulty based on points
    let targetDifficulty
    if (points === 200) targetDifficulty = 'easy'
    else if (points === 400) targetDifficulty = 'medium'
    else if (points === 600) targetDifficulty = 'hard'
    else return

    // Collect available questions from all unselected categories
    let availableQuestions = []

    for (const category of unselectedCategories) {
      const categoryQuestions = gameData.questions[category.id] || []
      const questionsWithDifficulty = categoryQuestions.filter(q => q.difficulty === targetDifficulty)

      if (user?.uid) {
        questionUsageTracker.setUserId(user.uid)
        const availableQuestionsFromCategory = await questionUsageTracker.getAvailableQuestions(questionsWithDifficulty, targetDifficulty)

        // Add category info to each question for tracking
        availableQuestionsFromCategory.forEach(q => {
          availableQuestions.push({
            ...q,
            originalCategoryId: category.id,
            originalCategory: category.name
          })
        })
      }
    }

    // Fallback to any difficulty if no questions found
    if (availableQuestions.length === 0) {
      const fallbackDifficulties = targetDifficulty === 'easy' ? ['medium', 'hard'] :
                                  targetDifficulty === 'medium' ? ['easy', 'hard'] :
                                  ['medium', 'easy']

      for (const difficulty of fallbackDifficulties) {
        for (const category of unselectedCategories) {
          const categoryQuestions = gameData.questions[category.id] || []
          const questionsWithDifficulty = categoryQuestions.filter(q => q.difficulty === difficulty)

          if (user?.uid) {
            const availableQuestionsFromCategory = await questionUsageTracker.getAvailableQuestions(questionsWithDifficulty, difficulty)
            availableQuestionsFromCategory.forEach(q => {
              availableQuestions.push({
                ...q,
                originalCategoryId: category.id,
                originalCategory: category.name
              })
            })
          }
        }
        if (availableQuestions.length > 0) break
      }
    }

    if (availableQuestions.length === 0) {
      devWarn('No available mystery questions found')
      return
    }

    // Select a random question from available ones
    const randomQuestion = availableQuestions[Math.floor(Math.random() * availableQuestions.length)]
    const originalCategoryQuestions = gameData.questions[randomQuestion.originalCategoryId]
    const originalQuestionIndex = originalCategoryQuestions.indexOf(originalCategoryQuestions.find(q => q.id === randomQuestion.id))

    const questionData = {
      categoryId: 'mystery',
      originalCategoryId: randomQuestion.originalCategoryId,
      questionIndex: originalQuestionIndex,
      question: randomQuestion,
      points: points,
      category: 'الفئة الغامضة',
      originalCategory: randomQuestion.originalCategory,
      questionKey: `mystery-${originalQuestionIndex}`,
      pointValueKey: buttonKey,
      isMystery: true
    }

    // Store assignment for persistence
    setGameState(prev => ({
      ...prev,
      currentQuestion: questionData,
      assignedQuestions: {
        ...prev.assignedQuestions,
        [buttonKey]: {
          questionId: randomQuestion.id,
          categoryId: 'mystery',
          originalCategoryId: randomQuestion.originalCategoryId,
          originalCategory: randomQuestion.originalCategory,
          points: points,
          category: 'الفئة الغامضة',
          buttonIndex: buttonIndex
        }
      }
    }))

    navigate('/question')
  }

  const handleQuestionClick = async (categoryId, points, buttonIndex = 0) => {
    const category = getCategoryById(categoryId)
    if (!category) return

    // Check if this is a Mystery Category question
    if (categoryId === 'mystery') {
      return handleMysteryQuestionClick(points, buttonIndex)
    }

    // Create unique button key for persistent question mapping
    const buttonKey = `${categoryId}-${points}-${buttonIndex}`

    // Check if we already have a question assigned to this button
    if (gameState.assignedQuestions?.[buttonKey]) {
      const assignment = gameState.assignedQuestions[buttonKey]
      // Using previously assigned question ID (debug removed)

      // Get questions from Firebase data
      let questions
      if (gameData && gameData.questions && gameData.questions[categoryId]) {
        questions = gameData.questions[categoryId]
      } else {
        prodError('No questions found for category:', categoryId)
        return
      }

      // Find the question by ID
      let question = questions.find(q => q.id === assignment.questionId)
      if (!question) {
        devWarn('Previously assigned question not found by ID:', assignment.questionId)
        devLog('Available question IDs:', questions.map(q => q.id))

        // Fallback: Clear the invalid assignment and select a new question
        const updatedAssignments = { ...gameState.assignedQuestions }
        delete updatedAssignments[buttonKey]

        setGameState(prev => ({
          ...prev,
          assignedQuestions: updatedAssignments
        }))

        // Continue with normal question selection logic by falling through
        devLog('Cleared invalid assignment, will select new question')
      } else {
        // Found the previously assigned question, use it
        const questionData = {
          categoryId: assignment.categoryId,
          questionIndex: questions.indexOf(question),
          question: question, // Fresh data from database
          points: assignment.points,
          category: assignment.category,
          questionKey: `${assignment.categoryId}-${questions.indexOf(question)}`,
          pointValueKey: `${assignment.categoryId}-${assignment.points}-${assignment.buttonIndex}`
        }

        setGameState(prev => ({
          ...prev,
          currentQuestion: questionData
        }))

        navigate('/question')
        return
      }
    }

    // Get questions from Firebase data
    let questions
    if (gameData && gameData.questions && gameData.questions[categoryId]) {
      questions = gameData.questions[categoryId]
    } else {
      prodError('No questions found for category:', categoryId)
      return
    }

    if (!questions || questions.length === 0) {
      devWarn(`No questions found for category: ${categoryId}`)
      return
    }

    // Determine difficulty based on points
    let targetDifficulty
    if (points === 200) {
      targetDifficulty = 'easy'
    } else if (points === 400) {
      targetDifficulty = 'medium'
    } else if (points === 600) {
      targetDifficulty = 'hard'
    } else {
      devWarn(`Invalid points value: ${points}`)
      return
    }

    // Ensure user ID is set for tracking
    if (user?.uid) {
      questionUsageTracker.setUserId(user.uid)
    }

    // Filter questions by difficulty and global usage
    const questionsWithDifficulty = questions.filter(q => q.difficulty === targetDifficulty)
    const availableQuestionsByDifficulty = await questionUsageTracker.getAvailableQuestions(questionsWithDifficulty, targetDifficulty)

    // Debug: Looking for questions (removed for performance)

    if (availableQuestionsByDifficulty.length === 0) {
      devWarn(`❌ No unused ${targetDifficulty} questions found for category: ${categoryId}`)

      // Smart fallback: try nearby difficulties with global usage filtering
      let fallbackDifficulty = null
      let fallbackQuestions = []

      if (targetDifficulty === 'easy') {
        // For easy (200): try medium, then hard
        // Trying fallback: easy → medium → hard
        fallbackQuestions = await questionUsageTracker.getAvailableQuestions(questions.filter(q => q.difficulty === 'medium'), 'medium')
        if (fallbackQuestions.length > 0) {
          fallbackDifficulty = 'medium'
        } else {
          fallbackQuestions = await questionUsageTracker.getAvailableQuestions(questions.filter(q => q.difficulty === 'hard'), 'hard')
          fallbackDifficulty = 'hard'
        }
      } else if (targetDifficulty === 'medium') {
        // For medium (400): try easy, then hard
        // Trying fallback: medium → easy → hard
        fallbackQuestions = await questionUsageTracker.getAvailableQuestions(questions.filter(q => q.difficulty === 'easy'), 'easy')
        if (fallbackQuestions.length > 0) {
          fallbackDifficulty = 'easy'
        } else {
          fallbackQuestions = await questionUsageTracker.getAvailableQuestions(questions.filter(q => q.difficulty === 'hard'), 'hard')
          fallbackDifficulty = 'hard'
        }
      } else if (targetDifficulty === 'hard') {
        // For hard (600): try medium, then easy
        // Trying fallback: hard → medium → easy
        fallbackQuestions = await questionUsageTracker.getAvailableQuestions(questions.filter(q => q.difficulty === 'medium'), 'medium')
        if (fallbackQuestions.length > 0) {
          fallbackDifficulty = 'medium'
        } else {
          fallbackQuestions = await questionUsageTracker.getAvailableQuestions(questions.filter(q => q.difficulty === 'easy'), 'easy')
          fallbackDifficulty = 'easy'
        }
      }

      if (fallbackQuestions.length > 0) {
        const fallbackQuestion = fallbackQuestions[Math.floor(Math.random() * fallbackQuestions.length)]
        const fallbackIndex = questions.indexOf(fallbackQuestion)

        // Using fallback question (debug removed)

        const fallbackQuestionData = {
          categoryId,
          questionIndex: fallbackIndex,
          question: fallbackQuestion,
          points,
          category: category.name,
          questionKey: `${categoryId}-${fallbackIndex}`,
          pointValueKey: `${categoryId}-${points}-${buttonIndex}`
        }

        setGameState(prev => ({
          ...prev,
          currentQuestion: fallbackQuestionData,
          // Store this fallback question assignment for persistence
          assignedQuestions: {
            ...prev.assignedQuestions,
            [buttonKey]: fallbackQuestionData
          }
        }))

        navigate('/question')
        return
      }

      // Final fallback: use any globally available question
      const anyAvailableQuestions = await questionUsageTracker.getAvailableQuestions(questions)

      if (anyAvailableQuestions.length > 0) {
        const finalFallback = anyAvailableQuestions[0]
        const finalIndex = questions.indexOf(finalFallback)
        // Final fallback: using any globally available question

        const finalQuestionData = {
          categoryId,
          questionIndex: finalIndex,
          question: finalFallback,
          points,
          category: category.name,
          questionKey: `${categoryId}-${finalIndex}`,
          pointValueKey: `${categoryId}-${points}-${buttonIndex}`
        }

        setGameState(prev => ({
          ...prev,
          currentQuestion: finalQuestionData,
          // Store this final fallback question assignment for persistence
          assignedQuestions: {
            ...prev.assignedQuestions,
            [buttonKey]: finalQuestionData
          }
        }))

        navigate('/question')
      } else {
        prodError(`❌ No globally available questions remain in category: ${categoryId}`)
      }
      return
    }

    // Use globally filtered available questions
    if (availableQuestionsByDifficulty.length === 0) {
      devWarn(`No globally unused ${targetDifficulty} questions available for category: ${categoryId}`)
      return
    }

    // Pick a random question from globally available ones
    const randomQuestion = availableQuestionsByDifficulty[Math.floor(Math.random() * availableQuestionsByDifficulty.length)]
    const originalQuestionIndex = questions.indexOf(randomQuestion)

    // Selected question (debug removed)

    const questionData = {
      categoryId,
      questionIndex: originalQuestionIndex,
      question: randomQuestion,
      points,
      category: category.name,
      questionKey: `${categoryId}-${originalQuestionIndex}`,
      pointValueKey: `${categoryId}-${points}-${buttonIndex}`
    }

    setGameState(prev => {
      const newAssignedQuestions = {
        ...prev.assignedQuestions,
        [buttonKey]: {
          questionId: randomQuestion.id,
          categoryId,
          points,
          category: category.name,
          buttonIndex
        }
      }

      // Assigning question ID to button (debug removed)

      return {
        ...prev,
        currentQuestion: questionData,
        // Store only question ID and metadata for persistence
        assignedQuestions: newAssignedQuestions
      }
    })

    navigate('/question')
  }

  // Helper function to get perk icon SVG (matching CategorySelection style)
  const getPerkIcon = (perkType, isUsed, isCurrentTurn) => {
    const fillColor = isUsed || !isCurrentTurn ? '#6b7280' : '#dc2626'

    switch (perkType) {
      case 'double':
        return (
          <svg viewBox="0 0 24 24" fill="none" style={{ width: '100%', height: '100%' }}>
            <path d="M12 2L15.09 8.26L22 9.27L17 14.14L18.18 21.02L12 17.77L5.82 21.02L7 14.14L2 9.27L8.91 8.26L12 2Z" fill={fillColor} stroke="none"/>
            <text x="12" y="15" textAnchor="middle" fontSize="8" fill="#fff" fontWeight="bold" stroke="#dc2626" strokeWidth="0.5">2</text>
          </svg>
        )
      case 'phone':
        return (
          <svg viewBox="0 0 24 24" fill="none" style={{ width: '100%', height: '100%' }}>
            <path d="M6.62 10.79C8.06 13.62 10.38 15.94 13.21 17.38L15.41 15.18C15.69 14.9 16.08 14.82 16.43 14.93C17.55 15.3 18.75 15.5 20 15.5C20.55 15.5 21 15.95 21 16.5V20C21 20.55 20.55 21 20 21C10.61 21 3 13.39 3 4C3 3.45 3.45 3 4 3H7.5C8.05 3 8.5 3.45 8.5 4C8.5 5.25 8.7 6.45 9.07 7.57C9.18 7.92 9.1 8.31 8.82 8.59L6.62 10.79Z" fill={fillColor} stroke="none"/>
          </svg>
        )
      case 'search':
        return (
          <svg viewBox="0 0 24 24" fill="none" style={{ width: '100%', height: '100%' }}>
            <path d="M15.5 14H14.71L14.43 13.73C15.41 12.59 16 11.11 16 9.5C16 5.91 13.09 3 9.5 3S3 5.91 3 9.5S5.91 16 9.5 16C11.11 16 12.59 15.41 13.73 14.43L14 14.71V15.5L19 20.49L20.49 19L15.5 14ZM9.5 14C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5S14 7.01 14 9.5S11.99 14 9.5 14Z" fill={fillColor} stroke="none"/>
          </svg>
        )
      case 'risk':
        return (
          <svg viewBox="0 0 24 24" fill="none" style={{ width: '100%', height: '100%' }}>
            <rect x="3" y="3" width="18" height="18" rx="3" fill={fillColor} stroke="none"/>
            <circle cx="7" cy="7" r="1.5" fill="#fff" stroke="#dc2626" strokeWidth="0.5"/>
            <circle cx="17" cy="7" r="1.5" fill="#fff" stroke="#dc2626" strokeWidth="0.5"/>
            <circle cx="7" cy="17" r="1.5" fill="#fff" stroke="#dc2626" strokeWidth="0.5"/>
            <circle cx="17" cy="17" r="1.5" fill="#fff" stroke="#dc2626" strokeWidth="0.5"/>
            <circle cx="12" cy="12" r="1.5" fill="#fff" stroke="#dc2626" strokeWidth="0.5"/>
          </svg>
        )
      case 'twoAnswers':
        return (
          <svg viewBox="0 0 72 72" fill="none" style={{ width: '100%', height: '100%' }}>
            <path fill="none" stroke={fillColor} strokeLinecap="round" strokeLinejoin="round" strokeWidth="4" d="m52.62 31.13 1.8-22.18c-0.3427-4.964-6.779-5.02-7.227-0.026l-2.42 17.36c-0.3 2.179-1.278 3.962-2.166 3.962s-1.845-1.785-2.126-3.967l-2.231-17.34c-0.8196-5.278-7.439-4.322-7.037 0.0011l2.527 21.03"/>
            <path fill="none" stroke={fillColor} strokeLinecap="round" strokeLinejoin="round" strokeWidth="4" d="m53.63 50.08c0 9.872-8.02 16.88-17.89 16.88"/>
            <path fill="none" stroke={fillColor} strokeLinecap="round" strokeLinejoin="round" strokeWidth="4" d="m43.74 47.29v-2.333c0-1.1-1.789-2.2-3.976-2.441l-1.049-0.117c-2.187-0.242-3.976-1.851-3.976-3.774s1.8-3.334 4-3.334h10c2.201-0.0448 4.057 1.632 4.235 3.826l0.657 11.21"/>
            <path fill="none" stroke={fillColor} strokeLinecap="round" strokeLinejoin="round" strokeWidth="4" d="m37.96 50.36c1.63-1.48 3.624-2.5 5.777-2.958"/>
            <path fill="none" stroke={fillColor} strokeLinecap="round" strokeMiterlimit="10" strokeWidth="4" d="m18.53 52.1c1.142 8.6 8.539 14.98 17.21 14.86 9.667 0 17.89-6.833 17.89-16.88"/>
            <path fill="none" stroke={fillColor} strokeLinecap="round" strokeLinejoin="round" strokeWidth="4" d="m31.75 49.72c0 1.258-0.6709 2.42-1.76 3.048s-2.431 0.6288-3.52 0-1.76-1.791-1.76-3.048v-15.96c0-1.258 0.6709-2.42 1.76-3.048s2.431-0.6288 3.52 0c1.089 0.6288 1.76 1.791 1.76 3.049z"/>
            <path fill="none" stroke={fillColor} strokeLinecap="round" strokeLinejoin="round" strokeWidth="4" d="m24.71 44.94c0 1.262-0.6709 2.427-1.76 3.058s-2.431 0.6308-3.52 0c-1.089-0.6308-1.76-1.796-1.76-3.058v-7.937c0-1.262 0.6709-2.427 1.76-3.058 1.089-0.6308 2.431-0.6308 3.52 0s1.76 1.796 1.76 3.058z"/>
          </svg>
        )
      case 'prison':
        return (
          <svg viewBox="0 0 24 24" fill="none" style={{ width: '100%', height: '100%' }}>
            <path d="M6 2V22H8V2H6M10 2V22H12V2H10M14 2V22H16V2H14M18 2V22H20V2H18M2 2V4H22V2H2M2 20V22H22V20H2Z" fill={fillColor} stroke="none"/>
          </svg>
        )
      default:
        return null
    }
  }

  // Perk handling functions
  const handlePerkClick = (perkType, team) => {
    // Check if perk is already used (max 1 use per perk per team)
    const currentUsage = gameState.perkUsage?.[team]?.[perkType] || 0
    if (currentUsage >= 1) return

    // Prison perk can be used on opponent's turn, all others require current turn
    const isPrisonPerk = perkType === 'prison'
    if (!isPrisonPerk && gameState.currentTurn !== team) return

    setActivePerk({ type: perkType, team })
    setPerkModalOpen(true)
  }

  const handlePerkConfirm = () => {
    const { type, team } = activePerk

    // Check if perk is already used (max 1 use per perk per team)
    const currentUsage = gameState.perkUsage?.[team]?.[type] || 0
    if (currentUsage >= 1) {
      devWarn(`Perk ${type} already used by ${team}`)
      setPerkModalOpen(false)
      setActivePerk({ type: null, team: null })
      return
    }

    // Update state in a single call to avoid race conditions
    setGameState(prev => {
      const newState = {
        ...prev,
        perkUsage: {
          ...prev.perkUsage,
          [team]: {
            ...prev.perkUsage?.[team],
            [type]: (prev.perkUsage?.[team]?.[type] || 0) + 1
          }
        },
        // Lock perks for this question - no other perks can be used
        currentQuestionPerkLock: team
      }

      // Add perk activation for double points
      if (type === 'double') {
        newState.activatedPerks = {
          ...prev.activatedPerks,
          doublePoints: { active: true, team }
        }
      }

      // Add perk activation for risk points (3x on success, -2x on failure)
      if (type === 'risk') {
        newState.activatedPerks = {
          ...prev.activatedPerks,
          riskPoints: { active: true, team }
        }
      }

      // Add perk activation for prison (visual only)
      if (type === 'prison') {
        newState.activatedPerks = {
          ...prev.activatedPerks,
          prison: { active: true, team, targetTeam: team === 'team1' ? 'team2' : 'team1' }
        }
      }

      return newState
    })

    devLog(`✅ Perk activated: ${type} for ${team}`)

    // Close modal
    setPerkModalOpen(false)
    setActivePerk({ type: null, team: null })
  }

  const handlePerkModalClose = () => {
    setPerkModalOpen(false)
    setActivePerk({ type: null, team: null })
  }

  // Mobile-first responsive system - start with square proportions and scale up
  const getResponsiveStyles = () => {
    const W = window.innerWidth // Use window width directly for better device detection
    const H = window.innerHeight

    // Portrait mode detection for phones
    const isPortrait = H > W
    const isPhone = W <= 768 // Phone detection
    const isUltraNarrow = W < 400 // Very narrow phones (Z Fold, etc.)
    const isNormalPhone = W >= 400 && W <= 500 // Normal phones
    const isPhonePortrait = isPhone && isPortrait

    // Portrait mode detection (debug logs removed for performance)

    // PC Auto-scaling: Apply 2x scaling for desktop/PC users for better visibility
    const isTablet = (W >= 768 && W <= 1024) || (H >= 768 && H <= 1024) // Tablet detection (iPads, etc.)
    const isPC = W > 1024 && H > 768 && !isTablet // Desktop/laptop detection (exclude tablets)
    const pcScaleFactor = isPC ? 2.0 : 1.0 // 200% scaling for PC, normal for mobile/tablet

    const isMobileLayout = W < 768

    // Calculate available space for game board
    const actualHeaderHeight = headerHeight || 80
    const actualFooterHeight = footerHeight || 100
    // Responsive padding: minimal for phones, more for PC
    const padding = isPhonePortrait || isUltraNarrow ? 3 : isMobileLayout ? 6 : 10
    const availableHeight = Math.max(200, H - actualHeaderHeight - actualFooterHeight - (padding * 2))
    const availableWidth = Math.max(300, W - (padding * 2))

    // Responsive grid: 3×2 for portrait phones, 2×3 for everything else
    let rows, cols
    if (isPhonePortrait) {
      rows = 3
      cols = 2
    } else {
      rows = 2
      cols = 3
    }

    // Dimensions calculated (debug logs removed for performance)

    // Aggressive gap reduction for ultra-narrow screens and portrait mode to maximize content space
    let rowGap, colGap
    if (isPhonePortrait) {
      // Portrait mode: Minimize column gaps to maximize space for 2x3 grid
      if (isUltraNarrow) {
        rowGap = Math.max(4, Math.min(8, H * 0.006)) // Reduced gaps for phones
        colGap = 2 // Very minimal fixed column gap for phones
      } else {
        rowGap = Math.max(5, Math.min(10, H * 0.008)) // Reduced gaps for normal portrait
        colGap = 3 // Minimal fixed column gap for portrait
      }
    } else if (isUltraNarrow) {
      rowGap = Math.max(4, Math.min(8, W * 0.006)) // Small gaps for ultra-narrow
      colGap = 2 // Minimal column gaps
    } else if (isMobileLayout) {
      rowGap = Math.max(8, Math.min(15, W * 0.008)) // Row gaps for mobile
      colGap = Math.max(3, Math.min(5, W * 0.005)) // Column gaps for mobile
    } else {
      rowGap = Math.max(12, Math.min(20, W * 0.012)) // Increased row gaps for desktop
      colGap = Math.max(3, Math.min(6, W * 0.005)) // Column gaps for desktop
    }

    // Calculate space for each category group
    const totalRowGaps = rowGap * (rows - 1)
    const totalColGaps = colGap * (cols - 1)
    const categoryGroupHeight = (availableHeight - totalRowGaps) / rows
    const categoryGroupWidth = (availableWidth - totalColGaps) / cols

    // Ultra-aggressive gap optimization for narrow screens and portrait mode
    let minColGap, maxColGap, minRowGap, maxRowGap
    if (isPhonePortrait) {
      // Portrait mode gap limits
      if (isUltraNarrow) {
        minColGap = 2; maxColGap = 6; minRowGap = 1; maxRowGap = 4 // Minimal gaps for ultra-narrow portrait
      } else {
        minColGap = 4; maxColGap = 12; minRowGap = 2; maxRowGap = 8 // Moderate gaps for normal phone portrait
      }
    } else if (isUltraNarrow) {
      minColGap = 1; maxColGap = 3; minRowGap = 1; maxRowGap = 2 // Minimal gaps for ultra-narrow
    } else if (isMobileLayout) {
      minColGap = 3; maxColGap = 10; minRowGap = 2; maxRowGap = 6 // Reduced gaps
    } else {
      minColGap = 6; maxColGap = 16; minRowGap = 4; maxRowGap = 12 // Reduced gaps
    }

    const baseInnerColGap = Math.max(minColGap, Math.min(maxColGap, categoryGroupWidth * (isUltraNarrow ? 0.015 : 0.025))) // Much smaller multiplier for ultra-narrow
    const baseInnerRowGap = Math.max(minRowGap, Math.min(maxRowGap, categoryGroupHeight * (isUltraNarrow ? 0.008 : 0.015))) // Much smaller multiplier for ultra-narrow

    // Optimize space utilization: Use more of available space
    // For the new [WIDE_BTN][CARD] layout, allocate space efficiently
    const buttonColumnWidth = Math.min(140, categoryGroupWidth * 0.4) // Wider button columns for badge style
    const availableCardWidth = categoryGroupWidth - buttonColumnWidth - baseInnerColGap

    // Responsive card system with dynamic aspect ratios
    let cardWidth, cardHeight, buttonHeight

    // Calculate optimal button height - bigger buttons within each category
    const baseButtonHeight = (categoryGroupHeight * 0.96) / 4 // Use 96% of height

    // Cleaner card proportions like the reference images
    let cardAspectRatio
    if (isPhonePortrait) {
      // Portrait mode: Make cards more compact vertically
      if (isUltraNarrow) {
        cardAspectRatio = 0.7 // Taller cards for ultra-narrow portrait
        buttonHeight = Math.max(20, baseButtonHeight * 0.90)
      } else {
        cardAspectRatio = 0.85 // Taller cards for normal portrait
        buttonHeight = Math.max(25, baseButtonHeight * 0.95)
      }
    } else if (isUltraNarrow) {
      cardAspectRatio = 0.85 // Slightly taller for narrow screens
      buttonHeight = Math.max(25, baseButtonHeight)
    } else if (isMobileLayout) {
      cardAspectRatio = 1.1 // Slightly rectangular (11:10 ratio)
      buttonHeight = Math.max(30, baseButtonHeight)
    } else {
      cardAspectRatio = 1.25 // More rectangular for desktop (5:4 ratio)
      buttonHeight = Math.max(35, baseButtonHeight)
    }

    // Calculate card width to use most of the category space
    // Total button row width = cardWidth + (buttonWidth * 1.6)
    // We want this to be close to categoryGroupWidth

    // First, estimate button width from height
    const estimatedButtonWidth = buttonHeight * 2.0 // BUTTON_ASPECT_RATIO

    // Calculate card width to fill remaining space after buttons
    // Target: cardWidth + (buttonWidth * 1.6) ≈ categoryGroupWidth * 0.98
    let targetTotalWidth = categoryGroupWidth * 0.98 // Use 98% of available width
    let estimatedTotalButtonSpace = estimatedButtonWidth * 1.6

    // Calculate card width from available space
    cardWidth = targetTotalWidth - estimatedTotalButtonSpace

    // Apply constraints based on aspect ratio
    if (cardAspectRatio < 1.0) {
      // For taller cards, also check against height-based width
      const estimatedHeight = categoryGroupHeight * 0.92
      const heightBasedWidth = estimatedHeight * cardAspectRatio
      cardWidth = Math.min(cardWidth, heightBasedWidth)
    }

    // Apply minimum card width limits - much lower for phones to allow scaling
    const minCardWidth = isPhonePortrait || isUltraNarrow ? 40 : 50
    cardWidth = Math.max(minCardWidth, cardWidth)

    // cardHeight will be set later to match button column exactly

    buttonHeight = Math.min(buttonHeight, categoryGroupHeight * 0.32) // Allow bigger buttons

    // Calculate gaps first - make gaps smaller to give more space to buttons
    const innerColGap = Math.max(8, Math.min(30, categoryGroupWidth * 0.04))
    const innerRowGap = Math.max(2, Math.min(8, buttonHeight * 0.15)) // Much smaller gaps within category

    // Ultra conservative calculation to absolutely ensure no overflow
    // Calculate gaps - smaller for phones and narrow screens
    const gapSize = isPhonePortrait || isUltraNarrow || isMobileLayout ? 2 : 3
    const totalGapSpace = gapSize * 2

    // Use only 85% of available height to leave very generous buffer
    const safeHeight = categoryGroupHeight * 0.85

    // Direct calculation: safe height minus gaps, divided by 3 buttons
    const maxPossibleButtonHeight = (safeHeight - totalGapSpace) / 3

    // Apply minimum constraint
    const actualFinalButtonHeight = Math.max(
      14, // Lower minimum for very narrow screens
      maxPossibleButtonHeight
    )

    // Consistent button width calculation - same aspect ratio for all devices
    const BUTTON_ASPECT_RATIO = 2.0 // Same aspect ratio for all devices
    const calculatedButtonWidth = actualFinalButtonHeight * BUTTON_ASPECT_RATIO

    // Ensure total width (card + buttons) fits within categoryGroupWidth
    // Button row total width = cardWidth + (buttonWidth * 1.6) [0.8 left + 0.8 right]
    const maxButtonWidthToFit = (categoryGroupWidth - cardWidth) / 1.6

    // Calculate button width to fill remaining space
    // We already calculated cardWidth to leave room for buttons
    // Now calculate actual button width from remaining space
    const remainingWidth = categoryGroupWidth * 0.98 - cardWidth
    const maxPossibleButtonWidth = remainingWidth / 1.6 // Since we use buttonWidth * 1.6 total

    // Apply aspect ratio and size limits
    const calculatedFromAspect = calculatedButtonWidth

    let buttonMultiplier
    if (isPhonePortrait || isUltraNarrow) {
      buttonMultiplier = 1.3 // Allow larger buttons for phones
    } else if (isMobileLayout) {
      buttonMultiplier = 1.4
    } else {
      buttonMultiplier = 1.6 // Larger buttons for PC
    }

    // Use the maximum possible width but constrain by aspect ratio limits
    const maxButtonWidth = Math.min(
      maxPossibleButtonWidth, // Use available space
      calculatedFromAspect * buttonMultiplier // But don't exceed proportional limit
    )
    const minButtonWidth = isPhonePortrait || isUltraNarrow ? 25 : 35 // Lower minimum for phones

    const constrainedButtonWidth = Math.max(minButtonWidth, Math.min(calculatedButtonWidth, maxButtonWidth))

    // Calculate the actual gaps used in the layout - use the fixed gap size for consistency
    const actualInnerRowGap = gapSize

    // Calculate card height to match button column height exactly
    const finalButtonColumnHeight = (actualFinalButtonHeight * 3) + (actualInnerRowGap * 2)

    // For phones: text section = button height, so reduce card to prevent overflow
    // Card = button column height - (button height - small text margin)
    let cardSafetyMargin
    if (isUltraNarrow || isPhonePortrait) {
      // Reduce card by the extra space the taller text section takes
      cardSafetyMargin = actualFinalButtonHeight * 0.15 // 15% reduction
    } else {
      cardSafetyMargin = 0 // PC: exact match
    }
    cardHeight = Math.max(35, finalButtonColumnHeight - cardSafetyMargin)


    // Consistent button font sizing - same scaling for all devices
    const baseFontSize = Math.min(
      actualFinalButtonHeight * 0.6, // Same proportion for all devices
      constrainedButtonWidth * 0.25 // Same proportion for all devices
    )

    // Same font size limits for all devices
    const minFontSize = 10
    const maxFontSize = 22

    const fontSize = Math.max(minFontSize, Math.min(maxFontSize, baseFontSize))

    // More rounded buttons like the reference images
    const buttonBorderRadius = Math.max(
      actualFinalButtonHeight * 0.45, // Much more rounded - almost pill-shaped
      isUltraNarrow ? 12 : 16 // Minimum roundness
    )

    // Enhanced per-category font scaling - each category adjusts individually
    const getCardFontSize = (categoryName, cardWidth, cardHeight, buttonFontSize) => {
      const textLength = categoryName ? categoryName.length : 10
      // Match the JSX padding exactly
      const padding = isUltraNarrow ? 12 : 20 // 6px or 10px each side = 12px or 20px total
      const availableWidth = cardWidth - padding
      const minFontSize = isUltraNarrow ? 5 : isMobileLayout ? 7 : 8

      // Height constraints - match the actual smaller text section height (scale for PC)
      const baseTextSectionHeight = Math.max(18, Math.min(30, cardHeight * 0.06))
      const textSectionHeight = baseTextSectionHeight * pcScaleFactor

      // More conservative height constraint for single words and long text
      // Single words need extra room for vertical rendering
      const isLikelySingleWord = !categoryName.includes(' ') && textLength > 6
      const heightSafetyMargin = isLikelySingleWord ? 0.65 : 0.75 // More conservative for single words
      const maxFontSizeForHeight = textSectionHeight * heightSafetyMargin

      // Much more conservative character width estimation for Arabic text
      // Arabic characters are generally wider and need more space
      let charWidthRatio
      if (textLength <= 6) {
        charWidthRatio = 0.8 // Very short text - still conservative
      } else if (textLength <= 10) {
        charWidthRatio = 0.85 // Short text
      } else if (textLength <= 14) {
        charWidthRatio = 0.9 // Medium text
      } else if (textLength <= 18) {
        charWidthRatio = 0.95 // Long text
      } else {
        charWidthRatio = 1.0 // Very long text - most conservative
      }

      // Add extra safety margin for Arabic text
      const maxFontSizeForWidth = (availableWidth / textLength) / charWidthRatio * 0.85

      // Use the more restrictive constraint (width or height)
      let scaledFontSize = Math.min(maxFontSizeForWidth, maxFontSizeForHeight)

      // More aggressive scaling for Arabic text to prevent cutoff
      if (textLength > 20) {
        scaledFontSize *= 0.7 // Very aggressive for very long text
      } else if (textLength > 16) {
        scaledFontSize *= 0.75 // Aggressive for long text
      } else if (textLength > 12) {
        scaledFontSize *= 0.8 // Moderate for medium-long text
      } else if (textLength > 8) {
        scaledFontSize *= 0.85 // Slight reduction for medium text
      }
      // Very short text (<=8 chars) keeps full calculated size

      // Set reasonable bounds first
      const maxAllowedSize = Math.min(buttonFontSize, isUltraNarrow ? 14 : isMobileLayout ? 18 : 24)
      let candidateSize = Math.max(minFontSize, Math.min(maxAllowedSize, scaledFontSize))

      // Canvas-based text measurement for overflow detection
      // This works for all device types (PC, narrow phones, normal phones, tablets)
      const measureTextHeight = (text, fontSize, fontFamily) => {
        const canvas = document.createElement('canvas')
        const ctx = canvas.getContext('2d')
        ctx.font = `${fontSize}px ${fontFamily}`

        // Get text metrics including ascenders and descenders
        const metrics = ctx.measureText(text)

        // Calculate actual height including ascenders and descenders
        const actualHeight = metrics.actualBoundingBoxAscent + metrics.actualBoundingBoxDescent

        return actualHeight || fontSize * 1.2 // Fallback for older browsers
      }

      // Font family matching the CSS (from index.html)
      const fontFamily = 'Tajawal, Cairo, Tahoma, Arial, sans-serif'

      // Iteratively reduce font size until text fits within container height
      const maxIterations = 10
      let iterations = 0

      while (iterations < maxIterations) {
        const actualTextHeight = measureTextHeight(categoryName, candidateSize * pcScaleFactor, fontFamily)

        if (actualTextHeight <= textSectionHeight) {
          break // Text fits!
        }

        // Reduce font size by 10% and try again
        candidateSize *= 0.9

        // Don't go below minimum
        if (candidateSize < minFontSize) {
          candidateSize = minFontSize
          break
        }

        iterations++
      }

      return candidateSize * pcScaleFactor
    }

    // Header sizing - matching QuestionView's exact calculation
    let headerBaseFontSize = 16
    const actualVH = H

    if (actualVH <= 390) {
      headerBaseFontSize = 14
    } else if (actualVH <= 430) {
      headerBaseFontSize = 15
    } else if (actualVH <= 568) {
      headerBaseFontSize = 16
    } else if (actualVH <= 667) {
      headerBaseFontSize = 17
    } else if (actualVH <= 812) {
      headerBaseFontSize = 18
    } else if (actualVH <= 896) {
      headerBaseFontSize = 19
    } else if (actualVH <= 1024) {
      headerBaseFontSize = 20
    } else {
      headerBaseFontSize = isPC ? 24 : 20
    }

    const globalScaleFactor = 1.0
    const headerFontSize = headerBaseFontSize * globalScaleFactor
    const buttonPadding = Math.max(8, globalScaleFactor * 12)
    const headerPadding = Math.max(8, buttonPadding * 0.25)
    const calculatedHeaderHeight = Math.max(56, headerFontSize * 3)

    const baseFooterButtonSize = Math.max(30, Math.min(60, H * 0.08)) * pcScaleFactor
    const footerButtonSize = isUltraNarrow ? baseFooterButtonSize * 0.9 : baseFooterButtonSize // Reduce by 10% for ultra-narrow

    // Dynamic footer vertical padding based on screen height - fully responsive
    const footerVerticalPadding = pcScaleFactor > 1
      ? Math.max(24, Math.min(40, Math.floor(H * 0.035))) // PC: 3.5% of height (24-40px)
      : isUltraNarrow
        ? Math.max(4, Math.min(8, Math.floor(H * 0.01))) // Ultra narrow: 1% (4-8px)
        : isPhonePortrait
          ? Math.max(6, Math.min(10, Math.floor(H * 0.012))) // Portrait: 1.2% (6-10px)
          : Math.max(6, Math.min(9, Math.floor(H * 0.01))) // Landscape: 1% (6-9px)

    // Dynamic footer horizontal padding based on screen width
    const footerHorizontalPadding = pcScaleFactor > 1
      ? Math.max(48, Math.min(80, Math.floor(W * 0.04))) // PC: 4% of width (48-80px)
      : isUltraNarrow
        ? Math.max(4, Math.min(8, Math.floor(W * 0.015))) // Ultra narrow: 1.5% (4-8px)
        : isPhonePortrait
          ? Math.max(2, Math.min(6, Math.floor(W * 0.01))) // Portrait: 1% (2-6px) - reduced
          : Math.max(12, Math.min(20, Math.floor(W * 0.025))) // Landscape: 2.5% (12-20px)

    // Dynamic element sizing for footer to prevent overflow
    // Calculate available width after padding
    const availableFooterWidth = W - (footerHorizontalPadding * 2)

    // For mobile devices, calculate dynamic widths based on available space
    let footerTeamNameWidth, footerScoreWidth, footerPerkSize, footerMiddleGap

    if (pcScaleFactor > 1) {
      // PC: Fixed sizes
      footerTeamNameWidth = 240
      footerScoreWidth = 240
      footerPerkSize = 50 // Based on existing calculation
      footerMiddleGap = 260 // Large spacer for PC (accommodate 240px logo)
    } else if (isPhonePortrait) {
      // Portrait: Layout with middle spacing
      // Layout: Score(X) + 3×Perk + [MIDDLE GAP] + 3×Perk + Score(X)
      const middleGap = Math.max(16, availableFooterWidth * 0.05) // 5% middle gap, min 16px
      const gapsPerSide = 4 // gaps between elements on each side
      const totalGapSpace = gapsPerSide * 4 * 2 // 4px gaps
      const totalPerksPerSide = 3
      const usableWidth = availableFooterWidth - middleGap - totalGapSpace

      // Allocate: 50% to scores (25% each), 50% to perks (25% each side)
      const spaceForScores = usableWidth * 0.50 // 50% for both scores
      const spaceForPerks = usableWidth * 0.50 // 50% for all perks (6 total)

      footerScoreWidth = Math.max(70, Math.min(110, Math.floor(spaceForScores / 2)))
      footerPerkSize = Math.max(18, Math.min(26, Math.floor(spaceForPerks / (totalPerksPerSide * 2))))
      footerTeamNameWidth = footerScoreWidth // Same width as score for consistency
      footerMiddleGap = middleGap // Use calculated middle gap
    } else {
      // Landscape: More space available with smart collision detection
      // Logo dimensions
      const logoWidth = isTablet ? 160 : 200 // Logo size based on device
      const logoSafeZone = logoWidth + 20 // Logo + 10px padding on each side

      // Calculate space available for each team (half the width minus logo safe zone)
      const spacePerTeam = (availableFooterWidth - logoSafeZone) / 2

      // Each team has: Score + gap + 3×Perk + 3×gaps between perks
      const baseGap = 8
      const totalPerks = 3
      const totalGaps = 1 + (totalPerks - 1) // gap after score + gaps between perks

      // Start with ideal sizes
      let idealScoreWidth = isTablet ? 160 : 180
      let idealPerkSize = isTablet ? 28 : 32

      // Calculate what we need
      const neededWidth = idealScoreWidth + (idealPerkSize * totalPerks) + (baseGap * totalGaps)

      // If it doesn't fit, resize proportionally (both teams equally)
      if (neededWidth > spacePerTeam) {
        const scaleFactor = spacePerTeam / neededWidth
        idealScoreWidth = Math.floor(idealScoreWidth * scaleFactor)
        idealPerkSize = Math.floor(idealPerkSize * scaleFactor)
      }

      // Apply with min/max bounds
      footerScoreWidth = Math.max(100, Math.min(200, idealScoreWidth))
      footerPerkSize = Math.max(20, Math.min(36, idealPerkSize))
      footerTeamNameWidth = footerScoreWidth // Same width as score for consistency
      footerMiddleGap = logoSafeZone // Exactly the logo safe zone
    }

    return {
      cardWidth: cardWidth,
      cardHeight: cardHeight,
      buttonWidth: constrainedButtonWidth,
      buttonHeight: actualFinalButtonHeight,
      fontSize: fontSize * pcScaleFactor,
      buttonBorderRadius: buttonBorderRadius,
      getCardFontSize: getCardFontSize,
      headerFontSize: headerFontSize,
      headerPadding: headerPadding,
      headerHeight: calculatedHeaderHeight,
      footerButtonSize: footerButtonSize,
      footerVerticalPadding: footerVerticalPadding,
      footerHorizontalPadding: footerHorizontalPadding,
      footerTeamNameWidth: footerTeamNameWidth,
      footerScoreWidth: footerScoreWidth,
      footerPerkSize: footerPerkSize,
      footerMiddleGap: footerMiddleGap,
      categoryGroupWidth: categoryGroupWidth,
      categoryGroupHeight: categoryGroupHeight,
      innerColGap: innerColGap,
      innerRowGap: actualInnerRowGap,
      rowGap: rowGap,
      colGap: colGap,
      rows: rows,
      cols: cols,
      isUltraNarrow: isUltraNarrow,
      isNormalPhone: isNormalPhone,
      isMobileLayout: isMobileLayout,
      isTablet: isTablet,
      availableHeight: availableHeight,
      availableWidth: availableWidth,
      pcScaleFactor: pcScaleFactor,
      actualHeaderHeight: headerHeight || 80,
      actualFooterHeight: footerHeight || 100,
      padding: padding,
      isPhonePortrait: isPhonePortrait // Keep for portrait-specific styling adjustments
    }
  }

  const styles = getResponsiveStyles()

  // Wait for state to load before checking categories
  // This prevents false "no categories" state during Firebase loading
  if (!stateLoaded) {
    return (
      <div className="min-h-screen w-full flex items-center justify-center bg-[#f7f2e6]">
        <div className="bg-white/95 backdrop-blur-sm rounded-3xl shadow-2xl p-6 text-center">
          <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-red-600 mx-auto mb-3"></div>
          <h1 className="text-lg font-bold text-red-800">جاري تحميل حالة اللعبة...</h1>
        </div>
      </div>
    )
  }

  if (!gameState.selectedCategories.length) {
    return (
      <div className="min-h-screen w-full flex items-center justify-center bg-[#f7f2e6]">
        <div className="bg-white/95 backdrop-blur-sm rounded-3xl shadow-2xl p-6 text-center">
          <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-red-600 mx-auto mb-3"></div>
          <h1 className="text-lg font-bold text-red-800">جاري تحميل لوحة اللعبة...</h1>
        </div>
      </div>
    )
  }

  // Never show loading screen - use skeleton instead

  // Show error state
  if (loadingError) {
    return (
      <div className="h-screen bg-[#f7f2e6] flex flex-col items-center justify-center p-4">
        <div className="text-center max-w-md">
          <div className="text-red-600 text-6xl mb-4">🎮</div>
          <h2 className="text-2xl font-bold text-gray-800 mb-2">خطأ في تحميل اللعبة</h2>
          <p className="text-gray-600 mb-4">{loadingError}</p>
          <div className="flex gap-3 justify-center">
            <button
              onClick={() => window.location.reload()}
              className="bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded-lg"
            >
              إعادة المحاولة
            </button>
            <button
              onClick={() => navigate('/categories')}
              className="bg-gray-600 hover:bg-gray-700 text-white px-4 py-2 rounded-lg"
            >
              العودة للفئات
            </button>
          </div>
        </div>
      </div>
    )
  }

  // Show skeleton only for critical loading states - allow partial rendering
  // Fixed: Don't show skeleton if we have basic gameState data, even during auth loading
  const showSkeleton = !initialLoadComplete && !gameData && (!stateLoaded || (authLoading && !user && !gameState.selectedCategories.length))

  return (
    <div className="h-screen w-full bg-[#f7f2e6] flex flex-col overflow-hidden" ref={containerRef}>
      {/* Red Header Bar */}
      <div
        ref={headerRef}
        className="bg-gradient-to-r from-red-600 via-red-700 to-red-600 text-white flex-shrink-0 sticky top-0 z-10 overflow-visible relative shadow-lg"
        style={{
          padding: `${styles.headerPadding}px`,
          height: `${styles.headerHeight}px`
        }}
      >
        {styles.isPhonePortrait ? (
          /* Portrait Mode: Header with team turn and hamburger menu */
          <div className="flex justify-between items-center h-full">
            <div className="flex items-center gap-2">
              <LogoDisplay />
              <div className="flex items-center gap-1">
                <span className="text-xs sm:text-sm md:text-base">دور:</span>
                <span className="font-bold text-sm sm:text-base md:text-lg" dir="auto">
                  {gameState.currentTurn === 'team1'
                    ? gameState.team1.name
                    : gameState.currentTurn === 'team2'
                    ? gameState.team2.name
                    : 'لا يوجد'}
                </span>
              </div>
            </div>

            <div className="flex items-center flex-1 justify-center px-2">
              <h1 className="font-bold text-center text-sm sm:text-base md:text-lg truncate max-w-full" dir="auto">
                {gameState.gameName}
              </h1>
            </div>

            <div className="flex items-center portrait-menu relative">
              <button
                onClick={() => setPortraitMenuOpen(!portraitMenuOpen)}
                className="bg-red-700 hover:bg-red-800 text-white rounded-lg transition-colors flex items-center justify-center w-8 h-8 sm:w-9 sm:h-9 md:w-10 md:h-10 text-lg sm:text-xl"
              >
                ☰
              </button>
            </div>
          </div>
        ) : (
          /* Landscape Mode: Original full header */
          <div className="flex justify-between items-center h-full md:px-12 lg:px-16 xl:px-20 2xl:px-28">
            <div className="flex items-center gap-3">
              <LogoDisplay />
              <span className="font-bold text-white text-sm md:text-base lg:text-lg xl:text-xl">
                دور:
              </span>
              <span className="font-bold text-white text-sm md:text-base lg:text-lg xl:text-xl" dir="auto">
                {gameState.currentTurn === 'team1'
                  ? gameState.team1.name
                  : gameState.currentTurn === 'team2'
                  ? gameState.team2.name
                  : 'لا يوجد'}
              </span>
              <button
                onClick={() => setGameState(prev => ({
                  ...prev,
                  currentTurn: prev.currentTurn === 'team1' ? 'team2' : 'team1'
                }))}
                className="hover:bg-white/10 text-white rounded-lg transition-colors flex items-center justify-center p-1"
              >
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" className="sm:w-7 sm:h-7 md:w-8 md:h-8 lg:w-9 lg:h-9">
                  <path d="M12 4V1L8 5l4 4V6c3.31 0 6 2.69 6 6 0 1.01-.25 1.97-.7 2.8l1.46 1.46C19.54 15.03 20 13.57 20 12c0-4.42-3.58-8-8-8zm0 14c-3.31 0-6-2.69-6-6 0-1.01.25-1.97.7-2.8L5.24 7.74C4.46 8.97 4 10.43 4 12c0 4.42 3.58 8 8 8v3l4-4-4-4v3z" fill="white"/>
                </svg>
              </button>
            </div>

            <div className="flex items-center gap-4">
              <h1 className="font-bold text-center text-base md:text-lg lg:text-xl xl:text-2xl" dir="auto">
                {gameState.gameName}
              </h1>
            </div>

            <div className="flex gap-3">
              <PresentationModeToggle className="text-sm md:text-base" />
              <button
                onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
                className="px-3 py-1 bg-red-700 hover:bg-red-800 text-white rounded-lg transition-colors text-sm md:text-base"
              >
                الرجوع للوحة
              </button>
              <button
                onClick={() => navigate('/results')}
                className="px-3 py-1 bg-red-700 hover:bg-red-800 text-white rounded-lg transition-colors text-sm md:text-base"
              >
                انهاء
              </button>
            </div>
          </div>
        )}

      </div>

      {/* Game Board - Perfect Scaled Layout */}
      <div
        className="flex-1 bg-[#f7f2e6] flex flex-col items-center justify-center"
        style={{
          width: '100%',
          minHeight: '0',
          padding: `${styles.padding}px`
        }}
      >
        <div
          className={`grid ${styles.isPhonePortrait ? 'grid-cols-2 grid-rows-3' : 'grid-cols-3 grid-rows-2'} w-full h-full`}
          style={{
            gap: `${styles.rowGap}px ${styles.colGap}px`,
            maxWidth: '100vw',
            maxHeight: '100vh'
          }}
        >
          {gameState.selectedCategories.slice(0, 6).map((categoryId, categoryIndex) => {
            const category = getCategoryById(categoryId)

            // Show skeleton if loading
            if (showSkeleton) {
              return (
                <div
                  key={`skeleton-${categoryIndex}`}
                  className="relative flex items-center justify-center animate-pulse max-sm:max-w-80 max-md:max-w-[420px] lg:max-w-[500px] xl:max-w-[550px] 4xl:max-w-[600px] mx-auto"
                  style={{
                    width: `${styles.categoryGroupWidth}px`,
                    height: `${styles.categoryGroupHeight}px`,
                    maxHeight: `${styles.categoryGroupHeight}px`
                  }}
                >
                  {/* Skeleton buttons */}
                  <div className="absolute inset-0 flex flex-col justify-center items-center" style={{ gap: `${styles.innerRowGap}px`, zIndex: 30 }}>
                    {[1, 2, 3].map((i) => (
                      <div
                        key={i}
                        className="bg-gray-200 rounded"
                        style={{
                          width: `${styles.cardWidth + (styles.buttonWidth * 1.6)}px`,
                          height: `${styles.buttonHeight}px`,
                          borderRadius: `${styles.buttonBorderRadius}px`
                        }}
                      />
                    ))}
                  </div>
                  {/* Skeleton card */}
                  <div className="absolute inset-0 flex items-center justify-center" style={{ zIndex: 50 }}>
                    <div
                      className="bg-gray-100 border-2 border-gray-200 rounded shadow-lg"
                      style={{
                        width: `${styles.cardWidth}px`,
                        height: `${styles.cardHeight}px`
                      }}
                    />
                  </div>
                </div>
              )
            }

            if (!category) return null

            return (
              <div
                key={categoryId}
                className="relative flex items-center justify-center max-sm:max-w-80 max-md:max-w-[420px] lg:max-w-[500px] xl:max-w-[550px] 4xl:max-w-[600px] mx-auto"
                style={{
                  width: '100%',
                  height: '100%',
                  maxWidth: `${styles.categoryGroupWidth}px`,
                  maxHeight: `${styles.categoryGroupHeight}px`,
                  padding: '0',
                  margin: '0 auto',
                  overflow: 'hidden',
                  minHeight: 0
                }}
              >
                {/* Senjem-Style 3-Column Grid: Left Buttons | Card | Right Buttons - NO GAP between columns */}
                <div className="grid items-stretch justify-center w-full" style={{ height: '100%', maxHeight: '100%', minHeight: 0, gridTemplateColumns: '1fr 2fr 1fr' }}>

                  {/* LEFT COLUMN: Score Buttons - Rounded on RIGHT side (facing card) */}
                  <div className="flex gap-1 landscape:max-lg:gap-0.5 flex-col h-full">
                    <button
                      onClick={() => handleQuestionClick(categoryId, 200, 0)}
                      disabled={isPointValueUsed(categoryId, 200, 0)}
                      className={`font-bold transition-all duration-200 leading-tight text-[10px] sm:text-lg md:text-xl lg:text-3xl xl:text-7xl 2xl:text-8xl 3xl:text-[7rem] 4xl:text-[9rem] portrait:sm:text-base portrait:md:text-lg portrait:lg:text-2xl portrait:xl:text-5xl portrait:2xl:text-6xl landscape:sm:text-sm landscape:md:text-base landscape:lg:text-xl landscape:xl:text-3xl landscape:2xl:text-4xl py-1 sm:py-2 xl:py-3 4xl:py-4 landscape:max-lg:py-0 px-1 sm:px-3 xl:px-4 4xl:px-6 w-full flex-1 flex items-center justify-center rounded-r-full shadow-md hover:shadow-lg ${
                        isPointValueUsed(categoryId, 200, 0)
                          ? 'bg-gray-300 text-gray-500 cursor-not-allowed opacity-50'
                          : 'bg-gradient-to-bl from-red-500 to-red-700 text-white hover:from-red-600 hover:to-red-800'
                      }`}
                    >
                      200
                    </button>
                    <button
                      onClick={() => handleQuestionClick(categoryId, 400, 0)}
                      disabled={isPointValueUsed(categoryId, 400, 0)}
                      className={`font-bold transition-all duration-200 leading-tight text-[10px] sm:text-lg md:text-xl lg:text-3xl xl:text-7xl 2xl:text-8xl 3xl:text-[7rem] 4xl:text-[9rem] portrait:sm:text-base portrait:md:text-lg portrait:lg:text-2xl portrait:xl:text-5xl portrait:2xl:text-6xl landscape:sm:text-sm landscape:md:text-base landscape:lg:text-xl landscape:xl:text-3xl landscape:2xl:text-4xl py-1 sm:py-2 xl:py-3 4xl:py-4 landscape:max-lg:py-0 px-1 sm:px-3 xl:px-4 4xl:px-6 w-full flex-1 flex items-center justify-center rounded-r-full shadow-md hover:shadow-lg ${
                        isPointValueUsed(categoryId, 400, 0)
                          ? 'bg-gray-300 text-gray-500 cursor-not-allowed opacity-50'
                          : 'bg-gradient-to-bl from-red-500 to-red-700 text-white hover:from-red-600 hover:to-red-800'
                      }`}
                    >
                      400
                    </button>
                    <button
                      onClick={() => handleQuestionClick(categoryId, 600, 0)}
                      disabled={isPointValueUsed(categoryId, 600, 0)}
                      className={`font-bold transition-all duration-200 leading-tight text-[10px] sm:text-lg md:text-xl lg:text-3xl xl:text-7xl 2xl:text-8xl 3xl:text-[7rem] 4xl:text-[9rem] portrait:sm:text-base portrait:md:text-lg portrait:lg:text-2xl portrait:xl:text-5xl portrait:2xl:text-6xl landscape:sm:text-sm landscape:md:text-base landscape:lg:text-xl landscape:xl:text-3xl landscape:2xl:text-4xl py-1 sm:py-2 xl:py-3 4xl:py-4 landscape:max-lg:py-0 px-1 sm:px-3 xl:px-4 4xl:px-6 w-full flex-1 flex items-center justify-center rounded-r-full shadow-md hover:shadow-lg ${
                        isPointValueUsed(categoryId, 600, 0)
                          ? 'bg-gray-300 text-gray-500 cursor-not-allowed opacity-50'
                          : 'bg-gradient-to-bl from-red-500 to-red-700 text-white hover:from-red-600 hover:to-red-800'
                      }`}
                    >
                      600
                    </button>
                  </div>

                  {/* CENTER COLUMN: Category Card */}
                  <div className="overflow-hidden relative h-full w-full">
                    <BackgroundImage
                      src={category.imageUrl}
                      size="medium"
                      context="category"
                      categoryId={category.id}
                      className="absolute inset-0 w-full h-full object-cover"
                      fallbackGradient="from-gray-200 to-gray-400"
                    >
                      {!category.imageUrl && category.image && (
                        <div className="absolute inset-0 flex items-center justify-center text-6xl sm:text-7xl md:text-8xl lg:text-9xl">
                          {category.image}
                        </div>
                      )}
                    </BackgroundImage>

                    {/* Text section at bottom with red gradient */}
                    <div className="category-text-section bg-gradient-to-b from-red-100 to-red-200 text-gray-900 text-center font-bold flex items-center justify-center absolute left-0 right-0 bottom-0 border-t-2 border-t-red-600 text-[7px] sm:text-[15px] md:text-lg lg:text-2xl xl:text-5xl 2xl:text-6xl 3xl:text-7xl 4xl:text-8xl portrait:sm:text-sm portrait:md:text-base portrait:lg:text-xl portrait:xl:text-3xl portrait:2xl:text-4xl landscape:sm:text-[9px] landscape:md:text-sm landscape:lg:text-lg landscape:xl:text-2xl landscape:2xl:text-4xl px-1 sm:px-2 py-1 sm:py-1.5 xl:py-2 leading-normal shadow-inner"
                         style={{
                           lineHeight: '1.4',
                           paddingBottom: '0.35em'
                         }}>
                      <span className="whitespace-nowrap inline-block truncate">
                        {category.name}
                      </span>
                    </div>
                  </div>

                  {/* RIGHT COLUMN: Score Buttons - Rounded on LEFT side (facing card) */}
                  <div className="flex gap-1 landscape:max-lg:gap-0.5 flex-col h-full">
                    <button
                      onClick={() => handleQuestionClick(categoryId, 200, 1)}
                      disabled={isPointValueUsed(categoryId, 200, 1)}
                      className={`font-bold transition-all duration-200 leading-tight text-[10px] sm:text-lg md:text-xl lg:text-3xl xl:text-7xl 2xl:text-8xl 3xl:text-[7rem] 4xl:text-[9rem] portrait:sm:text-base portrait:md:text-lg portrait:lg:text-2xl portrait:xl:text-5xl portrait:2xl:text-6xl landscape:sm:text-sm landscape:md:text-base landscape:lg:text-xl landscape:xl:text-3xl landscape:2xl:text-4xl py-1 sm:py-2 xl:py-3 4xl:py-4 landscape:max-lg:py-0 px-1 sm:px-3 xl:px-4 4xl:px-6 w-full flex-1 flex items-center justify-center rounded-l-full shadow-md hover:shadow-lg ${
                        isPointValueUsed(categoryId, 200, 1)
                          ? 'bg-gray-300 text-gray-500 cursor-not-allowed opacity-50'
                          : 'bg-gradient-to-br from-red-500 to-red-700 text-white hover:from-red-600 hover:to-red-800'
                      }`}
                    >
                      200
                    </button>
                    <button
                      onClick={() => handleQuestionClick(categoryId, 400, 1)}
                      disabled={isPointValueUsed(categoryId, 400, 1)}
                      className={`font-bold transition-all duration-200 leading-tight text-[10px] sm:text-lg md:text-xl lg:text-3xl xl:text-7xl 2xl:text-8xl 3xl:text-[7rem] 4xl:text-[9rem] portrait:sm:text-base portrait:md:text-lg portrait:lg:text-2xl portrait:xl:text-5xl portrait:2xl:text-6xl landscape:sm:text-sm landscape:md:text-base landscape:lg:text-xl landscape:xl:text-3xl landscape:2xl:text-4xl py-1 sm:py-2 xl:py-3 4xl:py-4 landscape:max-lg:py-0 px-1 sm:px-3 xl:px-4 4xl:px-6 w-full flex-1 flex items-center justify-center rounded-l-full shadow-md hover:shadow-lg ${
                        isPointValueUsed(categoryId, 400, 1)
                          ? 'bg-gray-300 text-gray-500 cursor-not-allowed opacity-50'
                          : 'bg-gradient-to-br from-red-500 to-red-700 text-white hover:from-red-600 hover:to-red-800'
                      }`}
                    >
                      400
                    </button>
                    <button
                      onClick={() => handleQuestionClick(categoryId, 600, 1)}
                      disabled={isPointValueUsed(categoryId, 600, 1)}
                      className={`font-bold transition-all duration-200 leading-tight text-[10px] sm:text-lg md:text-xl lg:text-3xl xl:text-7xl 2xl:text-8xl 3xl:text-[7rem] 4xl:text-[9rem] portrait:sm:text-base portrait:md:text-lg portrait:lg:text-2xl portrait:xl:text-5xl portrait:2xl:text-6xl landscape:sm:text-sm landscape:md:text-base landscape:lg:text-xl landscape:xl:text-3xl landscape:2xl:text-4xl py-1 sm:py-2 xl:py-3 4xl:py-4 landscape:max-lg:py-0 px-1 sm:px-3 xl:px-4 4xl:px-6 w-full flex-1 flex items-center justify-center rounded-l-full shadow-md hover:shadow-lg ${
                        isPointValueUsed(categoryId, 600, 1)
                          ? 'bg-gray-300 text-gray-500 cursor-not-allowed opacity-50'
                          : 'bg-gradient-to-br from-red-500 to-red-700 text-white hover:from-red-600 hover:to-red-800'
                      }`}
                    >
                      600
                    </button>
                  </div>

                </div>

              </div>
            )
          })}
        </div>
      </div>

      {/* Footer Score Controls */}
      <div ref={footerRef} className="bg-gradient-to-b from-amber-100 to-[#f7f2e6] border-t-2 border-red-200 flex-shrink-0 px-1 sm:px-2 md:px-4 lg:px-6 xl:px-12 4xl:px-20 py-1 sm:py-2 lg:py-3 xl:py-4 4xl:py-6 shadow-lg">
        {styles.isPhonePortrait ? (
          <div className="flex flex-col gap-2 w-full">
            {/* First Row: Team Names */}
            <div className="flex items-center w-full justify-between mb-2">
              {/* Team 1 Name wrapper matching controls width */}
              <div className="flex items-center relative" style={{ gap: '4px' }}>
                {/* Invisible structure matching controls below */}
                <div className="footer-element-portrait invisible">placeholder</div>
                <div className="w-[18px] h-[18px] sm:w-6 sm:h-6 md:w-7 md:h-7 lg:w-8 lg:h-8 xl:w-9 xl:h-9 invisible"></div>
                <div className="w-[18px] h-[18px] sm:w-6 sm:h-6 md:w-7 md:h-7 lg:w-8 lg:h-8 xl:w-9 xl:h-9 invisible"></div>
                <div className="w-[18px] h-[18px] sm:w-6 sm:h-6 md:w-7 md:h-7 lg:w-8 lg:h-8 xl:w-9 xl:h-9 invisible"></div>
                {/* Team name overlaying all */}
                <div className="bg-gradient-to-r from-red-500 to-red-600 text-white rounded-full font-bold px-3 py-1 text-center text-[11px] sm:text-xs md:text-sm shadow-md truncate absolute top-0 left-0 right-0 flex items-center justify-center" style={{ zIndex: 10 }} dir="auto">
                  {gameState.team1.name}
                </div>
              </div>

              {/* Team 2 Name wrapper matching controls width */}
              <div className="flex items-center relative" style={{ gap: '4px' }}>
                {/* Invisible structure matching controls below */}
                <div className="w-[18px] h-[18px] sm:w-6 sm:h-6 md:w-7 md:h-7 lg:w-8 lg:h-8 xl:w-9 xl:h-9 invisible"></div>
                <div className="w-[18px] h-[18px] sm:w-6 sm:h-6 md:w-7 md:h-7 lg:w-8 lg:h-8 xl:w-9 xl:h-9 invisible"></div>
                <div className="w-[18px] h-[18px] sm:w-6 sm:h-6 md:w-7 md:h-7 lg:w-8 lg:h-8 xl:w-9 xl:h-9 invisible"></div>
                <div className="footer-element-portrait invisible">placeholder</div>
                {/* Team name overlaying all */}
                <div className="bg-gradient-to-r from-red-500 to-red-600 text-white rounded-full font-bold px-3 py-1 text-center text-[11px] sm:text-xs md:text-sm shadow-md truncate absolute top-0 left-0 right-0 flex items-center justify-center" style={{ zIndex: 10 }} dir="auto">
                  {gameState.team2.name}
                </div>
              </div>
            </div>

            {/* Second Row: All Controls */}
            <div className="flex items-center w-full justify-between">
              {/* Team 1 Controls */}
              <div className="flex items-center" style={{ gap: '4px' }}>
                {/* Score with integrated +/- buttons */}
                <div className="footer-element-portrait bg-white border-2 border-gray-300 rounded-full flex items-center justify-between font-bold relative text-xs sm:text-sm md:text-base text-red-700 px-6 py-1">
                  <button
                    onClick={() => setGameState(prev => ({
                      ...prev,
                      team1: { ...prev.team1, score: Math.max(0, prev.team1.score - 100) }
                    }))}
                    className="absolute left-1 bg-red-500 hover:bg-red-600 text-white rounded-full transition-colors flex items-center justify-center"
                    style={{
                      width: '20px',
                      height: '20px',
                      padding: '0'
                    }}
                  >
                    <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                      <rect x="2" y="5" width="8" height="2" rx="1" fill="white"/>
                    </svg>
                  </button>
                  <span className="flex-1 text-center">{gameState.team1.score}</span>
                  <button
                    onClick={() => setGameState(prev => ({
                      ...prev,
                      team1: { ...prev.team1, score: prev.team1.score + 100 }
                    }))}
                    className="absolute right-1 bg-green-500 hover:bg-green-600 text-white rounded-full transition-colors flex items-center justify-center"
                    style={{
                      width: '20px',
                      height: '20px',
                      padding: '0'
                    }}
                  >
                    <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                      <rect x="2" y="5" width="8" height="2" rx="1" fill="white"/>
                      <rect x="5" y="2" width="2" height="8" rx="1" fill="white"/>
                    </svg>
                  </button>
                </div>

                {/* Team 1 Perks - Dynamic based on selection */}
                {(gameState.selectedPerks || ['double', 'phone', 'search']).map(perkId => {
                  const isQuestionViewOnly = ['phone', 'search', 'twoAnswers'].includes(perkId)
                  const isUsed = (gameState.perkUsage?.team1?.[perkId] || 0) >= 1
                  const isCurrentTurn = gameState.currentTurn === 'team1'
                  const isPrisonPerk = perkId === 'prison'
                  const isLockedByOpponent = gameState.currentQuestionPerkLock && gameState.currentQuestionPerkLock !== 'team1'
                  const canActivate = !isQuestionViewOnly && !isLockedByOpponent && (isPrisonPerk || isCurrentTurn)

                  return (
                    <div
                      key={`team1-${perkId}`}
                      className={`border-2 rounded-full flex items-center justify-center transition-colors w-[18px] h-[18px] sm:w-6 sm:h-6 md:w-7 md:h-7 lg:w-8 lg:h-8 xl:w-9 xl:h-9 ${
                        isQuestionViewOnly || isUsed || isLockedByOpponent
                          ? 'border-gray-600 bg-gray-200 opacity-50 cursor-not-allowed'
                          : !canActivate
                          ? 'border-gray-600 bg-gray-100 opacity-60 cursor-not-allowed'
                          : 'border-red-600 bg-white cursor-pointer hover:bg-red-50'
                      }`}
                      onClick={() => !isQuestionViewOnly && !isLockedByOpponent && handlePerkClick(perkId, 'team1')}
                      title={isQuestionViewOnly ? 'متاح فقط أثناء السؤال' : undefined}
                    >
                      {getPerkIcon(perkId, isUsed || isQuestionViewOnly || isLockedByOpponent, canActivate)}
                    </div>
                  )
                })}
              </div>

              {/* Team 2 Controls */}
              <div className="flex items-center" style={{ gap: '4px' }}>
                {/* Team 2 Perks - Dynamic based on selection */}
                {(gameState.selectedPerks || ['double', 'phone', 'search']).map(perkId => {
                  const isQuestionViewOnly = ['phone', 'search', 'twoAnswers'].includes(perkId)
                  const isUsed = (gameState.perkUsage?.team2?.[perkId] || 0) >= 1
                  const isCurrentTurn = gameState.currentTurn === 'team2'
                  const isPrisonPerk = perkId === 'prison'
                  const isLockedByOpponent = gameState.currentQuestionPerkLock && gameState.currentQuestionPerkLock !== 'team2'
                  const canActivate = !isQuestionViewOnly && !isLockedByOpponent && (isPrisonPerk || isCurrentTurn)

                  return (
                    <div
                      key={`team2-${perkId}`}
                      className={`border-2 rounded-full flex items-center justify-center transition-colors w-[18px] h-[18px] sm:w-6 sm:h-6 md:w-7 md:h-7 lg:w-8 lg:h-8 xl:w-9 xl:h-9 ${
                        isQuestionViewOnly || isUsed || isLockedByOpponent
                          ? 'border-gray-600 bg-gray-200 opacity-50 cursor-not-allowed'
                          : !canActivate
                          ? 'border-gray-600 bg-gray-100 opacity-60 cursor-not-allowed'
                          : 'border-red-600 bg-white cursor-pointer hover:bg-red-50'
                      }`}
                      onClick={() => !isQuestionViewOnly && !isLockedByOpponent && handlePerkClick(perkId, 'team2')}
                      title={isQuestionViewOnly ? 'متاح فقط أثناء السؤال' : undefined}
                    >
                      {getPerkIcon(perkId, isUsed || isQuestionViewOnly || isLockedByOpponent, canActivate)}
                    </div>
                  )
                })}

                {/* Score with integrated +/- buttons */}
                <div className="footer-element-portrait bg-white border-2 border-gray-300 rounded-full flex items-center justify-between font-bold relative text-xs sm:text-sm md:text-base text-red-700 px-6 py-1">
                  <button
                    onClick={() => setGameState(prev => ({
                      ...prev,
                      team2: { ...prev.team2, score: Math.max(0, prev.team2.score - 100) }
                    }))}
                    className="absolute left-1 bg-red-500 hover:bg-red-600 text-white rounded-full transition-colors flex items-center justify-center"
                    style={{
                      width: '20px',
                      height: '20px',
                      padding: '0'
                    }}
                  >
                    <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                      <rect x="2" y="5" width="8" height="2" rx="1" fill="white"/>
                    </svg>
                  </button>
                  <span className="flex-1 text-center">{gameState.team2.score}</span>
                  <button
                    onClick={() => setGameState(prev => ({
                      ...prev,
                      team2: { ...prev.team2, score: prev.team2.score + 100 }
                    }))}
                    className="absolute right-1 bg-green-500 hover:bg-green-600 text-white rounded-full transition-colors flex items-center justify-center"
                    style={{
                      width: '20px',
                      height: '20px',
                      padding: '0'
                    }}
                  >
                    <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                      <rect x="2" y="5" width="8" height="2" rx="1" fill="white"/>
                      <rect x="5" y="2" width="2" height="8" rx="1" fill="white"/>
                    </svg>
                  </button>
                </div>
              </div>
            </div>

            {/* Third Row: Sponsor Logo (if doesn't fit in center) */}
            {sponsorLogoLoaded && sponsorLogo && showSponsorLogo && (
              <div className="w-fit mx-auto h-full flex items-center justify-center py-1">
                <img
                  src={sponsorLogo}
                  alt="Game Logo"
                  className="mx-auto max-md:w-24 md:max-h-[6.5rem] 2xl:max-h-[6.7rem] object-contain"
                />
              </div>
            )}
          </div>
        ) : (
          <div className="flex flex-col gap-2 w-full relative">
            {/* Center Logo spanning both rows */}
            {sponsorLogoLoaded && sponsorLogo && showSponsorLogo && (
              <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-10 w-fit mx-auto flex items-center justify-center p-2 md:p-3 lg:p-4">
                <img
                  src={sponsorLogo}
                  alt="Game Logo"
                  className="mx-auto max-md:w-24 md:max-h-[6.5rem] 2xl:max-h-[6.7rem] object-contain"
                />
              </div>
            )}

            {/* First Row: Team Names Only */}
            <div className="flex items-center w-full justify-between mb-2 md:px-12 lg:px-16 xl:px-20 2xl:px-28">
              {/* Team 1 Name wrapper matching controls width */}
              <div className="flex items-center flex-shrink-0 gap-2 md:gap-4 relative">
                {/* Invisible structure matching controls below */}
                <div className="footer-element-landscape invisible">placeholder</div>
                <div className="w-5 h-5 sm:w-6 sm:h-6 md:w-7 md:h-7 lg:w-8 lg:h-8 xl:w-10 xl:h-10 invisible"></div>
                <div className="w-5 h-5 sm:w-6 sm:h-6 md:w-7 md:h-7 lg:w-8 lg:h-8 xl:w-10 xl:h-10 invisible"></div>
                <div className="w-5 h-5 sm:w-6 sm:h-6 md:w-7 md:h-7 lg:w-8 lg:h-8 xl:w-10 xl:h-10 invisible"></div>
                {/* Team name overlaying all */}
                <div className="bg-gradient-to-r from-red-500 to-red-600 text-white rounded-full font-bold text-center px-4 py-1 md:py-2 text-sm md:text-base lg:text-lg xl:text-xl shadow-md truncate absolute top-0 left-0 right-0 flex items-center justify-center" style={{ zIndex: 10 }} dir="auto">
                  {gameState.team1.name}
                </div>
              </div>

              {/* Team 2 Name wrapper matching controls width */}
              <div className="flex items-center flex-shrink-0 gap-2 md:gap-4 relative">
                {/* Invisible structure matching controls below */}
                <div className="w-5 h-5 sm:w-6 sm:h-6 md:w-7 md:h-7 lg:w-8 lg:h-8 xl:w-10 xl:h-10 invisible"></div>
                <div className="w-5 h-5 sm:w-6 sm:h-6 md:w-7 md:h-7 lg:w-8 lg:h-8 xl:w-10 xl:h-10 invisible"></div>
                <div className="w-5 h-5 sm:w-6 sm:h-6 md:w-7 md:h-7 lg:w-8 lg:h-8 xl:w-10 xl:h-10 invisible"></div>
                <div className="footer-element-landscape invisible">placeholder</div>
                {/* Team name overlaying all */}
                <div className="bg-gradient-to-r from-red-500 to-red-600 text-white rounded-full font-bold text-center px-4 py-1 md:py-2 text-sm md:text-base lg:text-lg xl:text-xl shadow-md truncate absolute top-0 left-0 right-0 flex items-center justify-center" style={{ zIndex: 10 }} dir="auto">
                  {gameState.team2.name}
                </div>
              </div>
            </div>

            {/* Second Row: Score & Perks */}
            <div className="flex items-center w-full justify-between md:px-12 lg:px-16 xl:px-20 2xl:px-28">
              {/* Team 1 Controls (Left) */}
              <div className="flex items-center flex-shrink-0 gap-2 md:gap-4">
                {/* Score with integrated +/- buttons */}
                <div className="footer-element-landscape bg-white border-2 border-gray-300 rounded-full flex items-center justify-between font-bold relative text-base md:text-lg lg:text-xl text-red-700 px-8 py-1 md:py-2">
                  <button
                    onClick={() => setGameState(prev => ({
                      ...prev,
                      team1: { ...prev.team1, score: Math.max(0, prev.team1.score - 100) }
                    }))}
                    className="absolute left-1 bg-red-500 hover:bg-red-600 text-white rounded-full transition-colors flex items-center justify-center"
                    style={{
                      width: '24px',
                      height: '24px',
                      padding: '0'
                    }}
                  >
                    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                      <rect x="3" y="7" width="10" height="2" rx="1" fill="white"/>
                    </svg>
                  </button>
                  <span className="flex-1 text-center">{gameState.team1.score}</span>
                  <button
                    onClick={() => setGameState(prev => ({
                      ...prev,
                      team1: { ...prev.team1, score: prev.team1.score + 100 }
                    }))}
                    className="absolute right-1 bg-green-500 hover:bg-green-600 text-white rounded-full transition-colors flex items-center justify-center"
                    style={{
                      width: '24px',
                      height: '24px',
                      padding: '0'
                    }}
                  >
                    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                      <rect x="3" y="7" width="10" height="2" rx="1" fill="white"/>
                      <rect x="7" y="3" width="2" height="10" rx="1" fill="white"/>
                    </svg>
                  </button>
                </div>
              {/* Team 1 Perks - Dynamic based on selection */}
              <div className="flex items-center gap-2 md:gap-4">
                {(gameState.selectedPerks || ['double', 'phone', 'search']).map(perkId => {
                  const isQuestionViewOnly = ['phone', 'search', 'twoAnswers'].includes(perkId)
                  const isUsed = (gameState.perkUsage?.team1?.[perkId] || 0) >= 1
                  const isCurrentTurn = gameState.currentTurn === 'team1'
                  const isPrisonPerk = perkId === 'prison'
                  const isLockedByOpponent = gameState.currentQuestionPerkLock && gameState.currentQuestionPerkLock !== 'team1'
                  const canActivate = !isQuestionViewOnly && !isLockedByOpponent && (isPrisonPerk || isCurrentTurn)

                  return (
                    <div
                      key={`team1-pc-${perkId}`}
                      className={`border-2 rounded-full flex items-center justify-center transition-colors w-5 h-5 sm:w-6 sm:h-6 md:w-7 md:h-7 lg:w-8 lg:h-8 xl:w-10 xl:h-10 ${
                        isQuestionViewOnly || isUsed || isLockedByOpponent
                          ? 'border-gray-600 bg-gray-200 opacity-50 cursor-not-allowed'
                          : !canActivate
                          ? 'border-gray-600 bg-gray-100 opacity-60 cursor-not-allowed'
                          : 'border-red-600 bg-white cursor-pointer hover:bg-red-50'
                      }`}
                      onClick={() => !isQuestionViewOnly && !isLockedByOpponent && handlePerkClick(perkId, 'team1')}
                      title={isQuestionViewOnly ? 'متاح فقط أثناء السؤال' : undefined}
                    >
                      {getPerkIcon(perkId, isUsed || isQuestionViewOnly || isLockedByOpponent, canActivate)}
                    </div>
                  )
                })}
              </div>
            </div>

            {/* Team 2 Controls (Right) */}
            <div className="flex items-center flex-shrink-0 gap-2 md:gap-4">
              {/* Team 2 Perks - Dynamic based on selection */}
              <div className="flex items-center gap-2 md:gap-4">
                {(gameState.selectedPerks || ['double', 'phone', 'search']).map(perkId => {
                  const isQuestionViewOnly = ['phone', 'search', 'twoAnswers'].includes(perkId)
                  const isUsed = (gameState.perkUsage?.team2?.[perkId] || 0) >= 1
                  const isCurrentTurn = gameState.currentTurn === 'team2'
                  const isPrisonPerk = perkId === 'prison'
                  const isLockedByOpponent = gameState.currentQuestionPerkLock && gameState.currentQuestionPerkLock !== 'team2'
                  const canActivate = !isQuestionViewOnly && !isLockedByOpponent && (isPrisonPerk || isCurrentTurn)

                  return (
                    <div
                      key={`team2-pc-${perkId}`}
                      className={`border-2 rounded-full flex items-center justify-center transition-colors w-5 h-5 sm:w-6 sm:h-6 md:w-7 md:h-7 lg:w-8 lg:h-8 xl:w-10 xl:h-10 ${
                        isQuestionViewOnly || isUsed || isLockedByOpponent
                          ? 'border-gray-600 bg-gray-200 opacity-50 cursor-not-allowed'
                          : !canActivate
                          ? 'border-gray-600 bg-gray-100 opacity-60 cursor-not-allowed'
                          : 'border-red-600 bg-white cursor-pointer hover:bg-red-50'
                      }`}
                      onClick={() => !isQuestionViewOnly && !isLockedByOpponent && handlePerkClick(perkId, 'team2')}
                      title={isQuestionViewOnly ? 'متاح فقط أثناء السؤال' : undefined}
                    >
                      {getPerkIcon(perkId, isUsed || isQuestionViewOnly || isLockedByOpponent, canActivate)}
                    </div>
                  )
                })}
              </div>

              {/* Score with integrated +/- buttons */}
              <div className="footer-element-landscape bg-white border-2 border-gray-300 rounded-full flex items-center justify-between font-bold relative text-base md:text-lg lg:text-xl text-red-700 px-8 py-1 md:py-2">
                <button
                  onClick={() => setGameState(prev => ({
                    ...prev,
                    team2: { ...prev.team2, score: Math.max(0, prev.team2.score - 100) }
                  }))}
                  className="absolute left-1 bg-red-500 hover:bg-red-600 text-white rounded-full transition-colors flex items-center justify-center"
                  style={{
                    width: '24px',
                    height: '24px',
                    padding: '0'
                  }}
                >
                  <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                    <rect x="3" y="7" width="10" height="2" rx="1" fill="white"/>
                  </svg>
                </button>
                <span className="flex-1 text-center">{gameState.team2.score}</span>
                <button
                  onClick={() => setGameState(prev => ({
                    ...prev,
                    team2: { ...prev.team2, score: prev.team2.score + 100 }
                  }))}
                  className="absolute right-1 bg-green-500 hover:bg-green-600 text-white rounded-full transition-colors flex items-center justify-center"
                  style={{
                    width: '24px',
                    height: '24px',
                    padding: '0'
                  }}
                >
                  <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                    <rect x="3" y="7" width="10" height="2" rx="1" fill="white"/>
                    <rect x="7" y="3" width="2" height="10" rx="1" fill="white"/>
                  </svg>
                </button>
              </div>
            </div>
          </div>
          </div>
        )}
      </div>

      {/* Perk Modal */}
      <PerkModal
        isOpen={perkModalOpen}
        onClose={handlePerkModalClose}
        perkType={activePerk.type}
        teamName={activePerk.team === 'team1' ? gameState.team1.name : gameState.team2.name}
        onConfirm={handlePerkConfirm}
        usageCount={gameState.perkUsage?.[activePerk.team]?.[activePerk.type] || 0}
        maxUses={1}
        readOnly={false}
      />

      {/* Portrait Menu Dropdown - Rendered at root level to avoid z-index issues */}
      {styles.isPhonePortrait && portraitMenuOpen && (
        <div
          className="fixed bg-red-700 shadow-xl rounded-br-lg border-t border-red-500 portrait-menu"
          style={{
            top: `${Math.max(56, styles.headerFontSize * 3)}px`,
            left: '12px',
            zIndex: 99999,
            width: 'auto',
            minWidth: '140px'
          }}
        >
          <div className="flex flex-col py-2">
            {/* Menu Items */}
            <button
              onClick={() => {
                setGameState(prev => ({
                  ...prev,
                  currentTurn: prev.currentTurn === 'team1' ? 'team2' : 'team1'
                }))
                setPortraitMenuOpen(false)
              }}
              className="px-4 py-2 text-right hover:bg-red-800 transition-colors text-sm flex items-center justify-end gap-2"
            >
              <span>تبديل الدور</span>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                <path d="M12 4V1L8 5l4 4V6c3.31 0 6 2.69 6 6 0 1.01-.25 1.97-.7 2.8l1.46 1.46C19.54 15.03 20 13.57 20 12c0-4.42-3.58-8-8-8zm0 14c-3.31 0-6-2.69-6-6 0-1.01.25-1.97.7-2.8L5.24 7.74C4.46 8.97 4 10.43 4 12c0 4.42 3.58 8 8 8v3l4-4-4-4v3z" fill="white"/>
              </svg>
            </button>

            <button
              onClick={() => {
                window.scrollTo({ top: 0, behavior: 'smooth' })
                setPortraitMenuOpen(false)
              }}
              className="px-4 py-2 text-right hover:bg-red-800 transition-colors text-sm"
            >
              الرجوع للوحة
            </button>

            <div className="px-4 py-2 hover:bg-red-800 transition-colors text-right">
              <PresentationModeToggle style={{ fontSize: '14px' }} />
            </div>

            <button
              onClick={() => {
                navigate('/results')
                setPortraitMenuOpen(false)
              }}
              className="px-4 py-2 text-right hover:bg-red-800 transition-colors text-sm"
            >
              انهاء اللعبة
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

export default GameBoard