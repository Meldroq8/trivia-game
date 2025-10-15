import { devLog, devWarn, prodError } from './devLog.js'
import { FFmpeg } from '@ffmpeg/ffmpeg'
import { fetchFile, toBlobURL } from '@ffmpeg/util'

/**
 * Media Processing Utilities
 * Compress and convert audio/video files before upload
 */

let ffmpegInstance = null
let ffmpegLoaded = false

/**
 * Load FFmpeg.wasm (lazy loading)
 * Only loads when first media file needs processing
 */
async function loadFFmpeg() {
  if (ffmpegLoaded) return ffmpegInstance

  try {
    devLog('Loading FFmpeg.wasm...')
    const ffmpeg = new FFmpeg()

    // Load FFmpeg core from CDN
    const baseURL = 'https://unpkg.com/@ffmpeg/core@0.12.6/dist/umd'
    await ffmpeg.load({
      coreURL: await toBlobURL(`${baseURL}/ffmpeg-core.js`, 'text/javascript'),
      wasmURL: await toBlobURL(`${baseURL}/ffmpeg-core.wasm`, 'application/wasm'),
    })

    // Log FFmpeg output for debugging
    ffmpeg.on('log', ({ message }) => {
      devLog('FFmpeg:', message)
    })

    // Track progress
    ffmpeg.on('progress', ({ progress, time }) => {
      devLog(`FFmpeg Progress: ${(progress * 100).toFixed(1)}% (${time}s)`)
    })

    ffmpegInstance = ffmpeg
    ffmpegLoaded = true
    devLog('FFmpeg loaded successfully')
    return ffmpeg
  } catch (error) {
    prodError('Failed to load FFmpeg:', error)
    throw new Error('Failed to initialize media processor. Please try again.')
  }
}

/**
 * Compress video file
 * @param {File} file - Original video file
 * @param {Object} options - Compression options
 * @returns {Promise<{blob: Blob, fileName: string, originalSize: number, compressedSize: number}>}
 */
export async function processVideo(file, options = {}) {
  const {
    maxWidth = 1280,          // Max width in pixels
    maxHeight = 720,          // Max height in pixels
    videoBitrate = '1000k',   // Video bitrate (lower = smaller file)
    audioBitrate = '128k',    // Audio bitrate
    fps = 30,                 // Frames per second
    format = 'mp4',           // Output format
  } = options

  try {
    devLog(`Processing video: ${file.name} (${(file.size / 1024 / 1024).toFixed(2)}MB)`)

    const ffmpeg = await loadFFmpeg()

    // Write input file to FFmpeg virtual filesystem
    const inputName = 'input.' + file.name.split('.').pop()
    const outputName = `output.${format}`

    await ffmpeg.writeFile(inputName, await fetchFile(file))

    // Run FFmpeg compression
    // -c:v libx264: Use H.264 codec for video
    // -crf 23: Quality (0-51, lower = better quality, 23 is default)
    // -preset fast: Encoding speed vs compression ratio
    // -c:a aac: Use AAC codec for audio
    await ffmpeg.exec([
      '-i', inputName,
      '-c:v', 'libx264',
      '-b:v', videoBitrate,
      '-vf', `scale='min(${maxWidth},iw)':'min(${maxHeight},ih)':force_original_aspect_ratio=decrease`,
      '-r', fps.toString(),
      '-c:a', 'aac',
      '-b:a', audioBitrate,
      '-preset', 'fast',
      '-movflags', '+faststart', // Enable streaming
      outputName
    ])

    // Read output file
    const data = await ffmpeg.readFile(outputName)
    const blob = new Blob([data.buffer], { type: `video/${format}` })

    // Clean up
    await ffmpeg.deleteFile(inputName)
    await ffmpeg.deleteFile(outputName)

    const compressedSize = blob.size
    const compressionRatio = ((1 - compressedSize / file.size) * 100).toFixed(1)

    devLog(`Video compressed: ${(file.size / 1024 / 1024).toFixed(2)}MB → ${(compressedSize / 1024 / 1024).toFixed(2)}MB (${compressionRatio}% reduction)`)

    return {
      blob,
      fileName: file.name.replace(/\.[^.]+$/, `.${format}`),
      originalSize: file.size,
      compressedSize,
      compressionRatio: parseFloat(compressionRatio)
    }
  } catch (error) {
    prodError('Video processing error:', error)
    throw new Error(`Failed to process video: ${error.message}`)
  }
}

/**
 * Compress audio file
 * @param {File} file - Original audio file
 * @param {Object} options - Compression options
 * @returns {Promise<{blob: Blob, fileName: string, originalSize: number, compressedSize: number}>}
 */
export async function processAudio(file, options = {}) {
  const {
    bitrate = '128k',    // Audio bitrate (64k, 128k, 192k, 256k)
    format = 'mp3',      // Output format (mp3, aac, ogg)
    sampleRate = 44100,  // Sample rate in Hz
  } = options

  try {
    devLog(`Processing audio: ${file.name} (${(file.size / 1024 / 1024).toFixed(2)}MB)`)

    const ffmpeg = await loadFFmpeg()

    // Write input file
    const inputName = 'input.' + file.name.split('.').pop()
    const outputName = `output.${format}`

    await ffmpeg.writeFile(inputName, await fetchFile(file))

    // Run FFmpeg compression
    const codecMap = {
      mp3: 'libmp3lame',
      aac: 'aac',
      ogg: 'libvorbis'
    }

    await ffmpeg.exec([
      '-i', inputName,
      '-c:a', codecMap[format] || 'libmp3lame',
      '-b:a', bitrate,
      '-ar', sampleRate.toString(),
      outputName
    ])

    // Read output file
    const data = await ffmpeg.readFile(outputName)
    const mimeTypes = {
      mp3: 'audio/mpeg',
      aac: 'audio/aac',
      ogg: 'audio/ogg'
    }
    const blob = new Blob([data.buffer], { type: mimeTypes[format] || 'audio/mpeg' })

    // Clean up
    await ffmpeg.deleteFile(inputName)
    await ffmpeg.deleteFile(outputName)

    const compressedSize = blob.size
    const compressionRatio = ((1 - compressedSize / file.size) * 100).toFixed(1)

    devLog(`Audio compressed: ${(file.size / 1024 / 1024).toFixed(2)}MB → ${(compressedSize / 1024 / 1024).toFixed(2)}MB (${compressionRatio}% reduction)`)

    return {
      blob,
      fileName: file.name.replace(/\.[^.]+$/, `.${format}`),
      originalSize: file.size,
      compressedSize,
      compressionRatio: parseFloat(compressionRatio)
    }
  } catch (error) {
    prodError('Audio processing error:', error)
    throw new Error(`Failed to process audio: ${error.message}`)
  }
}

/**
 * Process media file based on type
 * @param {File} file - Media file (audio or video)
 * @param {Object} options - Processing options
 * @returns {Promise<{blob: Blob, fileName: string}>}
 */
export async function processMedia(file, options = {}) {
  if (file.type.startsWith('video/')) {
    return processVideo(file, options)
  } else if (file.type.startsWith('audio/')) {
    return processAudio(file, options)
  } else {
    throw new Error(`Unsupported media type: ${file.type}`)
  }
}

/**
 * Simple size-based decision: compress only if file is large
 * @param {File} file - Media file
 * @param {number} thresholdMB - Size threshold in MB
 * @returns {Promise<File>} - Original or compressed file
 */
export async function smartCompressMedia(file, thresholdMB = 10) {
  const fileSizeMB = file.size / 1024 / 1024

  // Skip compression for small files
  if (fileSizeMB < thresholdMB) {
    devLog(`File ${file.name} is small (${fileSizeMB.toFixed(2)}MB), skipping compression`)
    return file
  }

  try {
    const { blob, fileName } = await processMedia(file)
    return new File([blob], fileName, {
      type: blob.type,
      lastModified: Date.now()
    })
  } catch (error) {
    devWarn('Compression failed, using original file:', error.message)
    return file
  }
}
