import { devLog, devWarn } from './devLog.js'

/**
 * Simple Media Processing using Native Browser APIs
 * No external dependencies required
 * Limited functionality but lightweight
 */

/**
 * Simple video compression using Canvas API
 * Extracts frames and re-encodes at lower quality
 * Best for short clips (< 30 seconds)
 *
 * @param {File} file - Video file
 * @param {Object} options - Compression options
 * @returns {Promise<File>}
 */
export async function simpleCompressVideo(file, options = {}) {
  const {
    maxWidth = 1920,
    maxHeight = 1080,
    quality = 0.9,  // 0-1, lower = more compression (increased for better quality)
    fps = 30        // Lower FPS = smaller file (increased for smoother video)
  } = options

  return new Promise((resolve, reject) => {
    const video = document.createElement('video')
    const canvas = document.createElement('canvas')
    const ctx = canvas.getContext('2d')

    video.preload = 'metadata'
    video.muted = false  // Don't mute - we need audio!
    video.volume = 1.0

    video.onloadedmetadata = async () => {
      try {
        // Calculate dimensions
        const scale = Math.min(maxWidth / video.videoWidth, maxHeight / video.videoHeight, 1)
        canvas.width = video.videoWidth * scale
        canvas.height = video.videoHeight * scale

        devLog(`Compressing video: ${video.videoWidth}x${video.videoHeight} → ${canvas.width}x${canvas.height}`)

        // Capture video stream from canvas
        const videoStream = canvas.captureStream(fps)

        // Capture audio stream from video element
        let combinedStream
        try {
          const audioContext = new (window.AudioContext || window.webkitAudioContext)()
          const source = audioContext.createMediaElementSource(video)
          const dest = audioContext.createMediaStreamDestination()
          source.connect(dest)
          source.connect(audioContext.destination) // Also play audio (optional, but helps with timing)

          // Combine video and audio tracks
          combinedStream = new MediaStream([
            ...videoStream.getVideoTracks(),
            ...dest.stream.getAudioTracks()
          ])

          devLog('Video compression: Audio track included')
        } catch (audioError) {
          devWarn('Could not capture audio, using video-only stream:', audioError.message)
          combinedStream = videoStream
        }

        // Use MediaRecorder to re-encode with both video and audio
        const mediaRecorder = new MediaRecorder(combinedStream, {
          mimeType: 'video/webm;codecs=vp9,opus',
          videoBitsPerSecond: 3500000, // 3.5Mbps for good quality
          audioBitsPerSecond: 256000    // 256kbps for good audio quality
        })

        const chunks = []
        mediaRecorder.ondataavailable = (e) => chunks.push(e.data)

        mediaRecorder.onstop = () => {
          const blob = new Blob(chunks, { type: 'video/webm' })
          const compressedFile = new File([blob], file.name.replace(/\.[^.]+$/, '.webm'), {
            type: 'video/webm',
            lastModified: Date.now()
          })

          devLog(`Video compressed: ${(file.size / 1024 / 1024).toFixed(2)}MB → ${(blob.size / 1024 / 1024).toFixed(2)}MB`)
          resolve(compressedFile)
        }

        mediaRecorder.onerror = reject

        // Start recording and play video
        mediaRecorder.start()
        video.play()

        // Draw frames to canvas
        const drawFrame = () => {
          if (video.ended || video.paused) {
            mediaRecorder.stop()
            return
          }
          ctx.drawImage(video, 0, 0, canvas.width, canvas.height)
          requestAnimationFrame(drawFrame)
        }

        drawFrame()

      } catch (error) {
        reject(error)
      }
    }

    video.onerror = reject
    video.src = URL.createObjectURL(file)
  })
}

/**
 * Simple audio compression using MediaRecorder API
 * Re-encodes audio at lower bitrate
 *
 * @param {File} file - Audio file
 * @param {Object} options - Compression options
 * @returns {Promise<File>}
 */
export async function simpleCompressAudio(file, options = {}) {
  const {
    bitrate = 256000 // bits per second (256kbps for good quality, was 128kbps)
  } = options

  return new Promise((resolve, reject) => {
    const audio = new Audio()
    audio.preload = 'metadata'

    audio.onloadedmetadata = async () => {
      try {
        // Create audio context
        const audioContext = new (window.AudioContext || window.webkitAudioContext)()
        const source = audioContext.createMediaElementSource(audio)
        const dest = audioContext.createMediaStreamDestination()
        source.connect(dest)

        // Record with MediaRecorder
        const mediaRecorder = new MediaRecorder(dest.stream, {
          mimeType: 'audio/webm;codecs=opus',
          audioBitsPerSecond: bitrate
        })

        const chunks = []
        mediaRecorder.ondataavailable = (e) => chunks.push(e.data)

        mediaRecorder.onstop = () => {
          const blob = new Blob(chunks, { type: 'audio/webm' })
          const compressedFile = new File([blob], file.name.replace(/\.[^.]+$/, '.webm'), {
            type: 'audio/webm',
            lastModified: Date.now()
          })

          devLog(`Audio compressed: ${(file.size / 1024 / 1024).toFixed(2)}MB → ${(blob.size / 1024 / 1024).toFixed(2)}MB`)
          audioContext.close()
          resolve(compressedFile)
        }

        mediaRecorder.onerror = reject

        // Start recording and play audio
        mediaRecorder.start()
        audio.play()

        // Stop when audio ends
        audio.onended = () => {
          mediaRecorder.stop()
        }

      } catch (error) {
        reject(error)
      }
    }

    audio.onerror = reject
    audio.src = URL.createObjectURL(file)
  })
}

/**
 * Check if browser supports media compression
 * @returns {boolean}
 */
export function supportsMediaCompression() {
  return !!(window.MediaRecorder && window.AudioContext)
}

/**
 * Get supported video formats for compression
 * @returns {Array<string>}
 */
export function getSupportedVideoFormats() {
  const formats = [
    'video/webm;codecs=vp9',
    'video/webm;codecs=vp8',
    'video/webm',
    'video/mp4'
  ]

  return formats.filter(format => {
    try {
      return MediaRecorder.isTypeSupported(format)
    } catch {
      return false
    }
  })
}

/**
 * Get supported audio formats for compression
 * @returns {Array<string>}
 */
export function getSupportedAudioFormats() {
  const formats = [
    'audio/webm;codecs=opus',
    'audio/webm',
    'audio/mp4',
    'audio/ogg'
  ]

  return formats.filter(format => {
    try {
      return MediaRecorder.isTypeSupported(format)
    } catch {
      return false
    }
  })
}

/**
 * Estimate compressed file size (approximate)
 * @param {File} file - Original file
 * @param {string} type - 'video' or 'audio'
 * @param {number} quality - 0-1
 * @returns {number} Estimated size in bytes
 */
export function estimateCompressedSize(file, type, quality = 0.7) {
  if (type === 'video') {
    // Video compression is more effective
    return file.size * (0.2 + quality * 0.3) // 20-50% of original
  } else if (type === 'audio') {
    // Audio compression varies
    return file.size * (0.3 + quality * 0.4) // 30-70% of original
  }
  return file.size
}

/**
 * Simple smart compression decision
 * Only compress if file is larger than threshold
 *
 * @param {File} file - Media file
 * @param {number} thresholdMB - Size threshold in MB
 * @returns {Promise<File>}
 */
export async function simpleSmartCompress(file, thresholdMB = 10) {
  const fileSizeMB = file.size / 1024 / 1024

  if (fileSizeMB < thresholdMB) {
    devLog(`File ${file.name} is small (${fileSizeMB.toFixed(2)}MB), skipping compression`)
    return file
  }

  if (!supportsMediaCompression()) {
    devWarn('Browser does not support media compression, using original file')
    return file
  }

  try {
    if (file.type.startsWith('video/')) {
      return await simpleCompressVideo(file, { quality: 0.9, fps: 30 })
    } else if (file.type.startsWith('audio/')) {
      return await simpleCompressAudio(file, { bitrate: 256000 })
    }
    return file
  } catch (error) {
    devWarn('Compression failed, using original file:', error.message)
    return file
  }
}
