import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import CharadeService from '../services/charadeService'
import LogoDisplay from '../components/LogoDisplay'
import SmartImage from '../components/SmartImage'
import AudioPlayer from '../components/AudioPlayer'
import { prodError, devLog } from '../utils/devLog'

function AnswerViewPage() {
  const { sessionId } = useParams()
  const navigate = useNavigate()
  const [answer, setAnswer] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [sessionEnded, setSessionEnded] = useState(false)
  const [isReady, setIsReady] = useState(false)
  const [markingReady, setMarkingReady] = useState(false)

  useEffect(() => {
    if (!sessionId) {
      setError('رابط غير صالح')
      setLoading(false)
      return
    }

    devLog('🎭 AnswerViewPage: Subscribing to session:', sessionId)

    // Subscribe to real-time session updates
    const unsubscribe = CharadeService.subscribeToSession(sessionId, (sessionData) => {
      if (!sessionData) {
        setSessionEnded(true)
        setLoading(false)
        return
      }

      if (sessionData.status === 'finished') {
        setSessionEnded(true)
        setLoading(false)
        return
      }

      setAnswer({
        text: sessionData.answer,
        imageUrl: sessionData.answerImageUrl,
        audioUrl: sessionData.answerAudioUrl,
        videoUrl: sessionData.answerVideoUrl
      })
      setIsReady(sessionData.playerReady || false)
      setLoading(false)
    })

    return () => {
      if (unsubscribe) {
        unsubscribe()
      }
    }
  }, [sessionId])

  const handleReady = async () => {
    if (markingReady || isReady) return

    setMarkingReady(true)
    try {
      await CharadeService.markPlayerReady(sessionId)
      setIsReady(true)
      devLog('🎭 Player marked as ready')
    } catch (error) {
      prodError('Error marking ready:', error)
    } finally {
      setMarkingReady(false)
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen w-full flex items-center justify-center bg-[#f7f2e6] dark:bg-slate-900">
        <div className="bg-white/95 dark:bg-slate-800/95 backdrop-blur-sm rounded-3xl shadow-2xl p-6 text-center">
          <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-red-600 mx-auto mb-3"></div>
          <h1 className="text-lg font-bold text-red-800 dark:text-red-400">جاري تحميل الإجابة...</h1>
        </div>
      </div>
    )
  }

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

  if (error) {
    return (
      <div className="min-h-screen w-full flex items-center justify-center bg-[#f7f2e6] dark:bg-slate-900">
        <div className="bg-white/95 dark:bg-slate-800/95 backdrop-blur-sm rounded-3xl shadow-2xl p-6 text-center">
          <div className="text-5xl mb-3">❌</div>
          <h1 className="text-lg font-bold text-red-800 dark:text-red-400">{error}</h1>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-[#f7f2e6] dark:bg-slate-900 flex flex-col">
      {/* Minimal header - logo only */}
      <header className="bg-red-600 py-2 flex-shrink-0">
        <div className="flex justify-center">
          <LogoDisplay />
        </div>
      </header>

      {/* Answer display - centered, clean */}
      <main className="flex-1 flex flex-col items-center justify-center p-6 md:p-8">
        {/* Answer container with border similar to question area */}
        <div className="max-w-2xl w-full border-[5px] border-[#E34B4B] rounded-3xl md:rounded-[54px] p-8 md:p-12"
             style={{ backgroundColor: '#f7f2e6' }}>
          <div className="space-y-6">
            {/* Answer text */}
            <div className="text-4xl md:text-5xl font-bold text-gray-900 text-center leading-relaxed">
              {answer?.text}
            </div>

            {/* Answer image */}
            {answer?.imageUrl && (
              <div className="flex justify-center mt-8">
                <SmartImage
                  src={answer.imageUrl}
                  alt="Answer"
                  size="large"
                  context="answer"
                  className="max-w-full rounded-xl shadow-2xl"
                />
              </div>
            )}

            {/* Answer audio */}
            {answer?.audioUrl && (
              <div className="mt-8">
                <AudioPlayer src={answer.audioUrl} />
              </div>
            )}

            {/* Answer video */}
            {answer?.videoUrl && (
              <div className="mt-8">
                <video
                  src={answer.videoUrl}
                  controls
                  className="w-full rounded-xl shadow-2xl"
                />
              </div>
            )}

            {/* Ready button */}
            <div className="mt-8 flex justify-center">
              {isReady ? (
                <div className="bg-green-500 text-white px-8 py-4 rounded-full text-2xl font-bold flex items-center gap-3 shadow-lg">
                  <span>جاهز</span>
                  <span className="text-3xl">✓</span>
                </div>
              ) : (
                <button
                  onClick={handleReady}
                  disabled={markingReady}
                  className="bg-red-600 hover:bg-red-700 active:bg-red-800 text-white px-10 py-5 rounded-full text-2xl font-bold shadow-xl transform transition-all hover:scale-105 active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {markingReady ? (
                    <div className="flex items-center gap-3">
                      <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-white"></div>
                      <span>جاري...</span>
                    </div>
                  ) : (
                    <span>جاهز</span>
                  )}
                </button>
              )}
            </div>
          </div>
        </div>
      </main>
    </div>
  )
}

export default AnswerViewPage
