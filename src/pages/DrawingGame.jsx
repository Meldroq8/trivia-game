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
  const [isReady, setIsReady] = useState(false)
  const [currentTool, setCurrentTool] = useState('pen')
  const [isDrawing, setIsDrawing] = useState(false)
  const [currentStroke, setCurrentStroke] = useState([])
  const [isLandscape, setIsLandscape] = useState(false)
  const strokeBufferRef = useRef([])
  const lastSyncRef = useRef(0)
  const heartbeatIntervalRef = useRef(null)

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

  // Load session data
  useEffect(() => {
    const loadSession = async () => {
      try {
        console.log('🎨 DrawingGame: Loading session:', sessionId)
        const sessionData = await DrawingService.getSession(sessionId)
        console.log('🎨 DrawingGame: Session data:', sessionData)

        if (!sessionData) {
          console.error('🎨 DrawingGame: Session not found in Firestore')
          setError('الجلسة غير موجودة - تأكد من أن السؤال معروض على الشاشة الرئيسية')
          setLoading(false)
          return
        }

        if (sessionData.status === 'finished') {
          setError('انتهت هذه الجلسة')
          setLoading(false)
          return
        }

        setSession(sessionData)
        setLoading(false)

        // Mark drawer as connected
        await DrawingService.connectDrawer(sessionId)
      } catch (err) {
        prodError('Error loading drawing session:', err)
        setError('حدث خطأ في تحميل الجلسة')
        setLoading(false)
      }
    }

    loadSession()
  }, [sessionId])

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

  // Sync strokes to Firestore (batched for performance)
  const syncStrokes = async () => {
    if (strokeBufferRef.current.length === 0) return

    try {
      await DrawingService.addStrokes(sessionId, strokeBufferRef.current)
      strokeBufferRef.current = []
    } catch (err) {
      prodError('Error syncing strokes:', err)
    }
  }

  // Drawing handlers
  const startDrawing = (e) => {
    if (!isReady || !isLandscape) return

    setIsDrawing(true)
    const point = getCanvasPoint(e)
    setCurrentStroke([point])
  }

  const draw = (e) => {
    if (!isDrawing || !isReady) return

    const point = getCanvasPoint(e)
    setCurrentStroke(prev => [...prev, point])

    // Draw on local canvas immediately (no lag)
    const canvas = canvasRef.current
    const ctx = canvas.getContext('2d')

    if (currentTool === 'eraser') {
      ctx.globalCompositeOperation = 'destination-out'
      ctx.lineWidth = 20
    } else {
      ctx.globalCompositeOperation = 'source-over'
      ctx.strokeStyle = '#000000'
      ctx.lineWidth = 3
    }

    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'

    if (currentStroke.length > 0) {
      const lastPoint = currentStroke[currentStroke.length - 1]
      ctx.beginPath()
      ctx.moveTo(lastPoint.x * canvas.width, lastPoint.y * canvas.height)
      ctx.lineTo(point.x * canvas.width, point.y * canvas.height)
      ctx.stroke()
    }

    // Batch sync (every 50ms or every 5 points)
    const now = Date.now()
    if (now - lastSyncRef.current > 50 || currentStroke.length >= 5) {
      strokeBufferRef.current.push({
        points: [...currentStroke, point],
        tool: currentTool,
        timestamp: now
      })
      syncStrokes()
      setCurrentStroke([])
      lastSyncRef.current = now
    }
  }

  const stopDrawing = () => {
    if (!isDrawing) return

    setIsDrawing(false)

    // Sync remaining stroke
    if (currentStroke.length > 0) {
      strokeBufferRef.current.push({
        points: currentStroke,
        tool: currentTool,
        timestamp: Date.now()
      })
      syncStrokes()
      setCurrentStroke([])
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
      <div className="min-h-screen bg-[#f7f2e6] dark:bg-slate-900 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-4 border-red-600 mx-auto mb-4"></div>
          <p className="text-gray-800 dark:text-gray-100 font-bold">جاري التحميل...</p>
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

  // Drawing interface (landscape)
  return (
    <div className="fixed inset-0 bg-[#f7f2e6] dark:bg-slate-900 flex flex-col overflow-hidden">
      {/* Header */}
      <div className="bg-gradient-to-r from-red-600 to-red-700 text-white py-2 px-4 flex items-center justify-between flex-shrink-0">
        <LogoDisplay />
        <div className="text-center flex-1">
          <p className="text-sm font-bold">{session?.answer || session?.word}</p>
        </div>
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

      {/* Canvas Area */}
      <div className="flex-1 bg-white dark:bg-slate-700 p-2 overflow-hidden">
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
          className="w-full h-full touch-none"
          style={{
            backgroundColor: '#FFFFFF',
            cursor: currentTool === 'eraser' ? 'crosshair' : 'crosshair',
            borderRadius: '8px'
          }}
        />
      </div>

      {/* Drawing Tools */}
      <div className="bg-gray-100 dark:bg-slate-800 py-3 px-4 flex gap-3 justify-center items-center flex-shrink-0">
        <button
          onClick={() => setCurrentTool('pen')}
          className={`flex-1 max-w-[150px] py-3 px-4 rounded-lg font-bold transition-all ${
            currentTool === 'pen'
              ? 'bg-blue-600 text-white shadow-lg scale-105'
              : 'bg-white dark:bg-slate-700 text-gray-800 dark:text-gray-100 hover:bg-blue-50 dark:hover:bg-slate-600'
          }`}
        >
          ✏️ قلم
        </button>

        <button
          onClick={() => setCurrentTool('eraser')}
          className={`flex-1 max-w-[150px] py-3 px-4 rounded-lg font-bold transition-all ${
            currentTool === 'eraser'
              ? 'bg-orange-600 text-white shadow-lg scale-105'
              : 'bg-white dark:bg-slate-700 text-gray-800 dark:text-gray-100 hover:bg-orange-50 dark:hover:bg-slate-600'
          }`}
        >
          🧹 ممحاة
        </button>

        <button
          onClick={handleClearCanvas}
          className="flex-1 max-w-[150px] bg-red-600 hover:bg-red-700 text-white font-bold py-3 px-4 rounded-lg transition-colors"
        >
          🗑️ مسح الكل
        </button>
      </div>
    </div>
  )
}

export default DrawingGame
