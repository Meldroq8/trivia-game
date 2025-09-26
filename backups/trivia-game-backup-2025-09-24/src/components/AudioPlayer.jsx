import { useState, useRef, useEffect } from 'react'

function AudioPlayer({ src, className = '' }) {
  const audioRef = useRef(null)
  const [isPlaying, setIsPlaying] = useState(false)
  const [currentTime, setCurrentTime] = useState(0)
  const [duration, setDuration] = useState(0)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    const audio = audioRef.current
    if (!audio) return

    const handleLoadedData = () => {
      setDuration(audio.duration)
      setIsLoading(false)
    }

    const handleTimeUpdate = () => {
      setCurrentTime(audio.currentTime)
    }

    const handleEnded = () => {
      setIsPlaying(false)
      setCurrentTime(0)
    }

    const handleError = (e) => {
      console.error('Audio loading error:', e, 'Source:', src)
      setError('الملف الصوتي غير موجود: ' + src)
      setIsLoading(false)
    }

    audio.addEventListener('loadeddata', handleLoadedData)
    audio.addEventListener('timeupdate', handleTimeUpdate)
    audio.addEventListener('ended', handleEnded)
    audio.addEventListener('error', handleError)

    return () => {
      audio.removeEventListener('loadeddata', handleLoadedData)
      audio.removeEventListener('timeupdate', handleTimeUpdate)
      audio.removeEventListener('ended', handleEnded)
      audio.removeEventListener('error', handleError)
    }
  }, [src])

  const togglePlay = () => {
    const audio = audioRef.current
    if (!audio) return

    if (isPlaying) {
      audio.pause()
    } else {
      audio.play().catch((err) => {
        console.error('Audio play error:', err)
        setError('خطأ في تشغيل الملف الصوتي - الملف غير موجود')
      })
    }
    setIsPlaying(!isPlaying)
  }

  const formatTime = (time) => {
    if (isNaN(time)) return '0'
    return Math.floor(time).toString()
  }

  if (error) {
    return (
      <div className={`bg-red-50 border border-red-200 rounded-lg p-3 ${className}`}>
        <div className="text-red-600 text-sm text-center">
          ⚠️ {error}
        </div>
      </div>
    )
  }

  return (
    <div className={`bg-gray-50 border border-gray-200 rounded-lg p-3 ${className}`}>
      <audio ref={audioRef} src={src} preload="metadata" />

      <div className="flex items-center justify-between gap-3">
        {/* Play/Pause Button */}
        <button
          onClick={togglePlay}
          disabled={isLoading}
          className={`flex-shrink-0 w-10 h-10 rounded-full flex items-center justify-center font-bold text-white transition-colors ${
            isLoading
              ? 'bg-gray-400 cursor-not-allowed'
              : isPlaying
                ? 'bg-red-500 hover:bg-red-600'
                : 'bg-green-500 hover:bg-green-600'
          }`}
        >
          {isLoading ? (
            <div className="animate-spin w-4 h-4 border-2 border-white border-t-transparent rounded-full"></div>
          ) : isPlaying ? (
            '⏸️'
          ) : (
            '▶️'
          )}
        </button>

        {/* Time Display */}
        <div className="flex-1 text-center">
          <div className="text-sm font-mono text-gray-700">
            {formatTime(currentTime)} / {formatTime(duration)}
          </div>
        </div>

        {/* Audio Icon */}
        <div className="flex-shrink-0 text-gray-500">
          🎵
        </div>
      </div>
    </div>
  )
}

export default AudioPlayer