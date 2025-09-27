import { useState, useRef, useEffect } from 'react'

function MediaPlayer({ src, type = 'audio', className = '', autoPlay = false }) {
  const mediaRef = useRef(null)
  const progressRef = useRef(null)
  const [isPlaying, setIsPlaying] = useState(false)
  const [currentTime, setCurrentTime] = useState(0)
  const [duration, setDuration] = useState(0)
  const [isLoading, setIsLoading] = useState(true)
  const [volume, setVolume] = useState(1)
  const [isMuted, setIsMuted] = useState(false)
  const [error, setError] = useState(null)
  const [isFullscreen, setIsFullscreen] = useState(false)

  const isVideo = type === 'video' || src?.includes('.mp4') || src?.includes('.mov') || src?.includes('.webm')
  const isAudio = type === 'audio' || src?.includes('.mp3') || src?.includes('.wav') || src?.includes('.ogg')

  useEffect(() => {
    const media = mediaRef.current
    if (!media) return

    const handleLoadedData = () => {
      setDuration(media.duration)
      setIsLoading(false)
      if (autoPlay) {
        media.play().catch(console.error)
        setIsPlaying(true)
      }
    }

    const handleTimeUpdate = () => {
      setCurrentTime(media.currentTime)
    }

    const handleEnded = () => {
      setIsPlaying(false)
      setCurrentTime(0)
    }

    const handleError = (e) => {
      console.error('Media loading error:', e, 'Source:', src)
      const mediaType = isVideo ? 'الفيديو' : 'الملف الصوتي'
      setError(`${mediaType} غير موجود: ${src}`)
      setIsLoading(false)
    }

    const handlePlay = () => setIsPlaying(true)
    const handlePause = () => setIsPlaying(false)

    media.addEventListener('loadeddata', handleLoadedData)
    media.addEventListener('timeupdate', handleTimeUpdate)
    media.addEventListener('ended', handleEnded)
    media.addEventListener('error', handleError)
    media.addEventListener('play', handlePlay)
    media.addEventListener('pause', handlePause)

    return () => {
      media.removeEventListener('loadeddata', handleLoadedData)
      media.removeEventListener('timeupdate', handleTimeUpdate)
      media.removeEventListener('ended', handleEnded)
      media.removeEventListener('error', handleError)
      media.removeEventListener('play', handlePlay)
      media.removeEventListener('pause', handlePause)
    }
  }, [src, autoPlay, isVideo])

  const togglePlay = () => {
    const media = mediaRef.current
    if (!media) return

    if (isPlaying) {
      media.pause()
    } else {
      media.play().catch((err) => {
        console.error('Media play error:', err)
        const mediaType = isVideo ? 'الفيديو' : 'الملف الصوتي'
        setError(`خطأ في تشغيل ${mediaType} - الملف غير موجود`)
      })
    }
  }

  const handleProgressClick = (e) => {
    const media = mediaRef.current
    const progressBar = progressRef.current
    if (!media || !progressBar) return

    const rect = progressBar.getBoundingClientRect()
    const clickX = e.clientX - rect.left
    const newTime = (clickX / rect.width) * duration
    media.currentTime = newTime
    setCurrentTime(newTime)
  }

  const handleVolumeChange = (e) => {
    const newVolume = parseFloat(e.target.value)
    setVolume(newVolume)
    if (mediaRef.current) {
      mediaRef.current.volume = newVolume
    }
    setIsMuted(newVolume === 0)
  }

  const toggleMute = () => {
    const media = mediaRef.current
    if (!media) return

    if (isMuted) {
      media.volume = volume
      setIsMuted(false)
    } else {
      media.volume = 0
      setIsMuted(true)
    }
  }

  const toggleFullscreen = () => {
    const media = mediaRef.current
    if (!media || !isVideo) return

    if (!isFullscreen) {
      if (media.requestFullscreen) {
        media.requestFullscreen()
      } else if (media.webkitRequestFullscreen) {
        media.webkitRequestFullscreen()
      } else if (media.mozRequestFullScreen) {
        media.mozRequestFullScreen()
      }
    } else {
      if (document.exitFullscreen) {
        document.exitFullscreen()
      } else if (document.webkitExitFullscreen) {
        document.webkitExitFullscreen()
      } else if (document.mozCancelFullScreen) {
        document.mozCancelFullScreen()
      }
    }
    setIsFullscreen(!isFullscreen)
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
    <div className={`bg-gradient-to-r ${isVideo ? 'from-blue-50 to-purple-50 border-blue-200' : 'from-red-50 to-orange-50 border-red-200'} border rounded-xl shadow-lg backdrop-blur-sm ${className}`}>
      {/* Video Display */}
      {isVideo && (
        <div className="relative aspect-video bg-black rounded-t-xl overflow-hidden">
          <video
            ref={mediaRef}
            src={src}
            preload="metadata"
            volume={volume}
            className="w-full h-full object-contain"
            onClick={togglePlay}
          />

          {/* Video Overlay Controls */}
          <div className="absolute inset-0 bg-black bg-opacity-0 hover:bg-opacity-30 transition-all duration-300 flex items-center justify-center group">
            <button
              onClick={togglePlay}
              className="opacity-0 group-hover:opacity-100 transition-opacity duration-300 w-16 h-16 rounded-full bg-black bg-opacity-50 flex items-center justify-center text-white"
            >
              {isLoading ? (
                <div className="animate-spin w-6 h-6 border-2 border-white border-t-transparent rounded-full"></div>
              ) : isPlaying ? (
                <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M6 4h4v16H6V4zm8 0h4v16h-4V4z"/>
                </svg>
              ) : (
                <svg className="w-6 h-6 ml-1" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M8 5v14l11-7z"/>
                </svg>
              )}
            </button>
          </div>
        </div>
      )}

      {/* Audio Element (hidden for video) */}
      {isAudio && (
        <audio
          ref={mediaRef}
          src={src}
          preload="metadata"
          volume={volume}
        />
      )}

      {/* Media Controls */}
      <div className="p-4" dir="ltr">
        <div className="flex items-center gap-3">
          {/* Play/Pause Button */}
          <button
            onClick={togglePlay}
            disabled={isLoading}
            className={`flex-shrink-0 w-10 h-10 rounded-full flex items-center justify-center font-bold text-white transition-all duration-300 shadow-md hover:shadow-lg ${
              isLoading
                ? 'bg-gray-400 cursor-not-allowed'
                : isPlaying
                  ? `bg-gradient-to-r ${isVideo ? 'from-blue-500 to-blue-600 hover:from-blue-600 hover:to-blue-700' : 'from-red-500 to-red-600 hover:from-red-600 hover:to-red-700'}`
                  : `bg-gradient-to-r ${isVideo ? 'from-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800' : 'from-red-600 to-red-700 hover:from-red-700 hover:to-red-800'}`
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
            <span className={`text-sm font-medium min-w-[2.5rem] text-center block ${isVideo ? 'text-blue-700' : 'text-red-700'}`}>
              {formatTime(currentTime)}
            </span>
          </div>

          {/* Progress Bar */}
          <div className="flex-1 px-2">
            <div
              ref={progressRef}
              onClick={handleProgressClick}
              className={`relative h-1.5 rounded-full cursor-pointer overflow-hidden group ${isVideo ? 'bg-blue-200' : 'bg-red-200'}`}
            >
              <div
                className={`absolute top-0 left-0 h-full rounded-full transition-all duration-200 ease-out ${isVideo ? 'bg-gradient-to-r from-blue-500 to-blue-600' : 'bg-gradient-to-r from-red-500 to-red-600'}`}
                style={{ width: `${progressPercentage}%` }}
              />
              <div className={`absolute top-0 left-0 w-full h-full opacity-0 group-hover:opacity-100 transition-opacity duration-200 rounded-full ${isVideo ? 'bg-gradient-to-r from-blue-400/20 to-blue-600/20' : 'bg-gradient-to-r from-red-400/20 to-red-600/20'}`} />
            </div>
          </div>

          {/* Time Display - Duration */}
          <div className="flex-shrink-0">
            <span className={`text-sm font-medium min-w-[2.5rem] text-center block ${isVideo ? 'text-blue-600' : 'text-red-600'}`}>
              {formatTime(duration)}
            </span>
          </div>

          {/* Volume Control */}
          <div className="flex items-center gap-1 flex-shrink-0 ml-2">
            <button
              onClick={toggleMute}
              className={`w-7 h-7 rounded-md flex items-center justify-center transition-colors duration-200 ${isVideo ? 'text-blue-600 hover:bg-blue-100' : 'text-red-600 hover:bg-red-100'}`}
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
                background: isVideo ? '#dbeafe' : '#fecaca',
                height: '4px',
                outline: 'none'
              }}
            />
          </div>

          {/* Fullscreen Button (Video Only) */}
          {isVideo && (
            <button
              onClick={toggleFullscreen}
              className="w-7 h-7 rounded-md flex items-center justify-center text-blue-600 hover:bg-blue-100 transition-colors duration-200 ml-1"
            >
              <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                <path d="M7 14H5v5h5v-2H7v-3zm-2-4h2V7h3V5H5v5zm12 7h-3v2h5v-5h-2v3zM14 5v2h3v3h2V5h-5z"/>
              </svg>
            </button>
          )}
        </div>
      </div>

      {/* Slider Styles */}
      <style dangerouslySetInnerHTML={{
        __html: `
          input[type="range"]::-webkit-slider-thumb {
            -webkit-appearance: none;
            width: 12px;
            height: 12px;
            border-radius: 50%;
            background: ${isVideo ? '#2563eb' : '#dc2626'};
            cursor: pointer;
            box-shadow: 0 1px 3px rgba(0, 0, 0, 0.3);
          }

          input[type="range"]::-webkit-slider-track {
            height: 4px;
            border-radius: 2px;
            background: ${isVideo ? '#dbeafe' : '#fecaca'};
          }

          input[type="range"]::-moz-range-thumb {
            width: 12px;
            height: 12px;
            border-radius: 50%;
            background: ${isVideo ? '#2563eb' : '#dc2626'};
            cursor: pointer;
            border: none;
            box-shadow: 0 1px 3px rgba(0, 0, 0, 0.3);
          }

          input[type="range"]::-moz-range-track {
            height: 4px;
            border-radius: 2px;
            background: ${isVideo ? '#dbeafe' : '#fecaca'};
          }
        `
      }} />
    </div>
  )
}

export default MediaPlayer