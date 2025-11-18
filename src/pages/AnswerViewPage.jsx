import { useState, useEffect } from 'react'
import { useParams } from 'react-router-dom'
import { FirebaseQuestionsService } from '../utils/firebaseQuestions'
import LogoDisplay from '../components/LogoDisplay'
import SmartImage from '../components/SmartImage'
import AudioPlayer from '../components/AudioPlayer'
import { prodError } from '../utils/devLog'

function AnswerViewPage() {
  const { questionId } = useParams()
  const [answer, setAnswer] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    const loadAnswer = async () => {
      try {
        setLoading(true)
        setError(null)

        // Load question to get answer data
        const questions = await FirebaseQuestionsService.getAllQuestions()
        const question = questions.find(q => q.id === questionId)

        if (!question) {
          setError('السؤال غير موجود')
          return
        }

        setAnswer({
          text: question.answer,
          imageUrl: question.answerImageUrl,
          audioUrl: question.answerAudioUrl,
          videoUrl: question.answerVideoUrl
        })
      } catch (err) {
        prodError('Error loading answer:', err)
        setError('حدث خطأ أثناء تحميل الإجابة')
      } finally {
        setLoading(false)
      }
    }

    if (questionId) {
      loadAnswer()
    }
  }, [questionId])

  if (loading) {
    return (
      <div className="min-h-screen bg-[#f7f2e6] flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-16 w-16 border-b-4 border-red-600 mx-auto mb-4"></div>
          <p className="text-gray-600 text-xl">جاري تحميل الإجابة...</p>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="min-h-screen bg-[#f7f2e6] flex items-center justify-center">
        <div className="text-center">
          <div className="text-6xl mb-4">❌</div>
          <p className="text-red-600 text-xl font-bold">{error}</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-[#f7f2e6] flex flex-col">
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
                  fetchPriority="high"
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
          </div>
        </div>
      </main>
    </div>
  )
}

export default AnswerViewPage
