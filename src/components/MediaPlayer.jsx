import { useState, useRef, useEffect } from 'react'

function MediaPlayer({ src, type = 'audio', className = '', autoPlay = false, deviceType = 'desktop', containerWidth = 500, maxHeight = null }) {
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
  const [showVolumeControl, setShowVolumeControl] = useState(false)

  // Dynamic sizing based on container width
  const isUltraNarrow = containerWidth <= 240
  const isMobile = containerWidth <= 360 && containerWidth > 240
  const controlScale = Math.max(0.6, Math.min(1, containerWidth / 500))
  const paddingScale = Math.max(0.25, Math.min(1, containerWidth / 400))

  // Calculate control area height to reserve space - slim controls
  const controlPadding = Math.max(2, 8 * paddingScale)
  const buttonHeight = Math.max(24, 32 * controlScale)
  const controlAreaHeight = (controlPadding * 2) + buttonHeight + 4 // Minimal margin

  // Calculate available video height when maxHeight is specified - responsive control space
  const controlSpaceNeeded = isUltraNarrow ? 80 : isMobile ? 70 : 60 // More space needed on mobile
  const availableVideoHeight = maxHeight ? Math.max(100, maxHeight - controlSpaceNeeded) : null

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

  // Close volume control when clicking outside
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (showVolumeControl && !event.target.closest('.volume-control-container')) {
        setShowVolumeControl(false)
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [showVolumeControl])

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

  const toggleVolumeControl = () => {
    setShowVolumeControl(!showVolumeControl)
  }

  const handleVerticalVolumeChange = (e) => {
    const newVolume = parseFloat(e.target.value)
    setVolume(newVolume)
    if (mediaRef.current) {
      mediaRef.current.volume = newVolume
    }
    setIsMuted(newVolume === 0)
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
    <div
      className={`bg-gradient-to-r ${isVideo ? 'from-blue-50 to-purple-50 border-blue-200' : 'from-red-50 to-orange-50 border-red-200'} border rounded-xl shadow-lg backdrop-blur-sm ${className}`}
      style={{
        display: 'flex',
        flexDirection: 'column',
        width: '100%',
        maxWidth: '100%',
        ...(maxHeight ? { maxHeight: `${maxHeight}px` } : {})
      }}
    >
      {/* Video Display */}
      {isVideo && (
        <div
          className={`relative bg-black rounded-t-xl overflow-hidden ${
            maxHeight ? '' : (
              isUltraNarrow ? 'aspect-[4/3]' :
              isMobile ? 'aspect-[3/2]' :
              'aspect-video'
            )
          }`}
          style={availableVideoHeight ? {
            height: `${availableVideoHeight}px`,
            width: '100%',
            minHeight: '100px',
            flexShrink: 0
          } : {}}
        >
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
      <div
        className="flex-shrink-0"
        style={{
          padding: `${controlPadding}px`,
          minHeight: `${controlAreaHeight}px`,
          direction: 'ltr'
        }}
      >
        <div className="flex items-center" style={{ gap: `${Math.max(4, 12 * controlScale)}px` }}>
          {/* Play/Pause Button */}
          <button
            onClick={togglePlay}
            disabled={isLoading}
            style={{
              width: `${Math.max(24, 32 * controlScale)}px`,
              height: `${Math.max(24, 32 * controlScale)}px`
            }}
            className={`flex-shrink-0 rounded-full flex items-center justify-center font-bold text-white transition-all duration-300 shadow-md hover:shadow-lg ${
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

          {/* Time Display - Current - Hidden on ultra narrow */}
          {!isUltraNarrow && (
            <div className="flex-shrink-0">
              <span
                className={`font-medium text-center block ${isVideo ? 'text-blue-700' : 'text-red-700'}`}
                style={{
                  fontSize: `${Math.max(8, 12 * controlScale)}px`,
                  minWidth: `${Math.max(25, 35 * controlScale)}px`
                }}
              >
                {formatTime(currentTime)}
              </span>
            </div>
          )}

          {/* Progress Bar */}
          <div className="flex-1" style={{ paddingLeft: `${Math.max(1, 4 * paddingScale)}px`, paddingRight: `${Math.max(1, 4 * paddingScale)}px` }}>
            <div
              ref={progressRef}
              onClick={handleProgressClick}
              className={`relative rounded-full cursor-pointer overflow-hidden group ${isVideo ? 'bg-blue-200' : 'bg-red-200'}`}
              style={{ height: `${Math.max(3, 4 * controlScale)}px` }}
            >
              <div
                className={`absolute top-0 left-0 h-full rounded-full transition-all duration-200 ease-out ${isVideo ? 'bg-gradient-to-r from-blue-500 to-blue-600' : 'bg-gradient-to-r from-red-500 to-red-600'}`}
                style={{ width: `${progressPercentage}%` }}
              />
              <div className={`absolute top-0 left-0 w-full h-full opacity-0 group-hover:opacity-100 transition-opacity duration-200 rounded-full ${isVideo ? 'bg-gradient-to-r from-blue-400/20 to-blue-600/20' : 'bg-gradient-to-r from-red-400/20 to-red-600/20'}`} />
            </div>
          </div>

          {/* Time Display - Duration - Hidden on ultra narrow */}
          {!isUltraNarrow && (
            <div className="flex-shrink-0">
              <span
                className={`font-medium text-center block ${isVideo ? 'text-blue-600' : 'text-red-600'}`}
                style={{
                  fontSize: `${Math.max(8, 12 * controlScale)}px`,
                  minWidth: `${Math.max(25, 35 * controlScale)}px`
                }}
              >
                {formatTime(duration)}
              </span>
            </div>
          )}

          {/* Volume Control */}
          <div className="volume-control-container relative flex items-center flex-shrink-0" style={{ marginLeft: `${Math.max(4, 8 * controlScale)}px` }}>
            <button
              onClick={toggleVolumeControl}
              className={`rounded-md flex items-center justify-center transition-colors duration-200 ${isVideo ? 'text-blue-600 hover:bg-blue-100' : 'text-red-600 hover:bg-red-100'}`}
              style={{
                width: `${Math.max(18, 24 * controlScale)}px`,
                height: `${Math.max(18, 24 * controlScale)}px`
              }}
            >
              {isMuted || volume === 0 ? (
                <svg style={{ width: `${Math.max(12, 16 * controlScale)}px`, height: `${Math.max(12, 16 * controlScale)}px` }} fill="currentColor" viewBox="0 0 24 24">
                  <path d="M16.5 12A4.5 4.5 0 0 0 14 7.97v2.21l2.45 2.45c.03-.2.05-.41.05-.63zm2.5 0c0 .94-.2 1.82-.54 2.64l1.51 1.51A8.796 8.796 0 0 0 21 12c0-4.28-2.99-7.86-7-8.77v2.06c2.89.86 5 3.54 5 6.71zM4.27 3L3 4.27 7.73 9H3v6h4l5 5v-6.73l4.25 4.25c-.67.52-1.42.93-2.25 1.18v2.06a8.99 8.99 0 0 0 3.69-1.81L19.73 21 21 19.73l-9-9L4.27 3zM12 4L9.91 6.09 12 8.18V4z"/>
                </svg>
              ) : volume > 0.5 ? (
                <svg style={{ width: `${Math.max(12, 16 * controlScale)}px`, height: `${Math.max(12, 16 * controlScale)}px` }} fill="currentColor" viewBox="0 0 24 24">
                  <path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3A4.5 4.5 0 0 0 14 7.97v8.05c1.48-.73 2.5-2.25 2.5-4.02zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z"/>
                </svg>
              ) : (
                <svg style={{ width: `${Math.max(12, 16 * controlScale)}px`, height: `${Math.max(12, 16 * controlScale)}px` }} fill="currentColor" viewBox="0 0 24 24">
                  <path d="M18.5 12A4.5 4.5 0 0 0 16 7.97v8.05c1.48-.73 2.5-2.25 2.5-4.02zM5 9v6h4l5 5V4L9 9H5z"/>
                </svg>
              )}
            </button>

            {/* Vertical Volume Control Popup */}
            {showVolumeControl && (
              <div className={`absolute bottom-full mb-2 left-1/2 transform -translate-x-1/2 bg-white rounded-lg shadow-lg border p-2 z-10`}>
                <div className="flex flex-col items-center">
                  <input
                    type="range"
                    min="0"
                    max="1"
                    step="0.1"
                    value={isMuted ? 0 : volume}
                    onChange={handleVerticalVolumeChange}
                    className="h-20 w-2 appearance-none bg-gray-200 rounded-lg cursor-pointer slider-vertical"
                    style={{
                      writingMode: 'bt-lr', /* IE */
                      WebkitAppearance: 'slider-vertical', /* WebKit */
                    }}
                  />
                  <span className="text-xs text-gray-600 mt-1">{Math.round(volume * 100)}%</span>
                  <button
                    onClick={toggleMute}
                    className="mt-1 text-xs text-gray-500 hover:text-gray-700"
                  >
                    {isMuted ? 'إلغاء كتم' : 'كتم'}
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Fullscreen Button (Video Only) - Hidden on ultra narrow */}
          {isVideo && !isUltraNarrow && (
            <button
              onClick={toggleFullscreen}
              className="rounded-md flex items-center justify-center text-blue-600 hover:bg-blue-100 transition-colors duration-200"
              style={{
                width: `${Math.max(18, 24 * controlScale)}px`,
                height: `${Math.max(18, 24 * controlScale)}px`,
                marginLeft: `${Math.max(2, 3 * controlScale)}px`
              }}
            >
              <svg style={{ width: `${Math.max(12, 16 * controlScale)}px`, height: `${Math.max(12, 16 * controlScale)}px` }} fill="currentColor" viewBox="0 0 24 24">
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

          /* Vertical Slider Styles */
          .slider-vertical {
            -webkit-appearance: slider-vertical !important;
            width: 8px !important;
            height: 80px !important;
            background: ${isVideo ? '#dbeafe' : '#fecaca'} !important;
            outline: none !important;
            border-radius: 4px !important;
          }

          .slider-vertical::-webkit-slider-thumb {
            -webkit-appearance: none !important;
            width: 16px !important;
            height: 16px !important;
            border-radius: 50% !important;
            background: ${isVideo ? '#2563eb' : '#dc2626'} !important;
            cursor: pointer !important;
            box-shadow: 0 2px 4px rgba(0, 0, 0, 0.3) !important;
          }

          .slider-vertical::-moz-range-thumb {
            width: 16px !important;
            height: 16px !important;
            border-radius: 50% !important;
            background: ${isVideo ? '#2563eb' : '#dc2626'} !important;
            cursor: pointer !important;
            border: none !important;
            box-shadow: 0 2px 4px rgba(0, 0, 0, 0.3) !important;
          }
        `
      }} />
    </div>
  )
}

export default MediaPlayer