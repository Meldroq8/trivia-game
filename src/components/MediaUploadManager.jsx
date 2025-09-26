import { useState } from 'react'
import { useAuth } from '../hooks/useAuth'

const MediaUploadManager = () => {
  const { user, isAuthenticated } = useAuth()
  const [uploadType, setUploadType] = useState('categories')
  const [uploadStatus, setUploadStatus] = useState('')
  const [isUploading, setIsUploading] = useState(false)

  const handleFileUpload = async (event) => {
    const files = Array.from(event.target.files)
    if (!files.length) return

    setIsUploading(true)
    setUploadStatus('Preparing files for GitHub...')

    try {
      // For now, just show instructions since we need GitHub integration
      const fileList = files.map(f => f.name).join(', ')
      setUploadStatus(`Ready to upload ${files.length} file(s): ${fileList}`)

      // TODO: Implement GitHub API integration for direct uploads
      setUploadStatus('⚠️ Manual Upload Required: Please add these files to the GitHub repository manually in the uploads/' + uploadType + '/ folder, then commit and push to trigger auto-deployment.')

    } catch (error) {
      setUploadStatus(`❌ Error: ${error.message}`)
    } finally {
      setIsUploading(false)
      event.target.value = ''
    }
  }

  if (!isAuthenticated) {
    return (
      <div className="p-6 bg-gray-100 rounded-lg">
        <h3 className="text-lg font-semibold text-gray-700 mb-4">Media Upload Manager</h3>
        <p className="text-gray-600">Please log in to access the media upload interface.</p>
      </div>
    )
  }

  return (
    <div className="p-6 bg-white rounded-lg shadow-lg">
      <h3 className="text-xl font-bold text-gray-800 mb-6">📁 Media Upload Manager</h3>

      <div className="mb-6">
        <label className="block text-sm font-medium text-gray-700 mb-2">
          Upload Type:
        </label>
        <select
          value={uploadType}
          onChange={(e) => setUploadType(e.target.value)}
          className="w-full p-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
        >
          <option value="categories">Category Images</option>
          <option value="questions">Question Images</option>
          <option value="audio">Audio Files</option>
          <option value="video">Video Files</option>
        </select>
      </div>

      <div className="mb-6">
        <label className="block text-sm font-medium text-gray-700 mb-2">
          Select Files:
        </label>
        <input
          type="file"
          multiple
          accept={
            uploadType === 'audio' ? 'audio/*' :
            uploadType === 'video' ? 'video/*' :
            'image/*'
          }
          onChange={handleFileUpload}
          disabled={isUploading}
          className="w-full p-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500 file:mr-4 file:py-2 file:px-4 file:rounded-md file:border-0 file:text-sm file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100"
        />
      </div>

      {uploadStatus && (
        <div className={`p-4 rounded-md mb-4 ${
          uploadStatus.includes('❌') ? 'bg-red-50 text-red-700' :
          uploadStatus.includes('⚠️') ? 'bg-yellow-50 text-yellow-700' :
          uploadStatus.includes('✅') ? 'bg-green-50 text-green-700' :
          'bg-blue-50 text-blue-700'
        }`}>
          {uploadStatus}
        </div>
      )}

      <div className="bg-gray-50 p-4 rounded-md">
        <h4 className="font-semibold text-gray-700 mb-3">📋 Hybrid Upload Process:</h4>

        <div className="mb-4">
          <h5 className="font-semibold text-green-700 mb-2">🔥 Method 1: Firebase Upload (Recommended)</h5>
          <ol className="list-decimal list-inside text-sm text-gray-600 space-y-1 mb-3">
            <li>Upload images using existing admin panels (Categories/Questions)</li>
            <li>Images go to Firebase Storage automatically</li>
            <li>Trigger GitHub sync: <strong>Actions → "Sync Firebase Images" → Run workflow</strong></li>
            <li>Images get processed and optimized (multiple sizes, webp format)</li>
            <li>App automatically uses optimized local versions (90% faster!)</li>
          </ol>
        </div>

        <div className="mb-4">
          <h5 className="font-semibold text-blue-700 mb-2">📁 Method 2: Manual GitHub Upload</h5>
          <ol className="list-decimal list-inside text-sm text-gray-600 space-y-1">
            <li>Add files to <code>uploads/{uploadType}/</code> in your repository</li>
            <li>Commit and push changes to GitHub</li>
            <li>GitHub Actions processes and optimizes images automatically</li>
            <li>App deploys with optimized images</li>
          </ol>
        </div>

        <div className="bg-green-50 p-3 rounded-md">
          <h5 className="font-semibold text-green-800 mb-1">⚡ Auto-Optimization Features:</h5>
          <ul className="list-disc list-inside text-sm text-green-700 space-y-1">
            <li><strong>Multiple sizes:</strong> thumb (150px), medium (400px), large (800px)</li>
            <li><strong>Format conversion:</strong> All images converted to WebP (smaller files)</li>
            <li><strong>Quality optimization:</strong> 90% smaller with same visual quality</li>
            <li><strong>Smart loading:</strong> App picks best size for each context</li>
          </ul>
        </div>
      </div>

      <div className="mt-4 bg-blue-50 p-4 rounded-md">
        <h4 className="font-semibold text-blue-700 mb-2">🔮 Coming Soon:</h4>
        <p className="text-sm text-blue-600">Direct GitHub integration for seamless uploads through this interface.</p>
      </div>
    </div>
  )
}

export default MediaUploadManager