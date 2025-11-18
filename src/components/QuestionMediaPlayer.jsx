import { devLog, devWarn, prodError } from "../utils/devLog"
import { useMemo, memo } from 'react'
import MediaPlayer from './MediaPlayer'
import { getOptimizedMediaUrl } from '../utils/mediaUrlConverter'

const QuestionMediaPlayer = memo(function QuestionMediaPlayer({ currentQuestion, showAnswer, isQuestionMedia, styles }) {
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
          ? { display: 'block', height: `${styles.imageAreaHeight}px` }
          : {}
      }
    >
      {type === 'video' ? (
        <div className="flex flex-col items-center gap-2 portrait:sm:gap-4 h-full landscape:pb-3">
          <video
            src={src}
            controlsList="nodownload nofullscreen"
            preload="metadata"
            loop
            controls
            playsInline
            className="h-auto object-contain mx-auto max-w-full max-h-full"
          />
        </div>
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
})

export default QuestionMediaPlayer