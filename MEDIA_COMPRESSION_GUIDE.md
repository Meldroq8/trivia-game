# Media Compression Guide

## Setup

### 1. Install Dependencies

```bash
npm install @ffmpeg/ffmpeg @ffmpeg/util
```

### 2. Import the Media Processor

```javascript
import { smartCompressMedia, processVideo, processAudio } from './utils/mediaProcessor'
```

## Usage Examples

### Option A: Smart Auto-Compression (Recommended)
Only compresses files larger than 10MB:

```javascript
// In bulkImport.js or any upload handler
const uploadMediaFile = async (file, folder) => {
  try {
    let processedFile = file

    // Auto-compress if file is too large
    if (file.type.startsWith('video/') || file.type.startsWith('audio/')) {
      processedFile = await smartCompressMedia(file, 10) // 10MB threshold
    }

    // Upload to S3
    return await S3UploadService.uploadMedia(processedFile, folder)
  } catch (error) {
    console.error(`Error uploading ${file.name}:`, error)
    throw error
  }
}
```

### Option B: Always Compress with Custom Options

```javascript
const uploadMediaFile = async (file, folder) => {
  try {
    let processedFile = file

    // Process video files
    if (file.type.startsWith('video/')) {
      const { blob, fileName } = await processVideo(file, {
        maxWidth: 1280,
        maxHeight: 720,
        videoBitrate: '1000k', // 1 Mbps
        audioBitrate: '128k',
        fps: 30,
        format: 'mp4'
      })
      processedFile = new File([blob], fileName, {
        type: 'video/mp4',
        lastModified: Date.now()
      })
    }

    // Process audio files
    else if (file.type.startsWith('audio/')) {
      const { blob, fileName } = await processAudio(file, {
        bitrate: '128k',  // Good quality for speech/music
        format: 'mp3',
        sampleRate: 44100
      })
      processedFile = new File([blob], fileName, {
        type: 'audio/mpeg',
        lastModified: Date.now()
      })
    }

    // Upload to S3
    return await S3UploadService.uploadMedia(processedFile, folder)
  } catch (error) {
    console.error(`Error uploading ${file.name}:`, error)
    throw error
  }
}
```

### Option C: Show Progress to User

```javascript
import { processVideo, processAudio } from './utils/mediaProcessor'

const handleVideoUpload = async (file) => {
  try {
    setUploadStatus('Processing video...')

    const result = await processVideo(file, {
      maxWidth: 1280,
      maxHeight: 720,
      videoBitrate: '800k'
    })

    setUploadStatus(`Compressed ${result.compressionRatio}% - Uploading...`)

    const processedFile = new File([result.blob], result.fileName, {
      type: result.blob.type,
      lastModified: Date.now()
    })

    const url = await S3UploadService.uploadMedia(processedFile, 'video')

    setUploadStatus('Upload complete!')
    return url
  } catch (error) {
    setUploadStatus('Upload failed')
    throw error
  }
}
```

## Compression Settings Guide

### Video Quality Presets

**High Quality (larger files, better quality):**
```javascript
{
  videoBitrate: '2000k',  // 2 Mbps
  audioBitrate: '192k',
  maxWidth: 1920,
  maxHeight: 1080,
  fps: 60
}
```

**Medium Quality (balanced):**
```javascript
{
  videoBitrate: '1000k',  // 1 Mbps
  audioBitrate: '128k',
  maxWidth: 1280,
  maxHeight: 720,
  fps: 30
}
```

**Low Quality (smallest files, for quick answers):**
```javascript
{
  videoBitrate: '500k',   // 500 Kbps
  audioBitrate: '64k',
  maxWidth: 854,
  maxHeight: 480,
  fps: 24
}
```

### Audio Quality Presets

**High Quality (music):**
```javascript
{
  bitrate: '256k',
  format: 'mp3',
  sampleRate: 48000
}
```

**Medium Quality (voice/sound effects):**
```javascript
{
  bitrate: '128k',
  format: 'mp3',
  sampleRate: 44100
}
```

**Low Quality (voice only):**
```javascript
{
  bitrate: '64k',
  format: 'mp3',
  sampleRate: 22050
}
```

## Alternative: Server-Side Compression

If client-side compression is too slow, you can process on the server:

### 1. Install on Firebase Functions

```bash
cd functions
npm install fluent-ffmpeg @ffmpeg-installer/ffmpeg
```

### 2. Update Firebase Function

```javascript
// functions/index.js
import ffmpegInstaller from '@ffmpeg-installer/ffmpeg'
import ffmpeg from 'fluent-ffmpeg'

ffmpeg.setFfmpegPath(ffmpegInstaller.path)

export const processVideo = onRequest(
  {
    cors: true,
    timeoutSeconds: 540, // 9 minutes max
    memory: '2GiB',
    secrets: [awsAccessKeyId, awsSecretAccessKey],
  },
  async (req, res) => {
    // ... auth code ...

    // Save uploaded file to /tmp
    const inputPath = '/tmp/input_' + Date.now()
    const outputPath = '/tmp/output_' + Date.now() + '.mp4'

    await fs.promises.writeFile(inputPath, fileData)

    // Process with FFmpeg
    await new Promise((resolve, reject) => {
      ffmpeg(inputPath)
        .videoBitrate('1000k')
        .size('1280x720')
        .audioBitrate('128k')
        .output(outputPath)
        .on('end', resolve)
        .on('error', reject)
        .run()
    })

    // Upload processed file to S3
    const processedData = await fs.promises.readFile(outputPath)
    // ... upload to S3 ...

    // Clean up
    await fs.promises.unlink(inputPath)
    await fs.promises.unlink(outputPath)
  }
)
```

## Performance Considerations

### Client-Side (FFmpeg.wasm)
- **Initial Load:** ~30MB download (cached after first use)
- **Processing Speed:** ~0.5x realtime (2min video = 4min processing)
- **Memory:** Uses browser's available RAM
- **Cost:** Free
- **Best for:** Files < 50MB, mobile-friendly

### Server-Side (Cloud Functions)
- **Processing Speed:** 2-5x realtime (2min video = 30sec processing)
- **Memory:** Limited by function config (512MB-8GB)
- **Timeout:** Max 9 minutes for gen2 functions
- **Cost:** Charged per GB-second of execution
- **Best for:** Large files, batch processing

## Recommended Approach for Trivia Game

1. **Images:** Client-side WebP conversion (current setup) ✅
2. **Audio:** Client-side compression with smartCompressMedia (10MB threshold)
3. **Video:** Client-side compression for files < 50MB, reject larger files
4. **Bulk Import:** Show progress bar during compression

### Why Client-Side?
- No server costs
- Faster perceived upload (compression + upload overlaps)
- Works offline after FFmpeg loaded
- User sees immediate feedback

### Example: Add to bulkImport.js

```javascript
import { smartCompressMedia } from './mediaProcessor'

const uploadMediaFile = async (file, folder, onProgress) => {
  try {
    // Show compression progress
    if (file.type.startsWith('video/') || file.type.startsWith('audio/')) {
      onProgress?.({ status: 'compressing', file: file.name })
      file = await smartCompressMedia(file, 10)
    }

    // Upload
    onProgress?.({ status: 'uploading', file: file.name })
    return await S3UploadService.uploadMedia(file, folder)
  } catch (error) {
    console.error('Upload error:', error)
    throw error
  }
}
```
