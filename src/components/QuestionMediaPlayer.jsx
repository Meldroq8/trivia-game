import { devLog, devWarn, prodError } from "../utils/devLog"
import { useMemo, useState } from 'react'
import MediaPlayer from './MediaPlayer'
import { getOptimizedMediaUrl } from '../utils/mediaUrlConverter'

function QuestionMediaPlayer({ currentQuestion, showAnswer, isQuestionMedia, styles }) {
  const [isCssFullscreen, setIsCssFullscreen] = useState(false)
  // Determine the media source based on mode and availability
  const { src, type } = useMemo(() => {
    if (!currentQuestion) {
      return { src: null, type: 'audio' }
    }

    let mediaUrl = null
    let mediaType = 'audio'

    if (isQuestionMedia) {
      // Question media - prioritize video, then audio
      mediaUrl = currentQuestion?.question?.videoUrl ||
                 currentQuestion?.videoUrl ||
                 currentQuestion?.question?.audioUrl ||
                 currentQuestion?.audioUrl

      // Determine type based on URL
      if (mediaUrl) {
        if (mediaUrl.includes('.mp4') || mediaUrl.includes('.mov') || mediaUrl.includes('.webm') || currentQuestion?.question?.videoUrl || currentQuestion?.videoUrl) {
          mediaType = 'video'
        } else {
          mediaType = 'audio'
        }
      }
    } else {
      // Answer media - prioritize answer-specific media, then fall back to question media
      const answerVideoUrl = currentQuestion?.question?.answerVideoUrl || currentQuestion?.answerVideoUrl
      const answerAudioUrl = currentQuestion?.question?.answerAudioUrl || currentQuestion?.answerAudioUrl
      const questionVideoUrl = currentQuestion?.question?.videoUrl || currentQuestion?.videoUrl
      const questionAudioUrl = currentQuestion?.question?.audioUrl || currentQuestion?.audioUrl

      // Prioritize answer media first, then fall back to question media
      mediaUrl = answerVideoUrl || answerAudioUrl || questionVideoUrl || questionAudioUrl

      // Determine type based on URL
      if (mediaUrl) {
        if (mediaUrl.includes('.mp4') || mediaUrl.includes('.mov') || mediaUrl.includes('.webm') || answerVideoUrl || questionVideoUrl) {
          mediaType = 'video'
        } else {
          mediaType = 'audio'
        }
      }
    }

    const optimizedUrl = mediaUrl ? getOptimizedMediaUrl(mediaUrl, 'medium', mediaType === 'video' ? 'video' : 'audio') : null
    return { src: optimizedUrl, type: mediaType }
  }, [currentQuestion, isQuestionMedia])

  // Don't render if no media source
  if (!src) {
    return null
  }

  return (
    <div
      className={type === 'video' ? "relative overflow-hidden media-wrapper" : ""}
      style={
        type === 'audio'
          ? { width: '100%', maxWidth: '400px', margin: '0 auto' }
          : type === 'video'
          ? { width: '100%', height: '100%' }
          : {}
      }
    >
      {type === 'video' ? (
        <>
          <style>{`
            /* Hide native fullscreen button so our custom one replaces it */
            video::-webkit-media-controls-fullscreen-button {
              display: none !important;
            }
            video::-moz-full-screen-button {
              display: none !important;
            }
          `}</style>
          <div className={
            isCssFullscreen
              ? "fixed inset-0 z-[9999] bg-black flex items-center justify-center"
              : "w-full h-full flex items-center justify-center"
          }>
            <div className={
              isCssFullscreen
                ? "relative w-full h-full flex items-center justify-center"
                : "relative h-full aspect-video max-w-full"
            }>
              <video
                src={src}
                controlsList="nodownload nofullscreen"
                preload="metadata"
                loop
                controls
                playsInline
                className={
                  isCssFullscreen
                    ? "max-w-full max-h-full object-contain"
                    : "w-full h-full object-contain"
                }
                style={isCssFullscreen ? {} : { objectPosition: 'top' }}
              />
              {/* Custom fullscreen toggle button */}
              <button
                onClick={() => setIsCssFullscreen(prev => !prev)}
                className={
                  isCssFullscreen
                    ? "absolute top-4 right-4 text-white bg-black/50 hover:bg-black/70 rounded-full p-2 transition-colors z-10"
                    : "absolute top-2 right-2 text-white bg-black/50 hover:bg-black/70 rounded-lg p-2 transition-colors z-10"
                }
                title={isCssFullscreen ? "إغلاق" : "ملء الشاشة"}
              >
                {isCssFullscreen ? (
                  <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                ) : (
                  <svg className="w-7 h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4" />
                  </svg>
                )}
              </button>
            </div>
          </div>
        </>
      ) : (
        <MediaPlayer
          src={src}
          type={type}
          className={type === 'audio' ? "" : "w-full h-full"}
          containerWidth={type === 'audio' ? Math.min(400, styles.questionAreaWidth * 0.9) : styles.questionAreaWidth}
          maxHeight={type === 'audio' ? 100 : styles.imageAreaHeight}
          hideVolumeControl={type === 'audio'}
        />
      )}
    </div>
  )
}

export default QuestionMediaPlayer