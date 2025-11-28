import { devLog, devWarn, prodError } from "../utils/devLog"
import { useState, useRef, useEffect } from 'react'
import { getOptimizedMediaUrl } from '../utils/mediaUrlConverter'

function AudioPlayer({ src, className = '' }) {
  // Convert URL to optimized CloudFront URL
  const optimizedSrc = src ? getOptimizedMediaUrl(src, 'medium', 'audio') : null

  // Log CloudFront configuration on first load
  useEffect(() => {
    devLog('🔧 CloudFront Config Check:', {
      enabled: import.meta.env.VITE_CLOUDFRONT_ENABLED,
      domain: import.meta.env.VITE_CLOUDFRONT_DOMAIN,
      baseUrl: import.meta.env.VITE_CDN_BASE_URL
    })
  }, [])
  const audioRef = useRef(null)
  const progressRef = useRef(null)
  const [isPlaying, setIsPlaying] = useState(false)
  const [currentTime, setCurrentTime] = useState(0)
  const [duration, setDuration] = useState(0)
  const [isLoading, setIsLoading] = useState(true)
  const [volume, setVolume] = useState(1)
  const [isMuted, setIsMuted] = useState(false)
  const [error, setError] = useState(null)

  useEffect(() => {
    const audio = audioRef.current
    if (!audio) return

    // Log URL conversion for debugging
    devLog('🎵 AudioPlayer URL conversion:', {
      original: src,
      optimized: optimizedSrc
    })

    const handleLoadedData = () => {
      devLog('🎵 Audio loaded (loadeddata)')
      if (audio.duration && !isNaN(audio.duration)) {
        setDuration(audio.duration)
      }
      setIsLoading(false)
    }

    // iOS often fires loadedmetadata before loadeddata
    const handleLoadedMetadata = () => {
      devLog('🎵 Audio metadata loaded (iOS)')
      if (audio.duration && !isNaN(audio.duration)) {
        setDuration(audio.duration)
      }
      setIsLoading(false)
    }

    // canplaythrough is more reliable on iOS
    const handleCanPlayThrough = () => {
      devLog('🎵 Audio can play through (iOS)')
      if (audio.duration && !isNaN(audio.duration)) {
        setDuration(audio.duration)
      }
      setIsLoading(false)
    }

    const handleTimeUpdate = () => {
      setCurrentTime(audio.currentTime)
      // iOS sometimes doesn't report duration until playback starts
      if (audio.duration && !isNaN(audio.duration) && duration === 0) {
        setDuration(audio.duration)
      }
    }

    const handleEnded = () => {
      setIsPlaying(false)
      setCurrentTime(0)
    }

    const handleError = (e) => {
      prodError('Audio loading error:', e, 'Original Source:', src, 'Optimized Source:', optimizedSrc)
      setError('الملف الصوتي غير موجود: ' + optimizedSrc)
      setIsLoading(false)
    }

    // Add all event listeners for better iOS compatibility
    audio.addEventListener('loadeddata', handleLoadedData)
    audio.addEventListener('loadedmetadata', handleLoadedMetadata)
    audio.addEventListener('canplaythrough', handleCanPlayThrough)
    audio.addEventListener('timeupdate', handleTimeUpdate)
    audio.addEventListener('ended', handleEnded)
    audio.addEventListener('error', handleError)

    // Force load on iOS - sometimes needed
    if (audio.load) {
      audio.load()
    }

    return () => {
      audio.removeEventListener('loadeddata', handleLoadedData)
      audio.removeEventListener('loadedmetadata', handleLoadedMetadata)
      audio.removeEventListener('canplaythrough', handleCanPlayThrough)
      audio.removeEventListener('timeupdate', handleTimeUpdate)
      audio.removeEventListener('ended', handleEnded)
      audio.removeEventListener('error', handleError)
    }
  }, [src, optimizedSrc, duration])

  const togglePlay = () => {
    const audio = audioRef.current
    if (!audio) return

    if (isPlaying) {
      audio.pause()
    } else {
      audio.play().catch((err) => {
        prodError('Audio play error:', err)
        setError('خطأ في تشغيل الملف الصوتي - الملف غير موجود')
      })
    }
    setIsPlaying(!isPlaying)
  }

  const handleProgressClick = (e) => {
    const audio = audioRef.current
    const progressBar = progressRef.current
    if (!audio || !progressBar) return

    const rect = progressBar.getBoundingClientRect()
    const clickX = e.clientX - rect.left
    const newTime = (clickX / rect.width) * duration
    audio.currentTime = newTime
    setCurrentTime(newTime)
  }

  const handleVolumeChange = (e) => {
    const newVolume = parseFloat(e.target.value)
    setVolume(newVolume)
    if (audioRef.current) {
      audioRef.current.volume = newVolume
    }
    setIsMuted(newVolume === 0)
  }

  const toggleMute = () => {
    const audio = audioRef.current
    if (!audio) return

    if (isMuted) {
      audio.volume = volume
      setIsMuted(false)
    } else {
      audio.volume = 0
      setIsMuted(true)
    }
  }

  const formatTime = (time) => {
    if (isNaN(time)) return '0:00'
    const minutes = Math.floor(time / 60)
    const seconds = Math.floor(time % 60)
    return `${minutes}:${seconds.toString().padStart(2, '0')}`
  }

  const progressPercentage = duration > 0 ? (currentTime / duration) * 100 : 0

  if (error) {
    return (
      <div className={`bg-red-50 border border-red-300 rounded-xl p-4 shadow-sm ${className}`}>
        <div className="text-red-600 text-sm text-center font-medium">
          ⚠️ {error}
        </div>
      </div>
    )
  }

  return (
    <div className={`bg-gradient-to-r from-red-50 to-orange-50 border border-red-200 rounded-xl p-4 shadow-lg backdrop-blur-sm ${className}`} dir="ltr">
      <audio
        ref={audioRef}
        src={optimizedSrc}
        preload="auto"
        loop
        playsInline
        webkit-playsinline="true"
        x-webkit-airplay="allow"
      />

      <div className="flex items-center gap-3">
        {/* Play/Pause Button */}
        <button
          onClick={togglePlay}
          disabled={isLoading}
          className={`flex-shrink-0 w-10 h-10 rounded-full flex items-center justify-center font-bold text-white transition-all duration-300 shadow-md hover:shadow-lg ${
            isLoading
              ? 'bg-gray-400 cursor-not-allowed'
              : isPlaying
                ? 'bg-gradient-to-r from-red-500 to-red-600 hover:from-red-600 hover:to-red-700'
                : 'bg-gradient-to-r from-red-600 to-red-700 hover:from-red-700 hover:to-red-800'
          }`}
        >
          {isLoading ? (
            <div className="animate-spin w-4 h-4 border-2 border-white border-t-transparent rounded-full"></div>
          ) : isPlaying ? (
            <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
              <path d="M6 4h4v16H6V4zm8 0h4v16h-4V4z"/>
            </svg>
          ) : (
            <svg className="w-4 h-4 ml-0.5" fill="currentColor" viewBox="0 0 24 24">
              <path d="M8 5v14l11-7z"/>
            </svg>
          )}
        </button>

        {/* Time Display - Current */}
        <div className="flex-shrink-0">
          <span className="text-sm font-medium text-red-700 min-w-[2.5rem] text-center block">
            {formatTime(currentTime)}
          </span>
        </div>

        {/* Progress Bar */}
        <div className="flex-1 px-2">
          <div
            ref={progressRef}
            onClick={handleProgressClick}
            className="relative h-1.5 bg-red-200 rounded-full cursor-pointer overflow-hidden group"
          >
            <div
              className="absolute top-0 left-0 h-full bg-gradient-to-r from-red-500 to-red-600 rounded-full transition-all duration-200 ease-out"
              style={{ width: `${progressPercentage}%` }}
            />
            <div className="absolute top-0 left-0 w-full h-full bg-gradient-to-r from-red-400/20 to-red-600/20 opacity-0 group-hover:opacity-100 transition-opacity duration-200 rounded-full" />
          </div>
        </div>

        {/* Time Display - Duration */}
        <div className="flex-shrink-0">
          <span className="text-sm font-medium text-red-600 min-w-[2.5rem] text-center block">
            {formatTime(duration)}
          </span>
        </div>

        {/* Volume Control */}
        <div className="flex items-center gap-1 flex-shrink-0 ml-2">
          <button
            onClick={toggleMute}
            className="w-7 h-7 rounded-md flex items-center justify-center text-red-600 hover:bg-red-100 transition-colors duration-200"
          >
            {isMuted || volume === 0 ? (
              <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                <path d="M16.5 12A4.5 4.5 0 0 0 14 7.97v2.21l2.45 2.45c.03-.2.05-.41.05-.63zm2.5 0c0 .94-.2 1.82-.54 2.64l1.51 1.51A8.796 8.796 0 0 0 21 12c0-4.28-2.99-7.86-7-8.77v2.06c2.89.86 5 3.54 5 6.71zM4.27 3L3 4.27 7.73 9H3v6h4l5 5v-6.73l4.25 4.25c-.67.52-1.42.93-2.25 1.18v2.06a8.99 8.99 0 0 0 3.69-1.81L19.73 21 21 19.73l-9-9L4.27 3zM12 4L9.91 6.09 12 8.18V4z"/>
              </svg>
            ) : volume > 0.5 ? (
              <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                <path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3A4.5 4.5 0 0 0 14 7.97v8.05c1.48-.73 2.5-2.25 2.5-4.02zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z"/>
              </svg>
            ) : (
              <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                <path d="M18.5 12A4.5 4.5 0 0 0 16 7.97v8.05c1.48-.73 2.5-2.25 2.5-4.02zM5 9v6h4l5 5V4L9 9H5z"/>
              </svg>
            )}
          </button>

          <input
            type="range"
            min="0"
            max="1"
            step="0.1"
            value={isMuted ? 0 : volume}
            onChange={handleVolumeChange}
            className="w-12 h-1 rounded-lg appearance-none cursor-pointer"
            style={{
              background: '#fecaca',
              height: '4px',
              outline: 'none'
            }}
          />
          <style dangerouslySetInnerHTML={{
            __html: `
              input[type="range"]::-webkit-slider-thumb {
                -webkit-appearance: none;
                width: 12px;
                height: 12px;
                border-radius: 50%;
                background: #dc2626;
                cursor: pointer;
                box-shadow: 0 1px 3px rgba(0, 0, 0, 0.3);
              }

              input[type="range"]::-webkit-slider-track {
                height: 4px;
                border-radius: 2px;
                background: #fecaca;
              }

              input[type="range"]::-moz-range-thumb {
                width: 12px;
                height: 12px;
                border-radius: 50%;
                background: #dc2626;
                cursor: pointer;
                border: none;
                box-shadow: 0 1px 3px rgba(0, 0, 0, 0.3);
              }

              input[type="range"]::-moz-range-track {
                height: 4px;
                border-radius: 2px;
                background: #fecaca;
              }
            `
          }} />
        </div>
      </div>
    </div>
  )
}

export default AudioPlayer