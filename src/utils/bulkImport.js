import * as XLSX from 'xlsx'
import JSZip from 'jszip'
import { S3UploadService } from './s3Upload'
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

        console.log(`📊 Parsed ${jsonData.length} questions from Excel`)
        resolve(jsonData)
      } catch (error) {
        console.error('Error parsing Excel:', error)
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
 * Extract files from ZIP archive
 * @param {File} zipFile - The ZIP file
 * @returns {Promise<Object>} - Object with xlsx and media files
 */
export const extractZipFile = async (zipFile) => {
  try {
    const zip = new JSZip()
    const zipData = await zip.loadAsync(zipFile)

    const result = {
      xlsx: null,
      media: {}
    }

    // Extract all files
    for (const [filename, file] of Object.entries(zipData.files)) {
      if (file.dir) continue // Skip directories

      // Get file extension
      const ext = filename.split('.').pop().toLowerCase()

      // Check if it's an Excel file
      if (ext === 'xlsx' || ext === 'xls') {
        const arrayBuffer = await file.async('arraybuffer')
        result.xlsx = new File([arrayBuffer], filename, {
          type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
        })
        console.log(`📄 Found Excel file: ${filename}`)
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
        console.log(`🎬 Found media file: ${justFilename} (${mimeType})`)
      }
    }

    console.log(`📦 Extracted: 1 Excel file, ${Object.keys(result.media).length} media files`)
    return result
  } catch (error) {
    console.error('Error extracting ZIP:', error)
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
      console.log(`🖼️ Processing image: ${file.name}`)
      const { blob } = await processQuestionImage(file)

      const extension = 'webp'
      const fileName = `${file.name.split('.')[0]}_${Date.now()}.${extension}`
      const processedFile = new File([blob], fileName, {
        type: 'image/webp',
        lastModified: Date.now(),
      })

      return await S3UploadService.uploadMedia(processedFile, folder)
    }

    // Upload audio/video directly
    return await S3UploadService.uploadMedia(file, folder)
  } catch (error) {
    console.error(`Error uploading ${file.name}:`, error)
    throw error
  }
}

/**
 * Process bulk questions from Excel data
 * @param {Array} excelData - Parsed Excel data
 * @param {Object} mediaFiles - Object with media files (filename -> File)
 * @param {Function} onProgress - Progress callback (current, total, message)
 * @returns {Promise<Array>} - Array of processed questions
 */
export const processBulkQuestions = async (excelData, mediaFiles = {}, onProgress = null) => {
  const questions = []
  const total = excelData.length

  for (let i = 0; i < excelData.length; i++) {
    const row = excelData[i]

    if (onProgress) {
      onProgress(i + 1, total, `جاري معالجة السؤال ${i + 1} من ${total}...`)
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

    // Process media files
    try {
      // Question Image
      const qImageFilename = row.Question_Image || row.question_image || row.صورة_السؤال
      if (qImageFilename && mediaFiles[qImageFilename]) {
        console.log(`📤 Uploading question image: ${qImageFilename}`)
        question.imageUrl = await uploadMediaFile(mediaFiles[qImageFilename], 'images/questions')
      }

      // Question Audio
      const qAudioFilename = row.Question_Audio || row.question_audio || row.صوت_السؤال
      if (qAudioFilename && mediaFiles[qAudioFilename]) {
        console.log(`📤 Uploading question audio: ${qAudioFilename}`)
        question.audioUrl = await uploadMediaFile(mediaFiles[qAudioFilename], 'audio')
      }

      // Question Video
      const qVideoFilename = row.Question_Video || row.question_video || row.فيديو_السؤال
      if (qVideoFilename && mediaFiles[qVideoFilename]) {
        console.log(`📤 Uploading question video: ${qVideoFilename}`)
        question.videoUrl = await uploadMediaFile(mediaFiles[qVideoFilename], 'video')
      }

      // Answer Image
      const aImageFilename = row.Answer_Image || row.answer_image || row.صورة_الإجابة
      if (aImageFilename && mediaFiles[aImageFilename]) {
        console.log(`📤 Uploading answer image: ${aImageFilename}`)
        question.answerImageUrl = await uploadMediaFile(mediaFiles[aImageFilename], 'images/questions')
      }

      // Answer Audio
      const aAudioFilename = row.Answer_Audio || row.answer_audio || row.صوت_الإجابة
      if (aAudioFilename && mediaFiles[aAudioFilename]) {
        console.log(`📤 Uploading answer audio: ${aAudioFilename}`)
        question.answerAudioUrl = await uploadMediaFile(mediaFiles[aAudioFilename], 'audio')
      }

      // Answer Video
      const aVideoFilename = row.Answer_Video || row.answer_video || row.فيديو_الإجابة
      if (aVideoFilename && mediaFiles[aVideoFilename]) {
        console.log(`📤 Uploading answer video: ${aVideoFilename}`)
        question.answerVideoUrl = await uploadMediaFile(mediaFiles[aVideoFilename], 'video')
      }
    } catch (error) {
      console.error(`Error uploading media for question ${i + 1}:`, error)
      // Continue with next question even if media upload fails
    }

    // Assign points based on difficulty
    question.points = getDifficultyPoints(question.difficulty)

    questions.push(question)
  }

  return questions
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
