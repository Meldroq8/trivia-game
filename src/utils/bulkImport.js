import { devLog, devWarn, prodError } from "./devLog.js"
import * as XLSX from 'xlsx'
import JSZip from 'jszip'
import { S3UploadServiceSecure as S3UploadService } from './s3UploadSecure'
import { processQuestionImage } from './imageProcessor'

/**
 * Parse Excel file and extract questions
 * @param {File} file - The XLSX file
 * @returns {Promise<Array>} - Array of question objects
 */
export const parseExcelFile = async (file) => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()

    reader.onload = (e) => {
      try {
        const data = new Uint8Array(e.target.result)
        const workbook = XLSX.read(data, { type: 'array' })

        // Get first sheet
        const sheetName = workbook.SheetNames[0]
        const worksheet = workbook.Sheets[sheetName]

        // Convert to JSON
        const jsonData = XLSX.utils.sheet_to_json(worksheet)

        devLog(`📊 Parsed ${jsonData.length} questions from Excel`)
        resolve(jsonData)
      } catch (error) {
        prodError('Error parsing Excel:', error)
        reject(new Error('فشل في قراءة ملف Excel: ' + error.message))
      }
    }

    reader.onerror = () => {
      reject(new Error('فشل في قراءة الملف'))
    }

    reader.readAsArrayBuffer(file)
  })
}

/**
 * Extract files from ZIP archive with memory optimization
 * @param {File} zipFile - The ZIP file
 * @param {Function} onProgress - Progress callback
 * @returns {Promise<Object>} - Object with xlsx and media files
 */
export const extractZipFile = async (zipFile, onProgress = null) => {
  try {
    if (onProgress) onProgress(0, 100, 'جاري تحميل الملف المضغوط...')

    // Validate file object
    if (!zipFile) {
      throw new Error('لم يتم تحديد ملف')
    }

    const fileSizeMB = (zipFile.size / (1024 * 1024)).toFixed(2)
    devLog(`📦 ZIP file info: name=${zipFile.name}, size=${fileSizeMB}MB, type=${zipFile.type}`)

    // Check if file is still readable
    if (zipFile.size === 0) {
      throw new Error('الملف فارغ أو غير قابل للقراءة')
    }

    // Warn if file is very large (> 500MB)
    if (zipFile.size > 500 * 1024 * 1024) {
      devLog(`⚠️ Large file detected (${fileSizeMB}MB). Using streaming approach...`)
      if (onProgress) onProgress(0, 100, `ملف كبير (${fileSizeMB}MB) - جاري القراءة...`)
    }

    // For very large files (> 1GB), warn user
    if (zipFile.size > 1024 * 1024 * 1024) {
      devWarn(`⚠️ File is over 1GB. This may take a while or fail due to browser memory limits.`)
    }

    // Files over 2GB will likely fail in most browsers
    if (zipFile.size > 2 * 1024 * 1024 * 1024) {
      throw new Error(`الملف كبير جداً (${fileSizeMB}MB). الحد الأقصى للمتصفح حوالي 2GB. يرجى تقسيم الملف إلى أجزاء أصغر.`)
    }

    // Try streaming approach first for large files
    let arrayBuffer
    try {
      // Use stream() for more reliable large file reading
      if (zipFile.size > 100 * 1024 * 1024 && zipFile.stream) {
        devLog('📦 Using stream API for large file...')
        const reader = zipFile.stream().getReader()
        const chunks = []
        let receivedLength = 0

        while (true) {
          const { done, value } = await reader.read()
          if (done) break

          chunks.push(value)
          receivedLength += value.length

          // Update progress
          const progressPercent = Math.floor((receivedLength / zipFile.size) * 5)
          if (onProgress) onProgress(progressPercent, 100, `جاري قراءة الملف... ${Math.floor(receivedLength / (1024 * 1024))}MB / ${fileSizeMB}MB`)
        }

        // Combine chunks into single ArrayBuffer
        arrayBuffer = new Uint8Array(receivedLength)
        let position = 0
        for (const chunk of chunks) {
          arrayBuffer.set(chunk, position)
          position += chunk.length
        }
        arrayBuffer = arrayBuffer.buffer
      } else {
        // For smaller files, use arrayBuffer() directly
        arrayBuffer = await zipFile.arrayBuffer()
      }
    } catch (streamError) {
      devLog('Stream/arrayBuffer() failed, trying FileReader...', streamError)
      // Fallback to FileReader with progress
      arrayBuffer = await new Promise((resolve, reject) => {
        const reader = new FileReader()
        reader.onload = () => resolve(reader.result)
        reader.onprogress = (e) => {
          if (e.lengthComputable && onProgress) {
            const progressPercent = Math.floor((e.loaded / e.total) * 5)
            onProgress(progressPercent, 100, `جاري قراءة الملف... ${Math.floor(e.loaded / (1024 * 1024))}MB / ${fileSizeMB}MB`)
          }
        }
        reader.onerror = (e) => {
          prodError('FileReader error:', e)
          reject(new Error(`فشل في قراءة الملف (${fileSizeMB}MB) - الملف كبير جداً أو حاول مرة أخرى`))
        }
        reader.readAsArrayBuffer(zipFile)
      })
    }

    devLog(`📦 Read ${(arrayBuffer.byteLength / (1024 * 1024)).toFixed(2)}MB from ZIP`)

    if (onProgress) onProgress(5, 100, 'جاري فك الضغط...')

    const zip = new JSZip()
    const zipData = await zip.loadAsync(arrayBuffer, {
      // Process files one by one instead of loading all at once
      createFolders: false
    })

    const result = {
      xlsx: null,
      media: {}
    }

    const files = Object.entries(zipData.files)
    const totalFiles = files.length
    let processedFiles = 0

    // Extract all files one by one to reduce memory usage
    for (const [filename, file] of files) {
      if (file.dir) continue // Skip directories

      processedFiles++
      const progress = Math.floor((processedFiles / totalFiles) * 50) // 0-50%
      if (onProgress) onProgress(progress, 100, `فك ضغط الملفات... (${processedFiles}/${totalFiles})`)

      // Get file extension
      const ext = filename.split('.').pop().toLowerCase()

      // Check if it's an Excel file
      if (ext === 'xlsx' || ext === 'xls') {
        const arrayBuffer = await file.async('arraybuffer')
        result.xlsx = new File([arrayBuffer], filename, {
          type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
        })
        devLog(`📄 Found Excel file: ${filename}`)
      }
      // Check if it's a media file
      else if (['jpg', 'jpeg', 'png', 'gif', 'webp', 'mp3', 'wav', 'ogg', 'mp4', 'webm', 'mov'].includes(ext)) {
        const blob = await file.async('blob')

        // Determine mime type
        let mimeType = 'application/octet-stream'
        if (['jpg', 'jpeg'].includes(ext)) mimeType = 'image/jpeg'
        else if (ext === 'png') mimeType = 'image/png'
        else if (ext === 'gif') mimeType = 'image/gif'
        else if (ext === 'webp') mimeType = 'image/webp'
        else if (ext === 'mp3') mimeType = 'audio/mpeg'
        else if (ext === 'wav') mimeType = 'audio/wav'
        else if (ext === 'ogg') mimeType = 'audio/ogg'
        else if (ext === 'mp4') mimeType = 'video/mp4'
        else if (ext === 'webm') mimeType = 'video/webm'
        else if (ext === 'mov') mimeType = 'video/quicktime'

        const mediaFile = new File([blob], filename, { type: mimeType })

        // Store with just the filename (no path)
        const justFilename = filename.split('/').pop().split('\\').pop()
        result.media[justFilename] = mediaFile
        devLog(`🎬 Found media file: ${justFilename} (${mimeType})`)
      }
    }

    if (onProgress) onProgress(50, 100, 'تم فك الضغط بنجاح!')
    devLog(`📦 Extracted: 1 Excel file, ${Object.keys(result.media).length} media files`)
    return result
  } catch (error) {
    prodError('Error extracting ZIP:', error)
    throw new Error('فشل في فك ضغط الملف: ' + error.message)
  }
}

/**
 * Upload media file and return CloudFront URL
 * @param {File} file - The media file
 * @param {string} folder - S3 folder path
 * @returns {Promise<string>} - CloudFront URL
 */
const uploadMediaFile = async (file, folder) => {
  try {
    // Process images before upload
    if (file.type.startsWith('image/')) {
      devLog(`🖼️ Processing image: ${file.name}`)
      const { blob } = await processQuestionImage(file)

      const extension = 'webp'
      const fileName = `${file.name.split('.')[0]}_${Date.now()}.${extension}`
      const processedFile = new File([blob], fileName, {
        type: 'image/webp',
        lastModified: Date.now(),
      })

      return await S3UploadService.uploadMedia(processedFile, folder)
    }

    // Upload audio/video with unique filename (compression handled automatically by S3UploadService)
    const extension = file.name.split('.').pop()
    const baseName = file.name.split('.')[0]
    const uniqueFileName = `${baseName}_${Date.now()}.${extension}`
    const renamedFile = new File([file], uniqueFileName, {
      type: file.type,
      lastModified: Date.now(),
    })

    return await S3UploadService.uploadMedia(renamedFile, folder)
  } catch (error) {
    prodError(`Error uploading ${file.name}:`, error)
    throw error
  }
}

/**
 * Process bulk questions from Excel data with batching
 * @param {Array} excelData - Parsed Excel data
 * @param {Object} mediaFiles - Object with media files (filename -> File)
 * @param {Function} onProgress - Progress callback (current, total, message)
 * @returns {Promise<Array>} - Array of processed questions
 */
export const processBulkQuestions = async (excelData, mediaFiles = {}, onProgress = null) => {
  const questions = []
  const missingMediaFiles = [] // Track files referenced in XLSX but not found in ZIP
  const total = excelData.length
  const BATCH_SIZE = 10 // Process 10 questions at a time

  // Debug: Log first row column names
  if (excelData.length > 0) {
    devLog('📋 Excel column names found:', Object.keys(excelData[0]))
    devLog('📋 First row data:', excelData[0])
  }

  for (let i = 0; i < excelData.length; i++) {
    const row = excelData[i]

    // Debug: Log Answer_Image2 lookup for first few rows
    if (i < 3) {
      devLog(`📋 Row ${i} - Answer_Image2 lookup:`, {
        'Answer_Image2': row.Answer_Image2,
        'answer_image2': row.answer_image2,
        'صورة_الإجابة2': row.صورة_الإجابة2,
        'Answer_Image_2': row['Answer_Image_2'],
      })
    }

    // Progress: 50% base + 50% for processing
    const progressPercent = 50 + Math.floor(((i + 1) / total) * 50)
    if (onProgress) {
      onProgress(progressPercent, 100, `جاري معالجة السؤال ${i + 1} من ${total}...`)
    }

    // Add a small delay every BATCH_SIZE questions to prevent memory issues
    if (i > 0 && i % BATCH_SIZE === 0) {
      await new Promise(resolve => setTimeout(resolve, 100))
      devLog(`✅ Processed batch: ${i - BATCH_SIZE + 1}-${i}`)
    }

    const question = {
      text: row.Question || row.question || row.السؤال || '',
      answer: row.Answer || row.answer || row.الإجابة || '',
      difficulty: mapDifficulty(row.Difficulty || row.difficulty || row.الصعوبة || 'متوسط'),
      type: 'text'
    }

    // Add wrong options if available
    const wrongOptions = []
    for (let j = 1; j <= 3; j++) {
      const wrongKey = `Wrong_${j}` || `wrong_${j}` || `خطأ_${j}`
      if (row[wrongKey] || row[`Wrong${j}`] || row[`خطأ${j}`]) {
        wrongOptions.push(row[wrongKey] || row[`Wrong${j}`] || row[`خطأ${j}`])
      }
    }
    if (wrongOptions.length > 0) {
      question.options = wrongOptions
    }

    // Process media files individually with error handling for each
    const failedUploads = []
    const questionMissingMedia = [] // Track missing media for this question

    // Question Image
    const qImageFilename = row.Question_Image || row.question_image || row.صورة_السؤال
    if (qImageFilename) {
      if (mediaFiles[qImageFilename]) {
        try {
          devLog(`📤 Uploading question image: ${qImageFilename}`)
          question.imageUrl = await uploadMediaFile(mediaFiles[qImageFilename], 'images/questions')
        } catch (error) {
          devWarn(`⚠️ Failed to upload question image ${qImageFilename}:`, error.message)
          failedUploads.push(`صورة السؤال: ${qImageFilename} (${error.message})`)
        }
      } else {
        questionMissingMedia.push({ type: 'صورة السؤال', filename: qImageFilename })
      }
    }

    // Question Audio
    const qAudioFilename = row.Question_Audio || row.question_audio || row.صوت_السؤال
    if (qAudioFilename) {
      if (mediaFiles[qAudioFilename]) {
        try {
          devLog(`📤 Uploading question audio: ${qAudioFilename}`)
          question.audioUrl = await uploadMediaFile(mediaFiles[qAudioFilename], 'audio')
        } catch (error) {
          devWarn(`⚠️ Failed to upload question audio ${qAudioFilename}:`, error.message)
          failedUploads.push(`صوت السؤال: ${qAudioFilename} (${error.message})`)
        }
      } else {
        questionMissingMedia.push({ type: 'صوت السؤال', filename: qAudioFilename })
      }
    }

    // Question Video
    const qVideoFilename = row.Question_Video || row.question_video || row.فيديو_السؤال
    if (qVideoFilename) {
      if (mediaFiles[qVideoFilename]) {
        try {
          devLog(`📤 Uploading question video: ${qVideoFilename}`)
          question.videoUrl = await uploadMediaFile(mediaFiles[qVideoFilename], 'video')
          devLog(`✅ Question video uploaded successfully: ${question.videoUrl}`)
        } catch (error) {
          devWarn(`⚠️ Failed to upload question video ${qVideoFilename}:`, error.message)
          failedUploads.push(`فيديو السؤال: ${qVideoFilename} (${error.message})`)
        }
      } else {
        questionMissingMedia.push({ type: 'فيديو السؤال', filename: qVideoFilename })
      }
    }

    // Answer Image
    const aImageFilename = row.Answer_Image || row.answer_image || row.صورة_الإجابة
    if (aImageFilename) {
      if (mediaFiles[aImageFilename]) {
        try {
          devLog(`📤 Uploading answer image: ${aImageFilename}`)
          question.answerImageUrl = await uploadMediaFile(mediaFiles[aImageFilename], 'images/questions')
        } catch (error) {
          devWarn(`⚠️ Failed to upload answer image ${aImageFilename}:`, error.message)
          failedUploads.push(`صورة الإجابة: ${aImageFilename} (${error.message})`)
        }
      } else {
        questionMissingMedia.push({ type: 'صورة الإجابة', filename: aImageFilename })
      }
    }

    // Answer 2 (for headband mini-game)
    const answer2 = row.Answer2 || row.answer2 || row.الإجابة2 || row['Answer 2'] || ''
    if (answer2) {
      question.answer2 = answer2
    }

    // Answer Image 2 (for headband mini-game)
    const aImage2Filename = row.Answer_Image2 || row.answer_image2 || row.صورة_الإجابة2 || row['Answer_Image_2']
    if (aImage2Filename) {
      if (mediaFiles[aImage2Filename]) {
        try {
          devLog(`📤 Uploading answer image 2: ${aImage2Filename}`)
          question.answerImageUrl2 = await uploadMediaFile(mediaFiles[aImage2Filename], 'images/questions')
        } catch (error) {
          devWarn(`⚠️ Failed to upload answer image 2 ${aImage2Filename}:`, error.message)
          failedUploads.push(`صورة الإجابة 2: ${aImage2Filename} (${error.message})`)
        }
      } else {
        questionMissingMedia.push({ type: 'صورة الإجابة 2', filename: aImage2Filename })
      }
    }

    // Answer Audio
    const aAudioFilename = row.Answer_Audio || row.answer_audio || row.صوت_الإجابة
    if (aAudioFilename) {
      if (mediaFiles[aAudioFilename]) {
        try {
          devLog(`📤 Uploading answer audio: ${aAudioFilename}`)
          question.answerAudioUrl = await uploadMediaFile(mediaFiles[aAudioFilename], 'audio')
        } catch (error) {
          devWarn(`⚠️ Failed to upload answer audio ${aAudioFilename}:`, error.message)
          failedUploads.push(`صوت الإجابة: ${aAudioFilename} (${error.message})`)
        }
      } else {
        questionMissingMedia.push({ type: 'صوت الإجابة', filename: aAudioFilename })
      }
    }

    // Answer Video
    const aVideoFilename = row.Answer_Video || row.answer_video || row.فيديو_الإجابة
    if (aVideoFilename) {
      if (mediaFiles[aVideoFilename]) {
        try {
          devLog(`📤 Uploading answer video: ${aVideoFilename}`)
          question.answerVideoUrl = await uploadMediaFile(mediaFiles[aVideoFilename], 'video')
          devLog(`✅ Answer video uploaded successfully: ${question.answerVideoUrl}`)
        } catch (error) {
          devWarn(`⚠️ Failed to upload answer video ${aVideoFilename}:`, error.message)
          failedUploads.push(`فيديو الإجابة: ${aVideoFilename} (${error.message})`)
        }
      } else {
        questionMissingMedia.push({ type: 'فيديو الإجابة', filename: aVideoFilename })
      }
    }

    // Track missing media for this question
    if (questionMissingMedia.length > 0) {
      missingMediaFiles.push({
        questionNumber: i + 1,
        questionText: question.text?.substring(0, 50) + '...',
        missingFiles: questionMissingMedia
      })
      devWarn(`⚠️ Question ${i + 1} has ${questionMissingMedia.length} missing media files:`, questionMissingMedia)
    }

    // Log any failed uploads for this question
    if (failedUploads.length > 0) {
      devWarn(`⚠️ Question ${i + 1} had ${failedUploads.length} failed media uploads:`, failedUploads)
    }

    // Assign points based on difficulty
    question.points = getDifficultyPoints(question.difficulty)

    questions.push(question)
  }

  // Log summary of missing media files
  if (missingMediaFiles.length > 0) {
    devWarn(`📋 Total questions with missing media: ${missingMediaFiles.length}`)
    devLog('Missing media summary:', missingMediaFiles)
  }

  return { questions, missingMediaFiles }
}

/**
 * Map difficulty from Excel to standard format
 */
const mapDifficulty = (difficulty) => {
  const normalized = (difficulty || '').toString().toLowerCase().trim()

  if (normalized.includes('سهل') || normalized === 'easy') return 'easy'
  if (normalized.includes('صعب') || normalized === 'hard') return 'hard'
  return 'medium'
}

/**
 * Get points based on difficulty
 */
const getDifficultyPoints = (difficulty) => {
  switch (difficulty) {
    case 'easy': return 200
    case 'hard': return 600
    default: return 400
  }
}
