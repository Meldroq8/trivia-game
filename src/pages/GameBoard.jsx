import { useState, useEffect, useRef } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { GameDataLoader } from '../utils/gameDataLoader'
import PresentationModeToggle from '../components/PresentationModeToggle'
import { useAuth } from '../hooks/useAuth'
import AudioPlayer from '../components/AudioPlayer'
import PerkModal from '../components/PerkModal'
import { convertToLocalMediaUrl } from '../utils/mediaUrlConverter'
import questionUsageTracker from '../utils/questionUsageTracker'
import LogoDisplay from '../components/LogoDisplay'
import { hasGameStarted, shouldStayOnCurrentPage } from '../utils/gameStateUtils'

function GameBoard({ gameState, setGameState, stateLoaded }) {
  const navigate = useNavigate()
  const location = useLocation()
  const { user, isAuthenticated, loading: authLoading } = useAuth()
  const containerRef = useRef(null)
  const headerRef = useRef(null)
  const footerRef = useRef(null)
  const [dimensions, setDimensions] = useState({ width: 0, height: 0 })
  const [headerHeight, setHeaderHeight] = useState(0)
  const [footerHeight, setFooterHeight] = useState(0)
  const [gameData, setGameData] = useState(null)
  const [loadingError, setLoadingError] = useState(null)
  const [loadedImages, setLoadedImages] = useState(new Set())

  // Perk system state
  const [perkModalOpen, setPerkModalOpen] = useState(false)
  const [activePerk, setActivePerk] = useState({ type: null, team: null })

  // Portrait menu state
  const [portraitMenuOpen, setPortraitMenuOpen] = useState(false)

  // Helper function to get optimized media URL (local static files)
  const getOptimizedMediaUrl = (originalUrl) => {
    if (!originalUrl) return null

    // Convert Firebase Storage URLs to local static file paths
    const localUrl = convertToLocalMediaUrl(originalUrl)

    if (localUrl !== originalUrl) {
      console.log(`🚀 Using local static file: ${originalUrl.split('/').pop()?.split('?')[0]} -> ${localUrl}`)
    }

    return localUrl
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
    console.log('🔧 GameBoard: User changed:', user?.uid ? 'User ID: ' + user.uid : 'No user')
    if (user?.uid) {
      questionUsageTracker.setUserId(user.uid)
      console.log('✅ GameBoard: Set questionUsageTracker user ID to:', user.uid)

      // If we have game data but hadn't set up question tracking yet, do it now
      if (gameData) {
        console.log('🔄 GameBoard: Updating question pool after user authentication')
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

  // BULLETPROOF: No redirects to categories after game starts
  useEffect(() => {
    if (!stateLoaded) return

    // Check if we should stay on this page
    if (shouldStayOnCurrentPage(gameState, location.pathname)) {
      console.log('🛡️ GameBoard: Staying on current page - no redirects allowed')
      return
    }

    // Only redirect if explicitly starting fresh (no game started, no route restoration)
    if (!gameState.selectedCategories.length && !hasGameStarted(gameState)) {
      // Give time for Firebase to load, then check again
      const timeout = setTimeout(() => {
        if (!gameState.selectedCategories.length && !hasGameStarted(gameState) && !shouldStayOnCurrentPage(gameState, location.pathname)) {
          console.log('🔄 GameBoard: Fresh start - redirecting to categories')
          navigate('/categories')
        }
      }, 2000) // Extended timeout for Firebase

      return () => clearTimeout(timeout)
    }
  }, [stateLoaded, gameState, location.pathname, navigate])

  // Load game data and prepare local media URLs
  useEffect(() => {
    if (!gameData?.categories) return

    // Pre-log converted URLs for debugging
    gameData.categories.forEach(category => {
      if (category.imageUrl) {
        const localUrl = convertToLocalMediaUrl(category.imageUrl)
        if (localUrl !== category.imageUrl) {
          console.log(`📂 Mapped: ${category.name} -> ${localUrl}`)
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
        console.log(`🖼️ Immediately preloading ${selectedCategoryImages.length} selected category images...`)

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

            console.log(`✅ Category image preloaded: ${imageUrl.split('/').pop()?.split('?')[0]}`)
            setLoadedImages(prev => new Set([...prev, imageUrl]))
            return { url: imageUrl, cached: true }
          } catch (error) {
            // Image will load normally via background-image, no need to fail here
            console.log(`ℹ️ Category image will load on-demand: ${imageUrl.split('/').pop()?.split('?')[0]}`)
            return { url: imageUrl, cached: false }
          }
        }))

        // Log caching results
        const successful = preloadResults.filter(r => r.status === 'fulfilled' && r.value.cached).length
        console.log(`🎯 Cached ${successful}/${selectedCategoryImages.length} category images persistently`)

        console.log('🎯 Selected category images preloading complete')
      }
    } catch (error) {
      console.warn('⚠️ Category image preloading error (non-critical):', error)
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

      console.log(`🎯 Smart preloading ${questionsToPreload.length} likely questions`)

      // Start background preloading of question images without blocking UI
      try {
        console.log('🎯 Starting background preloading of question images')
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

              console.log(`✅ Question image preloaded: ${question.imageUrl.split('/').pop()?.split('?')[0]}`)
            } catch (error) {
              console.warn(`⚠️ Question image will load on-demand: ${question.imageUrl}`)
            }
          })
        await Promise.allSettled(questionImagePreloads)
      } catch (error) {
        console.warn('⚠️ Question image preloading failed (non-critical):', error)
      }

    } catch (error) {
      console.warn('⚠️ Smart preloading error (non-critical):', error)
    }
  }

  // Load game data from Firebase
  useEffect(() => {
    const loadGameData = async () => {
      try {
        setLoadingError(null)

        console.log('🎮 GameBoard: Loading game data...')
        const data = await GameDataLoader.loadGameData()

        if (data) {
          setGameData(data)
          console.log('✅ GameBoard: Game data loaded successfully')

          // Update question pool for global usage tracking (only if user is set)
          if (user?.uid) {
            questionUsageTracker.setUserId(user.uid) // Ensure user ID is set
            questionUsageTracker.updateQuestionPool(data)
          } else {
            console.log('⏳ GameBoard: Delaying questionUsageTracker until user is authenticated')
          }

          // Immediately preload category images for selected categories
          preloadSelectedCategoryImages(data)

          // Start smart preloading (6 questions per category in background)
          startSmartPreloading(data)
        } else {
          throw new Error('No game data received')
        }
      } catch (error) {
        console.error('❌ GameBoard: Error loading game data:', error)
        setLoadingError(error.message)

        // Try fallback
        try {
          const fallbackData = await GameDataLoader.loadSampleData()
          setGameData(fallbackData)
          console.log('🔄 GameBoard: Using fallback data')

          // Update question pool for global usage tracking with fallback data (only if user is set)
          if (user?.uid) {
            questionUsageTracker.setUserId(user.uid) // Ensure user ID is set
            questionUsageTracker.updateQuestionPool(fallbackData)
          } else {
            console.log('⏳ GameBoard: Delaying questionUsageTracker (fallback) until user is authenticated')
          }

          // Start smart preloading with fallback data
          startSmartPreloading(fallbackData)
        } catch (fallbackError) {
          console.error('❌ GameBoard: Fallback failed:', fallbackError)
          setLoadingError('Unable to load game data. Please refresh the page.')
        }
      }
    }

    loadGameData()
  }, [])

  useEffect(() => {
    // Wait for state to be loaded before doing anything
    if (!stateLoaded) return

    // BULLETPROOF: Never redirect if game has started or should stay on page
    if (hasGameStarted(gameState) || shouldStayOnCurrentPage(gameState, location.pathname)) {
      console.log('🛡️ GameBoard (dimensions): Game active or route restored - no redirects')
      // Continue with normal dimensions setup
    } else if (!gameState.selectedCategories.length) {
      // Only redirect if absolutely fresh start
      console.log('🔄 GameBoard (dimensions): Fresh start - redirecting to categories')
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

    updateDimensions()
    window.addEventListener('resize', updateDimensions)
    return () => window.removeEventListener('resize', updateDimensions)
  }, [gameState.selectedCategories.length, navigate, stateLoaded])

  // Check if all questions are finished and navigate to results
  useEffect(() => {
    if (!gameState.selectedCategories.length) return

    const totalQuestions = gameState.selectedCategories.length * 6 // 6 questions per category (3 difficulty levels × 2 questions each)
    const answeredQuestions = gameState.usedQuestions.size

    console.log(`GameBoard completion check: ${answeredQuestions}/${totalQuestions} questions answered`)

    // If all questions have been answered, automatically go to results
    if (answeredQuestions >= totalQuestions && answeredQuestions > 0) {
      console.log('🎉 All questions completed from GameBoard! Navigating to results...')
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
    const unselectedCategories = allCategories.filter(cat =>
      !selectedCategoryIds.includes(cat.id) &&
      cat.id !== 'mystery' &&
      gameData.questions[cat.id] &&
      gameData.questions[cat.id].length > 0
    )

    if (unselectedCategories.length === 0) {
      console.warn('No unselected categories available for mystery question')
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
      console.warn('No available mystery questions found')
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
        console.error('No questions found for category:', categoryId)
        return
      }

      // Find the question by ID
      const question = questions.find(q => q.id === assignment.questionId)
      if (!question) {
        console.error('Question not found by ID:', assignment.questionId)
        return
      }

      // Create question data with the original question from database
      const questionData = {
        categoryId: assignment.categoryId,
        questionIndex: questions.indexOf(question),
        question: question, // Fresh data from database
        points: assignment.points,
        category: assignment.category,
        questionKey: `${assignment.categoryId}-${questions.indexOf(question)}`,
        pointValueKey: `${assignment.categoryId}-${assignment.points}-${assignment.buttonIndex}`
      }

      // Reconstructed question data from ID (debug removed)

      setGameState(prev => ({
        ...prev,
        currentQuestion: questionData
      }))
      navigate('/question')
      return
    }

    // Get questions from Firebase data
    let questions
    if (gameData && gameData.questions && gameData.questions[categoryId]) {
      questions = gameData.questions[categoryId]
    } else {
      console.error('No questions found for category:', categoryId)
      return
    }

    if (!questions || questions.length === 0) {
      console.warn(`No questions found for category: ${categoryId}`)
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
      console.warn(`Invalid points value: ${points}`)
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
      console.warn(`❌ No unused ${targetDifficulty} questions found for category: ${categoryId}`)

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
        console.error(`❌ No globally available questions remain in category: ${categoryId}`)
      }
      return
    }

    // Use globally filtered available questions
    if (availableQuestionsByDifficulty.length === 0) {
      console.warn(`No globally unused ${targetDifficulty} questions available for category: ${categoryId}`)
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

  // Perk handling functions
  const handlePerkClick = (perkType, team) => {
    // Check if perk is already used (max 1 use per perk per team)
    const currentUsage = gameState.perkUsage?.[team]?.[perkType] || 0
    if (currentUsage >= 1) return

    // Only allow the current team to use perks
    if (gameState.currentTurn !== team) return

    setActivePerk({ type: perkType, team })
    setPerkModalOpen(true)
  }

  const handlePerkConfirm = () => {
    const { type, team } = activePerk

    // Initialize perk usage tracking if it doesn't exist
    if (!gameState.perkUsage) {
      setGameState(prev => ({
        ...prev,
        perkUsage: {
          team1: { double: 0, phone: 0, search: 0 },
          team2: { double: 0, phone: 0, search: 0 }
        }
      }))
    }

    // Check if perk is already used (max 1 use per perk per team)
    const currentUsage = gameState.perkUsage?.[team]?.[type] || 0
    if (currentUsage >= 1) return

    // Update perk usage count
    setGameState(prev => ({
      ...prev,
      perkUsage: {
        ...prev.perkUsage,
        [team]: {
          ...prev.perkUsage?.[team],
          [type]: (prev.perkUsage?.[team]?.[type] || 0) + 1
        }
      }
    }))

    // Store perk activation for use in QuestionView
    if (type === 'double') {
      setGameState(prev => ({
        ...prev,
        activatedPerks: {
          ...prev.activatedPerks,
          doublePoints: { active: true, team }
        }
      }))
    }

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

    // Debug logging for portrait mode
    if (isPhonePortrait) {
      console.log('🔍 PORTRAIT MODE DEBUG:', { W, H, isPortrait, isPhone, isPhonePortrait, isUltraNarrow, isNormalPhone })
    }

    // PC Auto-scaling: Apply 2x scaling for desktop/PC users for better visibility
    const isPC = W >= 1024 && H >= 768 // Desktop/laptop detection
    const pcScaleFactor = isPC ? 2.0 : 1.0 // 200% scaling for PC, normal for mobile/tablet

    // Calculate available space for game board
    const actualHeaderHeight = headerHeight || 80
    const actualFooterHeight = footerHeight || 100
    const padding = 20
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

    // Debug logging for dimensions
    if (isPhonePortrait) {
      console.log('🔍 DIMENSIONS DEBUG:', {
        W, H, actualHeaderHeight, actualFooterHeight, padding,
        availableHeight, availableWidth, rows, cols,
        headerHeight, footerHeight
      })
    }

    const isMobileLayout = W < 768

    // Aggressive gap reduction for ultra-narrow screens and portrait mode to maximize content space
    let rowGap, colGap
    if (isPhonePortrait) {
      // Portrait mode: Use smaller gaps to maximize space for 2x3 grid
      if (isUltraNarrow) {
        rowGap = Math.max(2, Math.min(4, H * 0.004)) // Small row gaps for ultra-narrow portrait
        colGap = Math.max(1, Math.min(3, W * 0.005)) // Very small column gaps to fit content
      } else {
        rowGap = Math.max(3, Math.min(8, H * 0.006)) // Medium row gaps for normal portrait
        colGap = Math.max(2, Math.min(6, W * 0.008)) // Small column gaps for portrait
      }
    } else if (isUltraNarrow) {
      rowGap = Math.max(1, Math.min(2, W * 0.002)) // Very small gaps for ultra-narrow
      colGap = Math.max(1, Math.min(1, W * 0.001)) // Minimal column gaps
    } else if (isMobileLayout) {
      rowGap = Math.max(2, Math.min(5, W * 0.004)) // Reduced max from 6 to 5
      colGap = Math.max(2, Math.min(3, W * 0.003)) // Reduced max from 4 to 3
    } else {
      rowGap = Math.max(5, Math.min(10, W * 0.007)) // Reduced max from 12 to 10
      colGap = Math.max(3, Math.min(6, W * 0.005)) // Reduced max from 8 to 6
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
    const baseButtonHeight = (categoryGroupHeight * 0.9) / 4 // Keep original category spacing

    // Cleaner card proportions like the reference images
    let cardAspectRatio
    if (isPhonePortrait) {
      // Portrait mode: Make cards more compact vertically
      if (isUltraNarrow) {
        cardAspectRatio = 0.7 // Taller cards for ultra-narrow portrait
        buttonHeight = Math.max(25, baseButtonHeight * 0.8)
      } else {
        cardAspectRatio = 0.85 // Taller cards for normal portrait
        buttonHeight = Math.max(30, baseButtonHeight * 0.9)
      }
    } else if (isUltraNarrow) {
      cardAspectRatio = 0.85 // Slightly taller for narrow screens
      buttonHeight = Math.max(30, baseButtonHeight)
    } else if (isMobileLayout) {
      cardAspectRatio = 1.1 // Slightly rectangular (11:10 ratio)
      buttonHeight = Math.max(35, baseButtonHeight)
    } else {
      cardAspectRatio = 1.25 // More rectangular for desktop (5:4 ratio)
      buttonHeight = Math.max(35, baseButtonHeight)
    }

    // Calculate card width first, height will be set to match buttons later
    const maxCardWidth = isUltraNarrow
      ? availableCardWidth * 1.0 // Use more space on ultra-narrow
      : availableCardWidth * 0.95

    // Only calculate card width here, height will be forced to match button column
    if (cardAspectRatio >= 1.0) {
      cardWidth = Math.min(maxCardWidth, availableCardWidth * (isUltraNarrow ? 1.0 : 0.95))
    } else {
      // For taller cards, calculate width from a reasonable height estimate
      const estimatedHeight = categoryGroupHeight * 0.8
      cardWidth = estimatedHeight * cardAspectRatio
      cardWidth = Math.min(cardWidth, maxCardWidth)
    }

    // Apply minimum and maximum card width limits
    const minCardWidth = isUltraNarrow ? 80 : 60
    const maxCardWidthLimit = isUltraNarrow ? 130 : isMobileLayout ? 200 : 280 // Increased card width limits
    cardWidth = Math.max(minCardWidth, Math.min(cardWidth, maxCardWidthLimit))

    // cardHeight will be set later to match button column exactly

    buttonHeight = Math.min(buttonHeight, categoryGroupHeight * 0.3) // Allow bigger buttons

    // Calculate gaps first - make gaps smaller to give more space to buttons
    const innerColGap = Math.max(8, Math.min(30, categoryGroupWidth * 0.04))
    const innerRowGap = Math.max(2, Math.min(8, buttonHeight * 0.15)) // Much smaller gaps within category

    // Recalculate button height with smaller gaps to make buttons bigger
    const totalGapSpace = innerRowGap * 2 // Space for 2 gaps between 3 buttons
    const availableButtonSpace = categoryGroupHeight * 0.9 - totalGapSpace
    const finalButtonHeight = Math.max(buttonHeight, availableButtonSpace / 3) // Use available space for bigger buttons

    // Card dimensions are now calculated above with responsive aspect ratios

    // Consistent button scaling system - same proportions on all devices
    // Calculate button dimensions based purely on available space
    const availableButtonHeight = (categoryGroupHeight * 0.9 - (2 * baseInnerRowGap)) / 3
    const actualFinalButtonHeight = Math.max(
      25, // Single minimum height for all devices
      Math.min(availableButtonHeight, categoryGroupHeight * 0.25) // Same constraint for all
    )

    // Consistent button width calculation - same aspect ratio for all devices
    const BUTTON_ASPECT_RATIO = 2.0 // Same aspect ratio for all devices
    const calculatedButtonWidth = actualFinalButtonHeight * BUTTON_ASPECT_RATIO

    // Calculate available space for buttons
    const availableSpaceForButtons = (categoryGroupWidth - cardWidth - baseInnerColGap) * 0.45

    // Apply same size limits across all devices
    const maxButtonWidth = Math.min(
      availableSpaceForButtons, // Space-based limit
      calculatedButtonWidth * 1.2 // Allow slightly larger but keep proportional
    )
    const minButtonWidth = 45 // Same minimum for all devices

    const constrainedButtonWidth = Math.max(minButtonWidth, Math.min(calculatedButtonWidth, maxButtonWidth))

    // Calculate the actual gaps used in the layout
    const actualInnerRowGap = Math.max(2, Math.min(8, actualFinalButtonHeight * 0.15))

    // Force card height to exactly match button column height
    const finalButtonColumnHeight = (actualFinalButtonHeight * 3) + (actualInnerRowGap * 2)
    cardHeight = Math.min(finalButtonColumnHeight, categoryGroupHeight * 0.95) // Ensure it fits within available space


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
      const maxFontSizeForHeight = textSectionHeight * 0.85 // Leave some margin

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

      // Set reasonable bounds
      const maxAllowedSize = Math.min(buttonFontSize, isUltraNarrow ? 14 : isMobileLayout ? 18 : 24)
      const finalSize = Math.max(minFontSize, Math.min(maxAllowedSize, scaledFontSize))

      return finalSize * pcScaleFactor
    }

    // Header and footer scaling (apply PC scale factor)
    const headerFontSize = Math.max(12, Math.min(24, W * 0.02)) * pcScaleFactor
    const footerButtonSize = Math.max(30, Math.min(60, H * 0.08)) * pcScaleFactor

    return {
      cardWidth: cardWidth,
      cardHeight: cardHeight,
      buttonWidth: constrainedButtonWidth,
      buttonHeight: actualFinalButtonHeight,
      fontSize: fontSize * pcScaleFactor,
      buttonBorderRadius: buttonBorderRadius,
      getCardFontSize: getCardFontSize,
      headerFontSize: headerFontSize,
      footerButtonSize: footerButtonSize,
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
      availableHeight: availableHeight,
      availableWidth: availableWidth,
      pcScaleFactor: pcScaleFactor,
      actualHeaderHeight: headerHeight || 80,
      actualFooterHeight: footerHeight || 100,
      padding: 20,
      isPhonePortrait: isPhonePortrait // Keep for portrait-specific styling adjustments
    }
  }

  const styles = getResponsiveStyles()


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

  // Show skeleton game board if no game data instead of loading screen
  const showSkeleton = !gameData

  return (
    <div className="h-screen w-full bg-[#f7f2e6] flex flex-col overflow-hidden" ref={containerRef}>
      {/* Red Header Bar */}
      <div
        ref={headerRef}
        className="bg-red-600 text-white flex-shrink-0 sticky top-0 z-10 overflow-visible relative"
        style={{
          padding: `${Math.max(12, styles.headerFontSize * 0.4)}px`,
          height: `${Math.max(56, styles.headerFontSize * 3)}px`
        }}
      >
        {styles.isPhonePortrait ? (
          /* Portrait Mode: Header with team turn and hamburger menu */
          <div className="flex justify-between items-center h-full">
            <div className="flex items-center gap-2">
              <LogoDisplay />
              <div className="flex items-center gap-1">
                <span style={{ fontSize: `${styles.headerFontSize * 0.7}px` }}>دور:</span>
                <span className="font-bold" style={{ fontSize: `${styles.headerFontSize * 0.8}px` }}>
                  {gameState.currentTurn === 'team1'
                    ? gameState.team1.name
                    : gameState.currentTurn === 'team2'
                    ? gameState.team2.name
                    : 'لا يوجد'}
                </span>
              </div>
            </div>

            <div className="flex items-center flex-1 justify-center px-2">
              <h1 className="font-bold text-center" style={{
                fontSize: `${Math.max(styles.headerFontSize * 0.6, styles.headerFontSize * 0.9 - (gameState.gameName.length > 15 ? (gameState.gameName.length - 15) * 1 : 0))}px`,
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
                maxWidth: '100%'
              }}>
                {gameState.gameName}
              </h1>
            </div>

            <div className="flex items-center portrait-menu relative">
              <button
                onClick={() => setPortraitMenuOpen(!portraitMenuOpen)}
                className="bg-red-700 hover:bg-red-800 text-white p-2 rounded-lg transition-colors"
                style={{ fontSize: `${styles.headerFontSize * 0.8}px` }}
              >
                ☰
              </button>
            </div>
          </div>
        ) : (
          /* Landscape Mode: Original full header */
          <div className="flex justify-between items-center h-full">
            <div className="flex items-center gap-3">
              <LogoDisplay />
              <span className="font-bold text-white" style={{ fontSize: `${styles.headerFontSize * 0.9}px` }}>
                دور الفريق:
              </span>
              <span
                className="font-bold text-white"
                style={{ fontSize: `${styles.headerFontSize * 0.9}px` }}
              >
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
                className="bg-red-700 hover:bg-red-800 text-white px-2 py-1 rounded-lg font-bold transition-colors"
                style={{ fontSize: `${styles.headerFontSize * 1}px` }}
              >
                🔄
              </button>
            </div>

            <div className="flex items-center gap-4">
              <h1 className="font-bold text-center" style={{ fontSize: `${styles.headerFontSize * 1.2}px` }}>
                {gameState.gameName}
              </h1>
            </div>

            <div className="flex gap-3">
              <PresentationModeToggle style={{ fontSize: `${styles.headerFontSize * 0.8}px` }} />
              <button
                onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
                className="px-3 py-1 bg-red-700 hover:bg-red-800 text-white rounded-lg transition-colors"
                style={{ fontSize: `${styles.headerFontSize * 0.8}px` }}
              >
                الرجوع للوحة
              </button>
              <button
                onClick={() => navigate('/results')}
                className="px-3 py-1 bg-red-700 hover:bg-red-800 text-white rounded-lg transition-colors"
                style={{ fontSize: `${styles.headerFontSize * 0.8}px` }}
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
          padding: '20px',
          width: '100%',
          minHeight: '0'
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
                  className="relative flex items-center justify-center animate-pulse"
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
                className="relative flex items-center justify-center"
                style={{
                  width: `${styles.categoryGroupWidth}px`,
                  height: `${styles.categoryGroupHeight}px`,
                  maxHeight: `${styles.categoryGroupHeight}px`
                }}
              >
                {/* Wide Buttons spanning full width */}
                <div
                  className="absolute inset-0 flex flex-col justify-center items-center"
                  style={{
                    gap: `${styles.innerRowGap}px`,
                    zIndex: 30
                  }}
                >
                  {/* 200 Points Wide Button - Sized to match card coverage */}
                  <div
                    className="shadow-md overflow-hidden cursor-pointer"
                    style={{
                      width: `${styles.cardWidth + (styles.buttonWidth * 1.6)}px`, // Card width + space for both badges
                      height: `${styles.buttonHeight}px`,
                      borderRadius: `${styles.buttonBorderRadius}px`,
                      border: 'none'
                    }}
                  >
                    <div className="flex h-full">
                      {/* Left Badge */}
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleQuestionClick(categoryId, 200, 0);
                        }}
                        disabled={isPointValueUsed(categoryId, 200, 0)}
                        className={`flex-none px-2 font-bold transition-all duration-200 ${
                          isPointValueUsed(categoryId, 200, 0)
                            ? 'bg-gray-300 text-gray-500 cursor-not-allowed opacity-50'
                            : 'bg-red-600 text-white hover:bg-red-700'
                        }`}
                        style={{
                          width: `${styles.buttonWidth * 0.8}px`, // Fixed width for badges
                          fontSize: `${styles.fontSize * 0.8}px`,
                          position: 'relative',
                          zIndex: 120,
                          pointerEvents: 'auto'
                        }}
                      >
                        200
                      </button>
                      {/* Center Spacer for Card - matches card width exactly */}
                      <div
                        className="bg-transparent"
                        style={{ width: `${styles.cardWidth}px` }}
                      />
                      {/* Right Badge */}
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleQuestionClick(categoryId, 200, 1);
                        }}
                        disabled={isPointValueUsed(categoryId, 200, 1)}
                        className={`flex-none px-2 font-bold transition-all duration-200 ${
                          isPointValueUsed(categoryId, 200, 1)
                            ? 'bg-gray-300 text-gray-500 cursor-not-allowed opacity-50'
                            : 'bg-red-600 text-white hover:bg-red-700'
                        }`}
                        style={{
                          width: `${styles.buttonWidth * 0.8}px`, // Fixed width for badges
                          fontSize: `${styles.fontSize * 0.8}px`,
                          position: 'relative',
                          zIndex: 120,
                          pointerEvents: 'auto'
                        }}
                      >
                        200
                      </button>
                    </div>
                  </div>

                  {/* 400 Points Wide Button - Sized to match card coverage */}
                  <div
                    className="shadow-md overflow-hidden cursor-pointer"
                    style={{
                      width: `${styles.cardWidth + (styles.buttonWidth * 1.6)}px`, // Card width + space for both badges
                      height: `${styles.buttonHeight}px`,
                      borderRadius: `${styles.buttonBorderRadius}px`
                    }}
                  >
                    <div className="flex h-full">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleQuestionClick(categoryId, 400, 0);
                        }}
                        disabled={isPointValueUsed(categoryId, 400, 0)}
                        className={`flex-none px-2 font-bold transition-all duration-200 ${
                          isPointValueUsed(categoryId, 400, 0)
                            ? 'bg-gray-300 text-gray-500 cursor-not-allowed opacity-50'
                            : 'bg-red-600 text-white hover:bg-red-700'
                        }`}
                        style={{
                          width: `${styles.buttonWidth * 0.8}px`, // Fixed width for badges
                          fontSize: `${styles.fontSize * 0.8}px`,
                          position: 'relative',
                          zIndex: 120
                        }}
                      >
                        400
                      </button>
                      <div
                        className="bg-white"
                        style={{
                          width: `${styles.cardWidth}px`,
                          height: '100%',
                          border: 'none',
                          pointerEvents: 'auto'
                        }}
                      />
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleQuestionClick(categoryId, 400, 1);
                        }}
                        disabled={isPointValueUsed(categoryId, 400, 1)}
                        className={`flex-none px-2 font-bold transition-all duration-200 ${
                          isPointValueUsed(categoryId, 400, 1)
                            ? 'bg-gray-300 text-gray-500 cursor-not-allowed opacity-50'
                            : 'bg-red-600 text-white hover:bg-red-700'
                        }`}
                        style={{
                          width: `${styles.buttonWidth * 0.8}px`, // Fixed width for badges
                          fontSize: `${styles.fontSize * 0.8}px`,
                          position: 'relative',
                          zIndex: 120
                        }}
                      >
                        400
                      </button>
                    </div>
                  </div>

                  {/* 600 Points Wide Button - Sized to match card coverage */}
                  <div
                    className="shadow-md overflow-hidden cursor-pointer"
                    style={{
                      width: `${styles.cardWidth + (styles.buttonWidth * 1.6)}px`, // Card width + space for both badges
                      height: `${styles.buttonHeight}px`,
                      borderRadius: `${styles.buttonBorderRadius}px`
                    }}
                  >
                    <div className="flex h-full">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleQuestionClick(categoryId, 600, 0);
                        }}
                        disabled={isPointValueUsed(categoryId, 600, 0)}
                        className={`flex-none px-2 font-bold transition-all duration-200 ${
                          isPointValueUsed(categoryId, 600, 0)
                            ? 'bg-gray-300 text-gray-500 cursor-not-allowed opacity-50'
                            : 'bg-red-600 text-white hover:bg-red-700'
                        }`}
                        style={{
                          width: `${styles.buttonWidth * 0.8}px`, // Fixed width for badges
                          fontSize: `${styles.fontSize * 0.8}px`,
                          position: 'relative',
                          zIndex: 120
                        }}
                      >
                        600
                      </button>
                      <div
                        className="bg-white"
                        style={{
                          width: `${styles.cardWidth}px`,
                          height: '100%',
                          border: 'none',
                          pointerEvents: 'auto'
                        }}
                      />
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleQuestionClick(categoryId, 600, 1);
                        }}
                        disabled={isPointValueUsed(categoryId, 600, 1)}
                        className={`flex-none px-2 font-bold transition-all duration-200 ${
                          isPointValueUsed(categoryId, 600, 1)
                            ? 'bg-gray-300 text-gray-500 cursor-not-allowed opacity-50'
                            : 'bg-red-600 text-white hover:bg-red-700'
                        }`}
                        style={{
                          width: `${styles.buttonWidth * 0.8}px`, // Fixed width for badges
                          fontSize: `${styles.fontSize * 0.8}px`,
                          position: 'relative',
                          zIndex: 120
                        }}
                      >
                        600
                      </button>
                    </div>
                  </div>
                </div>

                {/* Category Card positioned in center, perfectly aligned with button gaps */}
                <div className="absolute inset-0 flex items-center justify-center" style={{ zIndex: 50, pointerEvents: 'none' }}>
                  <div
                    className="flex flex-col border-2 border-gray-300 shadow-lg overflow-hidden bg-white"
                    style={{
                      width: `${styles.cardWidth}px`,
                      height: `${styles.cardHeight}px`,
                      zIndex: 100,
                      backgroundColor: 'white'
                    }}
                  >
                    {/* Image section */}
                    <div
                      className="flex-1 relative bg-gradient-to-br from-gray-200 to-gray-400"
                      style={{
                        backgroundImage: category.imageUrl ? `url(${getOptimizedMediaUrl(category.imageUrl)})` : 'none',
                        backgroundSize: 'cover',
                        backgroundPosition: 'center',
                        backgroundRepeat: 'no-repeat'
                      }}
                    >
                      {/* Hidden image element to track loading of background image */}
                      {category.imageUrl && (
                        <img
                          key={`${category.imageUrl}-hidden`}
                          src={getOptimizedMediaUrl(category.imageUrl)}
                          alt=""
                          style={{
                            display: 'none',
                            position: 'absolute',
                            width: '1px',
                            height: '1px',
                            opacity: 0
                          }}
                          onLoad={() => {
                            console.log(`📸 Background image loaded via img element: ${category.imageUrl.split('/').pop()?.split('?')[0]}`)
                            // Mark image as loaded when it finishes loading
                            setLoadedImages(prev => new Set([...prev, category.imageUrl]))
                          }}
                          onError={(e) => {
                            console.warn(`❌ Background image failed to load: ${category.imageUrl.split('/').pop()?.split('?')[0]}`)
                            // Mark as loaded even on error to prevent permanent loading state
                            setLoadedImages(prev => new Set([...prev, category.imageUrl]))
                          }}
                        />
                      )}
                      {/* Loading indicator for images that haven't loaded yet */}
                      {category.imageUrl && !loadedImages.has(category.imageUrl) && (
                        <div className="absolute inset-0 flex items-center justify-center bg-gray-300 bg-opacity-75">
                          <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-red-600"></div>
                        </div>
                      )}
                      {!category.imageUrl && category.image && (
                        <div className="absolute inset-0 flex items-center justify-center"
                             style={{ fontSize: `${styles.cardWidth * 0.3}px` }}>
                          {category.image}
                        </div>
                      )}
                    </div>

                    {/* Text section inside card - single line */}
                    <div
                      className="bg-gray-300 text-gray-800 text-center font-bold flex-shrink-0 flex items-center justify-center relative"
                      style={{
                        fontSize: `${styles.getCardFontSize(category.name, styles.cardWidth, styles.cardHeight, styles.fontSize)}px`,
                        lineHeight: '1',
                        height: `${Math.max(18, Math.min(30, styles.cardHeight * 0.06)) * styles.pcScaleFactor}px`,
                        width: `${styles.cardWidth}px`,
                        margin: '0',
                        padding: `0 ${styles.isUltraNarrow ? 6 : 10}px`,
                        boxShadow: '0 2px 4px rgba(0, 0, 0, 0.1)',
                        whiteSpace: 'nowrap',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        zIndex: 25
                      }}
                    >
                      <span style={{ whiteSpace: 'nowrap' }}>
                        {category.name}
                      </span>
                    </div>
                  </div>
                </div>

              </div>
            )
          })}
        </div>
      </div>

      {/* Footer Score Controls */}
      <div ref={footerRef} className="bg-[#f7f2e6] border-t-2 border-gray-200 flex-shrink-0 sticky bottom-0 z-10" style={{
        paddingLeft: `${styles.pcScaleFactor > 1 ? 64 : styles.isPhonePortrait ? 8 : 16}px`,
        paddingRight: `${styles.pcScaleFactor > 1 ? 64 : styles.isPhonePortrait ? 8 : 16}px`,
        paddingTop: `${styles.pcScaleFactor > 1 ? 32 : styles.isPhonePortrait ? 8 : 12}px`,
        paddingBottom: `${styles.pcScaleFactor > 1 ? 32 : styles.isPhonePortrait ? 8 : 12}px`
      }}>
{styles.isPhonePortrait ? (
          /* Portrait Mode: Two-row layout */
          <div className="flex flex-col gap-2 w-full">
            {/* First Row: Team Names */}
            <div className="flex justify-between items-center w-full">
              <button
                className="bg-red-500 hover:bg-red-600 text-white rounded-full font-bold transition-colors"
                style={{
                  fontSize: `${styles.headerFontSize * 0.7}px`,
                  padding: '4px 12px'
                }}
              >
                {gameState.team1.name}
              </button>
              <button
                className="bg-red-500 hover:bg-red-600 text-white rounded-full font-bold transition-colors"
                style={{
                  fontSize: `${styles.headerFontSize * 0.7}px`,
                  padding: '4px 12px'
                }}
              >
                {gameState.team2.name}
              </button>
            </div>

            {/* Second Row: All Controls */}
            <div className="flex justify-between items-center w-full">
              {/* Team 1 Controls */}
              <div className="flex items-center" style={{ gap: '4px' }}>
                <button
                  onClick={() => setGameState(prev => ({
                    ...prev,
                    team1: { ...prev.team1, score: Math.max(0, prev.team1.score - 100) }
                  }))}
                  className="bg-red-500 hover:bg-red-600 text-white rounded-full font-bold transition-colors"
                  style={{
                    fontSize: `${styles.headerFontSize * 0.6}px`,
                    padding: '2px 6px'
                  }}
                >
                  -
                </button>
                <div
                  className="bg-white border-2 border-gray-300 rounded-full flex items-center justify-center font-bold"
                  style={{
                    fontSize: `${styles.headerFontSize * 0.7}px`,
                    color: '#B91C1C',
                    padding: '2px 6px',
                    minWidth: '40px'
                  }}
                >
                  {gameState.team1.score}
                </div>
                <button
                  onClick={() => setGameState(prev => ({
                    ...prev,
                    team1: { ...prev.team1, score: prev.team1.score + 100 }
                  }))}
                  className="bg-green-500 hover:bg-green-600 text-white rounded-full font-bold transition-colors"
                  style={{
                    fontSize: `${styles.headerFontSize * 0.6}px`,
                    padding: '2px 6px'
                  }}
                >
                  +
                </button>
                {/* Team 1 Perks */}
                <div
                  className={`border rounded-full flex items-center justify-center transition-colors ${
                    (gameState.perkUsage?.team1?.double || 0) >= 1
                      ? 'bg-gray-400 border-gray-500 text-gray-600 cursor-not-allowed opacity-50'
                      : gameState.currentTurn !== 'team1'
                      ? 'bg-gray-300 border-gray-400 text-gray-500 cursor-not-allowed opacity-30'
                      : 'bg-gray-200 border-gray-300 text-gray-500 cursor-pointer hover:bg-gray-300'
                  }`}
                  style={{ width: '18px', height: '18px', fontSize: '7px' }}
                  onClick={() => handlePerkClick('double', 'team1')}
                >
                  ×2
                </div>
                <div
                  className="bg-gray-400 border-gray-500 text-gray-600 cursor-not-allowed opacity-50 border rounded-full flex items-center justify-center transition-colors"
                  style={{ width: '18px', height: '18px', fontSize: '6px' }}
                  title="متاح فقط أثناء السؤال"
                >
                  📞
                </div>
                <div
                  className="bg-gray-400 border-gray-500 text-gray-600 cursor-not-allowed opacity-50 border rounded-full flex items-center justify-center transition-colors"
                  style={{ width: '18px', height: '18px', fontSize: '6px' }}
                  title="متاح فقط أثناء السؤال"
                >
                  🔍
                </div>
              </div>

              {/* Team 2 Controls */}
              <div className="flex items-center" style={{ gap: '4px' }}>
                <div
                  className="bg-gray-400 border-gray-500 text-gray-600 cursor-not-allowed opacity-50 border rounded-full flex items-center justify-center transition-colors"
                  style={{ width: '18px', height: '18px', fontSize: '6px' }}
                  title="متاح فقط أثناء السؤال"
                >
                  🔍
                </div>
                <div
                  className="bg-gray-400 border-gray-500 text-gray-600 cursor-not-allowed opacity-50 border rounded-full flex items-center justify-center transition-colors"
                  style={{ width: '18px', height: '18px', fontSize: '6px' }}
                  title="متاح فقط أثناء السؤال"
                >
                  📞
                </div>
                <div
                  className={`border rounded-full flex items-center justify-center transition-colors ${
                    (gameState.perkUsage?.team2?.double || 0) >= 1
                      ? 'bg-gray-400 border-gray-500 text-gray-600 cursor-not-allowed opacity-50'
                      : gameState.currentTurn !== 'team2'
                      ? 'bg-gray-300 border-gray-400 text-gray-500 cursor-not-allowed opacity-30'
                      : 'bg-gray-200 border-gray-300 text-gray-500 cursor-pointer hover:bg-gray-300'
                  }`}
                  style={{ width: '18px', height: '18px', fontSize: '7px' }}
                  onClick={() => handlePerkClick('double', 'team2')}
                >
                  ×2
                </div>
                <button
                  onClick={() => setGameState(prev => ({
                    ...prev,
                    team2: { ...prev.team2, score: Math.max(0, prev.team2.score - 100) }
                  }))}
                  className="bg-red-500 hover:bg-red-600 text-white rounded-full font-bold transition-colors"
                  style={{
                    fontSize: `${styles.headerFontSize * 0.6}px`,
                    padding: '2px 6px'
                  }}
                >
                  -
                </button>
                <div
                  className="bg-white border-2 border-gray-300 rounded-full flex items-center justify-center font-bold"
                  style={{
                    fontSize: `${styles.headerFontSize * 0.7}px`,
                    color: '#B91C1C',
                    padding: '2px 6px',
                    minWidth: '40px'
                  }}
                >
                  {gameState.team2.score}
                </div>
                <button
                  onClick={() => setGameState(prev => ({
                    ...prev,
                    team2: { ...prev.team2, score: prev.team2.score + 100 }
                  }))}
                  className="bg-green-500 hover:bg-green-600 text-white rounded-full font-bold transition-colors"
                  style={{
                    fontSize: `${styles.headerFontSize * 0.6}px`,
                    padding: '2px 6px'
                  }}
                >
                  +
                </button>
              </div>
            </div>
          </div>
        ) : (
          /* Landscape Mode: Original single-row layout */
          <div className="flex justify-between items-center w-full">
            {/* Team 1 Controls (Left) */}
            <div className="flex items-center" style={{ gap: `${styles.pcScaleFactor > 1 ? 24 : 12}px` }}>
              <button
                className="bg-red-500 hover:bg-red-600 text-white rounded-full font-bold transition-colors"
                style={{
                  fontSize: `${styles.headerFontSize * 0.9}px`,
                  padding: '8px 16px'
                }}
              >
                {gameState.team1.name}
              </button>
              <button
                onClick={() => setGameState(prev => ({
                  ...prev,
                  team1: { ...prev.team1, score: Math.max(0, prev.team1.score - 100) }
                }))}
                className="bg-red-500 hover:bg-red-600 text-white rounded-full font-bold transition-colors"
                style={{
                  fontSize: `${styles.headerFontSize * 0.9}px`,
                  padding: '8px 16px'
                }}
              >
                -
              </button>
              <div
                className="bg-white border-2 border-gray-300 rounded-full flex items-center justify-center font-bold"
                style={{
                  fontSize: `${styles.headerFontSize}px`,
                  color: '#B91C1C',
                  padding: '8px 24px',
                  minWidth: `${styles.footerButtonSize * 2}px`
                }}
              >
                {gameState.team1.score}
              </div>
              <button
                onClick={() => setGameState(prev => ({
                  ...prev,
                  team1: { ...prev.team1, score: prev.team1.score + 100 }
                }))}
                className="bg-green-500 hover:bg-green-600 text-white rounded-full font-bold transition-colors"
                style={{
                  fontSize: `${styles.headerFontSize * 0.9}px`,
                  padding: '8px 16px'
                }}
              >
                +
              </button>
              {/* Team 1 Perks */}
              <div className="flex items-center" style={{ gap: `${styles.pcScaleFactor > 1 ? 16 : 8}px` }}>
                <div
                  className={`border rounded-full flex items-center justify-center transition-colors ${
                    (gameState.perkUsage?.team1?.double || 0) >= 1
                      ? 'bg-gray-400 border-gray-500 text-gray-600 cursor-not-allowed opacity-50'
                      : gameState.currentTurn !== 'team1'
                      ? 'bg-gray-300 border-gray-400 text-gray-500 cursor-not-allowed opacity-30'
                      : 'bg-gray-200 border-gray-300 text-gray-500 cursor-pointer hover:bg-gray-300'
                  }`}
                  style={{
                    width: `${styles.footerButtonSize * 0.5}px`,
                    height: `${styles.footerButtonSize * 0.5}px`,
                    fontSize: `${styles.headerFontSize * 0.5}px`
                  }}
                  onClick={() => handlePerkClick('double', 'team1')}
                >
                  ×2
                </div>
                <div
                  className="bg-gray-400 border-gray-500 text-gray-600 cursor-not-allowed opacity-50 border rounded-full flex items-center justify-center transition-colors"
                  style={{
                    width: `${styles.footerButtonSize * 0.5}px`,
                    height: `${styles.footerButtonSize * 0.5}px`,
                    fontSize: `${styles.headerFontSize * 0.5}px`
                  }}
                  title="متاح فقط أثناء السؤال"
                >
                  📞
                </div>
                <div
                  className="bg-gray-400 border-gray-500 text-gray-600 cursor-not-allowed opacity-50 border rounded-full flex items-center justify-center transition-colors"
                  style={{
                    width: `${styles.footerButtonSize * 0.5}px`,
                    height: `${styles.footerButtonSize * 0.5}px`,
                    fontSize: `${styles.headerFontSize * 0.5}px`
                  }}
                  title="متاح فقط أثناء السؤال"
                >
                  🔍
                </div>
              </div>
            </div>

            {/* Team 2 Controls (Right Corner) */}
            <div className="flex items-center" style={{ gap: `${styles.pcScaleFactor > 1 ? 24 : 12}px` }}>
              {/* Team 2 Perks */}
              <div className="flex items-center" style={{ gap: `${styles.pcScaleFactor > 1 ? 16 : 8}px` }}>
                <div
                  className={`border rounded-full flex items-center justify-center transition-colors ${
                    (gameState.perkUsage?.team2?.double || 0) >= 1
                      ? 'bg-gray-400 border-gray-500 text-gray-600 cursor-not-allowed opacity-50'
                      : gameState.currentTurn !== 'team2'
                      ? 'bg-gray-300 border-gray-400 text-gray-500 cursor-not-allowed opacity-30'
                      : 'bg-gray-200 border-gray-300 text-gray-500 cursor-pointer hover:bg-gray-300'
                  }`}
                  style={{
                    width: `${styles.footerButtonSize * 0.5}px`,
                    height: `${styles.footerButtonSize * 0.5}px`,
                    fontSize: `${styles.headerFontSize * 0.5}px`
                  }}
                  onClick={() => handlePerkClick('double', 'team2')}
                >
                  ×2
                </div>
                <div
                  className="bg-gray-400 border-gray-500 text-gray-600 cursor-not-allowed opacity-50 border rounded-full flex items-center justify-center transition-colors"
                  style={{
                    width: `${styles.footerButtonSize * 0.5}px`,
                    height: `${styles.footerButtonSize * 0.5}px`,
                    fontSize: `${styles.headerFontSize * 0.5}px`
                  }}
                  title="متاح فقط أثناء السؤال"
                >
                  📞
                </div>
                <div
                  className="bg-gray-400 border-gray-500 text-gray-600 cursor-not-allowed opacity-50 border rounded-full flex items-center justify-center transition-colors"
                  style={{
                    width: `${styles.footerButtonSize * 0.5}px`,
                    height: `${styles.footerButtonSize * 0.5}px`,
                    fontSize: `${styles.headerFontSize * 0.5}px`
                  }}
                  title="متاح فقط أثناء السؤال"
                >
                  🔍
                </div>
              </div>
              <button
                onClick={() => setGameState(prev => ({
                  ...prev,
                  team2: { ...prev.team2, score: Math.max(0, prev.team2.score - 100) }
                }))}
                className="bg-red-500 hover:bg-red-600 text-white rounded-full font-bold transition-colors"
                style={{
                  fontSize: `${styles.headerFontSize * 0.9}px`,
                  padding: '8px 16px'
                }}
              >
                -
              </button>
              <div
                className="bg-white border-2 border-gray-300 rounded-full flex items-center justify-center font-bold"
                style={{
                  fontSize: `${styles.headerFontSize}px`,
                  color: '#B91C1C',
                  padding: '8px 24px',
                  minWidth: `${styles.footerButtonSize * 2}px`
                }}
              >
                {gameState.team2.score}
              </div>
              <button
                onClick={() => setGameState(prev => ({
                  ...prev,
                  team2: { ...prev.team2, score: prev.team2.score + 100 }
                }))}
                className="bg-green-500 hover:bg-green-600 text-white rounded-full font-bold transition-colors"
                style={{
                  fontSize: `${styles.headerFontSize * 0.9}px`,
                  padding: '8px 16px'
                }}
              >
                +
              </button>
              <button
                className="bg-red-500 hover:bg-red-600 text-white rounded-full font-bold transition-colors"
                style={{
                  fontSize: `${styles.headerFontSize * 0.9}px`,
                  padding: '8px 16px'
                }}
              >
                {gameState.team2.name}
              </button>
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
              className="px-4 py-2 text-right hover:bg-red-800 transition-colors text-sm"
            >
              تبديل الدور 🔄
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