import { useState, useEffect, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import DrawingService from '../services/drawingService'
import LogoDisplay from '../components/LogoDisplay'
import { devLog, prodError } from '../utils/devLog'

function DrawingGame() {
  const { sessionId } = useParams()
  const navigate = useNavigate()
  const canvasRef = useRef(null)
  const [session, setSession] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [sessionEnded, setSessionEnded] = useState(false)
  const [isReady, setIsReady] = useState(false)
  const [currentTool, setCurrentTool] = useState('pen')
  const [currentColor, setCurrentColor] = useState('#000000')
  const [brushSize, setBrushSize] = useState(12) // Default medium thickness
  const isDrawingRef = useRef(false) // Use ref to avoid state updates during drawing
  const currentStrokeRef = useRef([]) // Use ref for stroke points to avoid iOS lag

  // Available brush sizes
  const brushSizes = [
    { size: 5, label: 'S', icon: '•' },
    { size: 12, label: 'M', icon: '●' },
    { size: 25, label: 'L', icon: '⬤' },
  ]

  // Available colors for drawing
  const colors = [
    '#000000', // Black
    '#EF4444', // Red
    '#F97316', // Orange
    '#EAB308', // Yellow
    '#22C55E', // Green
    '#3B82F6', // Blue
    '#8B5CF6', // Purple
    '#EC4899', // Pink
  ]
  const [isLandscape, setIsLandscape] = useState(false)
  const [timeRemaining, setTimeRemaining] = useState(0)
  const [isMaximized, setIsMaximized] = useState(false) // For iOS pseudo-fullscreen
  const heartbeatIntervalRef = useRef(null)

  // Check if iOS device
  const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream

  // Check orientation
  useEffect(() => {
    const checkOrientation = () => {
      setIsLandscape(window.innerWidth > window.innerHeight)
    }

    checkOrientation()
    window.addEventListener('resize', checkOrientation)
    window.addEventListener('orientationchange', checkOrientation)

    return () => {
      window.removeEventListener('resize', checkOrientation)
      window.removeEventListener('orientationchange', checkOrientation)
    }
  }, [])

  // Track if drawer already connected to prevent infinite loop
  const drawerConnectedRef = useRef(false)

  // Subscribe to session data for real-time updates
  useEffect(() => {
    devLog('🎨 DrawingGame: Subscribing to session:', sessionId)

    // Timeout: if subscription doesn't respond within 10s, show error
    const timeoutId = setTimeout(() => {
      if (loading) {
        setError('تعذر الاتصال بالجلسة. تحقق من اتصالك بالإنترنت وحاول مرة أخرى.')
        setLoading(false)
      }
    }, 10000)

    // Subscribe to real-time session updates
    const unsubscribe = DrawingService.subscribeToSession(sessionId, async (sessionData) => {
      clearTimeout(timeoutId)

      if (!sessionData) {
        devLog('🎨 DrawingGame: Session not found in Firestore')
        setSessionEnded(true)
        setLoading(false)
        return
      }

      if (sessionData.status === 'finished') {
        setSessionEnded(true)
        setLoading(false)
        return
      }

      // Valid active session - reset sessionEnded in case it was set by a race condition
      setSessionEnded(false)
      setSession(sessionData)
      setLoading(false)

      // Mark drawer as connected ONLY ONCE using ref
      if (!drawerConnectedRef.current) {
        drawerConnectedRef.current = true
        await DrawingService.connectDrawer(sessionId)
      }
    })

    return () => {
      clearTimeout(timeoutId)
      if (unsubscribe) {
        unsubscribe()
      }
      drawerConnectedRef.current = false
    }
  }, [sessionId])

  // Start timer when ready (independent countdown - stays in sync naturally)
  const timerStartedRef = useRef(false)

  useEffect(() => {
    if (!isReady || timerStartedRef.current) return

    // Get initial time from session or use default
    const difficulty = session?.difficulty || 'medium'
    const initialTime = difficulty === 'easy' ? 90 : difficulty === 'hard' ? 45 : 60

    // Start timer ONCE when ready
    timerStartedRef.current = true
    setTimeRemaining(initialTime)

    devLog('⏱️ Starting phone timer at:', initialTime, 'difficulty:', difficulty)

    // Countdown locally (main screen does same, stays in sync naturally)
    const timer = setInterval(() => {
      setTimeRemaining(prev => {
        const newTime = Math.max(0, prev - 1)
        if (newTime % 10 === 0 || newTime <= 5) { // Log every 10 seconds + last 5 seconds
          devLog('⏱️ Phone timer:', newTime)
        }
        return newTime
      })
    }, 1000)

    // Cleanup function
    return () => {
      devLog('⏱️ Cleaning up phone timer')
      clearInterval(timer)
      timerStartedRef.current = false // Reset ref so it can restart if needed
    }
  }, [isReady]) // Only isReady dependency

  // Listen for reset button press from main screen
  const lastResetRef = useRef(null)
  useEffect(() => {
    if (!session) return

    // Only check if timerResetAt exists (now it's a number timestamp)
    if (session.timerResetAt && session.timerResetAt !== 0) {
      const resetTime = session.timerResetAt

      // Detect new reset (timestamp value changed)
      if (lastResetRef.current !== null && resetTime !== lastResetRef.current) {
        devLog('🔄 Timer reset detected from main screen', resetTime, 'vs', lastResetRef.current)

        // Reset timer
        const difficulty = session.difficulty || 'medium'
        const initialTime = difficulty === 'easy' ? 90 : difficulty === 'hard' ? 45 : 60
        setTimeRemaining(initialTime)

        // Update last reset time
        lastResetRef.current = resetTime
      } else if (lastResetRef.current === null && resetTime !== 0) {
        // First actual reset (not the initial 0 value)
        // This IS a reset, so apply it
        devLog('🔄 First timer reset detected:', resetTime)

        const difficulty = session.difficulty || 'medium'
        const initialTime = difficulty === 'easy' ? 90 : difficulty === 'hard' ? 45 : 60
        setTimeRemaining(initialTime)

        lastResetRef.current = resetTime
      }
    }
  }, [session]) // Depend on full session object, do comparison inside

  // Heartbeat system
  useEffect(() => {
    if (!isReady || !sessionId) return

    // Send heartbeat every 2 seconds
    heartbeatIntervalRef.current = setInterval(() => {
      DrawingService.sendHeartbeat(sessionId)
    }, 2000)

    return () => {
      if (heartbeatIntervalRef.current) {
        clearInterval(heartbeatIntervalRef.current)
      }
    }
  }, [isReady, sessionId])

  // Handle ready button
  const handleReady = async () => {
    try {
      await DrawingService.markDrawerReady(sessionId)
      setIsReady(true)

      // Initialize canvas
      const canvas = canvasRef.current
      if (canvas) {
        const ctx = canvas.getContext('2d')
        ctx.fillStyle = '#FFFFFF'
        ctx.fillRect(0, 0, canvas.width, canvas.height)
      }
    } catch (err) {
      prodError('Error marking ready:', err)
      setError('حدث خطأ. يرجى المحاولة مرة أخرى')
    }
  }

  // Removed syncStrokes - now using direct sync on pen lift only

  // Drawing handlers - using refs to avoid React state updates during drawing (fixes iOS lag)
  const startDrawing = (e) => {
    if (!isReady || !isLandscape || timeRemaining <= 0) return // Stop if time is up

    isDrawingRef.current = true
    const point = getCanvasPoint(e)
    currentStrokeRef.current = [point]

    // Draw initial dot immediately (for taps/short strokes)
    const canvas = canvasRef.current
    const ctx = canvas.getContext('2d')

    if (currentTool === 'eraser') {
      ctx.globalCompositeOperation = 'destination-out'
      ctx.fillStyle = 'rgba(0,0,0,1)'
      const dotSize = brushSize * 4 // Eraser is bigger
      ctx.beginPath()
      ctx.arc(point.x * canvas.width, point.y * canvas.height, dotSize / 2, 0, Math.PI * 2)
      ctx.fill()
    } else {
      ctx.globalCompositeOperation = 'source-over'
      ctx.fillStyle = currentColor
      ctx.beginPath()
      ctx.arc(point.x * canvas.width, point.y * canvas.height, brushSize / 2, 0, Math.PI * 2)
      ctx.fill()
    }
  }

  const draw = (e) => {
    if (!isDrawingRef.current || !isReady || timeRemaining <= 0) return // Stop if time is up

    const point = getCanvasPoint(e)

    // Add point to current stroke (using ref - no React re-render)
    currentStrokeRef.current.push(point)

    // Draw on local canvas immediately (instant feedback, no lag)
    const canvas = canvasRef.current
    const ctx = canvas.getContext('2d')

    if (currentTool === 'eraser') {
      ctx.globalCompositeOperation = 'destination-out'
      ctx.strokeStyle = 'rgba(0,0,0,1)' // Need full alpha for eraser to work
      ctx.lineWidth = brushSize * 4 // Eraser is bigger
    } else {
      ctx.globalCompositeOperation = 'source-over'
      ctx.strokeStyle = currentColor
      ctx.lineWidth = brushSize
    }

    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'

    const strokePoints = currentStrokeRef.current
    if (strokePoints.length > 1) {
      const lastPoint = strokePoints[strokePoints.length - 2]
      ctx.beginPath()
      ctx.moveTo(lastPoint.x * canvas.width, lastPoint.y * canvas.height)
      ctx.lineTo(point.x * canvas.width, point.y * canvas.height)
      ctx.stroke()
    }

    // NO mid-stroke syncing - wait for pen lift for complete accuracy
  }

  const stopDrawing = async () => {
    if (!isDrawingRef.current) return

    isDrawingRef.current = false

    // Sync COMPLETE stroke when pen lifts (perfect accuracy)
    const strokePoints = currentStrokeRef.current
    if (strokePoints.length > 0) {
      const completeStroke = {
        points: [...strokePoints], // Copy the points array
        tool: currentTool,
        color: currentTool === 'pen' ? currentColor : null, // Only save color for pen strokes
        lineWidth: currentTool === 'pen' ? brushSize : brushSize * 4, // Include brush thickness
        timestamp: Date.now()
      }

      // Clear the ref immediately
      currentStrokeRef.current = []

      // Sync immediately - single atomic write per stroke
      try {
        await DrawingService.addStrokes(sessionId, [completeStroke])
        devLog('🎨 Complete stroke synced:', completeStroke.points.length, 'points')
      } catch (err) {
        prodError('Error syncing stroke:', err)
      }
    }
  }

  const getCanvasPoint = (e) => {
    const canvas = canvasRef.current
    const rect = canvas.getBoundingClientRect()

    let clientX, clientY

    if (e.touches) {
      clientX = e.touches[0].clientX
      clientY = e.touches[0].clientY
    } else {
      clientX = e.clientX
      clientY = e.clientY
    }

    // Normalize to 0-1 range (percentage of canvas)
    const x = (clientX - rect.left) / rect.width
    const y = (clientY - rect.top) / rect.height

    return { x: Math.max(0, Math.min(1, x)), y: Math.max(0, Math.min(1, y)) }
  }

  const handleClearCanvas = async () => {
    if (!window.confirm('هل تريد مسح الرسم بالكامل؟')) return

    try {
      await DrawingService.clearStrokes(sessionId)

      // Clear local canvas
      const canvas = canvasRef.current
      if (canvas) {
        const ctx = canvas.getContext('2d')
        ctx.fillStyle = '#FFFFFF'
        ctx.fillRect(0, 0, canvas.width, canvas.height)
      }
    } catch (err) {
      prodError('Error clearing canvas:', err)
    }
  }

  // Loading state
  if (loading) {
    return (
      <div className="min-h-screen w-full flex items-center justify-center bg-[#f7f2e6] dark:bg-slate-900">
        <div className="bg-white/95 dark:bg-slate-800/95 backdrop-blur-sm rounded-3xl shadow-2xl p-6 text-center">
          <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-red-600 mx-auto mb-3"></div>
          <h1 className="text-lg font-bold text-red-800 dark:text-red-400">جاري التحميل...</h1>
        </div>
      </div>
    )
  }

  // Session ended state
  if (sessionEnded) {
    return (
      <div className="min-h-screen bg-[#f7f2e6] dark:bg-slate-900 flex items-center justify-center p-4">
        <div className="bg-white dark:bg-slate-800 rounded-xl shadow-lg p-8 text-center max-w-md">
          <div className="text-5xl mb-4">👋</div>
          <h2 className="text-xl font-bold text-gray-800 dark:text-gray-100 mb-2">انتهت الجلسة</h2>
          <p className="text-gray-600 dark:text-gray-400 mb-4">تم إنهاء هذه الجلسة من الشاشة الرئيسية</p>
          <button
            onClick={() => navigate('/')}
            className="bg-red-600 hover:bg-red-700 text-white font-bold py-2 px-6 rounded-lg"
          >
            العودة للصفحة الرئيسية
          </button>
        </div>
      </div>
    )
  }

  // Error state
  if (error) {
    return (
      <div className="min-h-screen bg-[#f7f2e6] dark:bg-slate-900 flex items-center justify-center p-4">
        <div className="bg-white dark:bg-slate-800 rounded-xl shadow-lg p-8 text-center max-w-md">
          <div className="text-5xl mb-4">⚠️</div>
          <h2 className="text-xl font-bold text-gray-800 dark:text-gray-100 mb-2">خطأ</h2>
          <p className="text-gray-600 dark:text-gray-400 mb-4">{error}</p>
          <button
            onClick={() => navigate('/')}
            className="bg-red-600 hover:bg-red-700 text-white font-bold py-2 px-6 rounded-lg"
          >
            العودة للصفحة الرئيسية
          </button>
        </div>
      </div>
    )
  }

  // Not ready yet - show word and ready button
  if (!isReady) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-red-600 to-red-700 flex flex-col items-center justify-center p-4">
        <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-2xl p-8 max-w-md w-full text-center">
          <div className="mb-6">
            <LogoDisplay />
          </div>

          <div className="mb-8">
            <h2 className="text-2xl font-bold text-gray-800 dark:text-gray-100 mb-4">
              ارسم هذا:
            </h2>
            <div className="bg-yellow-100 dark:bg-yellow-900/30 border-2 border-yellow-500 rounded-lg p-6">
              <p className="text-3xl font-bold text-gray-900 dark:text-gray-100">
                {session?.answer || session?.word || 'جاري التحميل...'}
              </p>
            </div>

            {/* Show prompt image if available */}
            {session?.promptImageUrl && (
              <div className="mt-4">
                <img
                  src={session.promptImageUrl}
                  alt="صورة المرجع"
                  className="max-w-full h-auto rounded-lg border-2 border-gray-300"
                  style={{ maxHeight: '200px', margin: '0 auto' }}
                />
              </div>
            )}
          </div>

          <button
            onClick={handleReady}
            className="w-full bg-green-600 hover:bg-green-700 text-white font-bold py-4 px-6 rounded-xl text-xl shadow-lg transition-transform hover:scale-105"
          >
            ✅ جاهز - ابدأ الرسم
          </button>

          <p className="text-sm text-gray-600 dark:text-gray-400 mt-4">
            عند الضغط على "جاهز"، سيبدأ المؤقت على الشاشة الرئيسية
          </p>
        </div>
      </div>
    )
  }

  // Force landscape message
  if (!isLandscape) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-red-600 to-red-700 flex items-center justify-center p-4">
        <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-2xl p-8 max-w-sm w-full text-center">
          <div className="text-6xl mb-4 animate-pulse">📱</div>
          <div className="text-4xl mb-4">↻</div>
          <h2 className="text-2xl font-bold text-gray-800 dark:text-gray-100 mb-2">
            يرجى قلب الهاتف
          </h2>
          <p className="text-gray-600 dark:text-gray-400">
            استخدم الوضع الأفقي للرسم
          </p>
        </div>
      </div>
    )
  }

  // Fullscreen toggle handler
  const toggleFullscreen = async () => {
    // For iOS, use pseudo-fullscreen (hide header to maximize space)
    if (isIOS) {
      setIsMaximized(prev => !prev)
      return
    }

    // For other devices, use native fullscreen API
    try {
      if (!document.fullscreenElement) {
        await document.documentElement.requestFullscreen()
      } else {
        await document.exitFullscreen()
      }
    } catch (err) {
      // Fallback to pseudo-fullscreen if native fails
      prodError('Fullscreen error, using fallback:', err)
      setIsMaximized(prev => !prev)
    }
  }

  // Drawing interface (landscape)
  return (
    <div className="fixed inset-0 bg-[#f7f2e6] dark:bg-slate-900 flex flex-col overflow-hidden">
      {/* Header - hidden when maximized */}
      {!isMaximized && (
        <div className="bg-gradient-to-r from-red-600 to-red-700 text-white py-1 px-2 flex items-center justify-between flex-shrink-0">
          <LogoDisplay />
          <div className="text-center flex-1 flex items-center justify-center gap-2">
            <p className="text-sm font-bold truncate max-w-[120px]">{session?.answer || session?.word}</p>
            {/* Timer Display */}
            <div className="flex items-center gap-1 bg-white/20 rounded-full px-2 py-0.5">
              <span className="text-lg">⏱️</span>
              <span className="text-lg font-bold">{timeRemaining}</span>
              <span className="text-xs">ث</span>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {/* Fullscreen Toggle */}
            <button
              onClick={toggleFullscreen}
              className="text-white hover:text-red-200 text-xl p-1"
              title="ملء الشاشة"
            >
              ⛶
            </button>
            {/* Exit Button */}
            <button
              onClick={() => {
                if (window.confirm('هل تريد الخروج من الرسم؟')) {
                  navigate('/')
                }
              }}
              className="text-white hover:text-red-200 text-2xl"
            >
              ×
            </button>
          </div>
        </div>
      )}

      {/* Floating controls when maximized */}
      {isMaximized && (
        <div className="absolute top-2 right-2 z-50 flex gap-2">
          {/* Timer - floating */}
          <div className="flex items-center gap-1 bg-red-600/90 text-white rounded-full px-2 py-1 shadow-lg">
            <span className="text-sm">⏱️</span>
            <span className="text-sm font-bold">{timeRemaining}</span>
          </div>
          {/* Restore button */}
          <button
            onClick={toggleFullscreen}
            className="bg-red-600/90 hover:bg-red-700 text-white rounded-full w-8 h-8 flex items-center justify-center shadow-lg text-sm"
            title="تصغير"
          >
            ⛶
          </button>
        </div>
      )}

      {/* Main Content - Side toolbars with canvas in center */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left Sidebar - Colors */}
        <div className="bg-gray-100 dark:bg-slate-800 p-1 flex flex-col gap-1 justify-center items-center flex-shrink-0">
          {colors.map((color) => (
            <button
              key={color}
              onClick={() => {
                setCurrentColor(color)
                setCurrentTool('pen')
              }}
              className={`w-7 h-7 rounded-full transition-all border-2 ${
                currentColor === color && currentTool === 'pen'
                  ? 'scale-110 border-white shadow-lg ring-2 ring-offset-1 ring-blue-500'
                  : 'border-gray-300 dark:border-slate-600'
              }`}
              style={{ backgroundColor: color }}
            />
          ))}
        </div>

        {/* Canvas Area */}
        <div className="flex-1 bg-white dark:bg-slate-700 p-1 overflow-hidden">
          <canvas
            ref={canvasRef}
            width={1920}
            height={1080}
            onMouseDown={startDrawing}
            onMouseMove={draw}
            onMouseUp={stopDrawing}
            onMouseLeave={stopDrawing}
            onTouchStart={startDrawing}
            onTouchMove={draw}
            onTouchEnd={stopDrawing}
            className="w-full h-full"
            style={{
              backgroundColor: '#FFFFFF',
              cursor: 'crosshair',
              borderRadius: '8px',
              touchAction: 'none'
            }}
          />
        </div>

        {/* Right Sidebar - Tools */}
        <div className="bg-gray-100 dark:bg-slate-800 p-1 flex flex-col gap-1.5 justify-center items-center flex-shrink-0">
          {/* Pen Tool */}
          <button
            onClick={() => setCurrentTool('pen')}
            className={`w-10 h-10 rounded-lg font-bold transition-all flex items-center justify-center text-lg ${
              currentTool === 'pen'
                ? 'text-white shadow-lg scale-105'
                : 'bg-white dark:bg-slate-700 text-gray-800 dark:text-gray-100'
            }`}
            style={currentTool === 'pen' ? { backgroundColor: currentColor } : {}}
            title="قلم"
          >
            ✏️
          </button>

          {/* Eraser Tool */}
          <button
            onClick={() => setCurrentTool('eraser')}
            className={`w-10 h-10 rounded-lg font-bold transition-all flex items-center justify-center text-lg ${
              currentTool === 'eraser'
                ? 'bg-orange-600 text-white shadow-lg scale-105'
                : 'bg-white dark:bg-slate-700 text-gray-800 dark:text-gray-100'
            }`}
            title="ممحاة"
          >
            🧹
          </button>

          {/* Divider */}
          <div className="w-8 h-px bg-gray-300 dark:bg-slate-600 my-1"></div>

          {/* Brush Size Selector */}
          {brushSizes.map((brush) => (
            <button
              key={brush.size}
              onClick={() => setBrushSize(brush.size)}
              className={`w-10 h-10 rounded-lg font-bold transition-all flex items-center justify-center ${
                brushSize === brush.size
                  ? 'bg-blue-600 text-white shadow-lg scale-105'
                  : 'bg-white dark:bg-slate-700 text-gray-800 dark:text-gray-100'
              }`}
              title={`سمك ${brush.label}`}
            >
              <span style={{ fontSize: brush.size === 5 ? '12px' : brush.size === 12 ? '18px' : '26px' }}>
                {brush.icon}
              </span>
            </button>
          ))}

          {/* Divider */}
          <div className="w-8 h-px bg-gray-300 dark:bg-slate-600 my-1"></div>

          {/* Clear Canvas */}
          <button
            onClick={handleClearCanvas}
            className="w-10 h-10 bg-red-600 hover:bg-red-700 text-white font-bold rounded-lg transition-colors flex items-center justify-center text-lg"
            title="مسح الكل"
          >
            🗑️
          </button>
        </div>
      </div>
    </div>
  )
}

export default DrawingGame
