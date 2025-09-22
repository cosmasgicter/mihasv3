import React, { useState } from 'react'
import { Button } from '@/components/ui/Button'
import { Upload, CheckCircle, AlertCircle, X } from 'lucide-react'
import { uploadApplicationFile, validateApplicationFile } from '@/lib/storage'
import { useAuth } from '@/contexts/AuthContext'

interface UploadedFile {
  id: string
  name: string
  size: number
  url: string
}

export function FileUploadTest() {
  const { user } = useAuth()
  const [files, setFiles] = useState<UploadedFile[]>([])
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState('')
  const [progress, setProgress] = useState(0)

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file || !user) return

    // Validate file
    const validation = validateApplicationFile(file)
    if (!validation.valid) {
      setError(validation.error || 'Invalid file')
      event.target.value = ''
      return
    }

    setError('')
    setUploading(true)
    setProgress(0)

    // Simulate progress
    const progressInterval = setInterval(() => {
      setProgress(prev => {
        if (prev < 90) return prev + 10
        return prev
      })
    }, 200)

    try {
      const result = await uploadApplicationFile(
        file, 
        user.id, 
        'test-app-' + Date.now(), 
        'test-upload'
      )
      
      if (result.success && result.url) {
        setProgress(100)
        const uploadedFile: UploadedFile = {
          id: Date.now().toString(),
          name: file.name,
          size: file.size,
          url: result.url
        }
        
        setFiles(prev => [...prev, uploadedFile])
      } else {
        setError(result.error || 'Upload failed')
      }
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Upload failed')
    } finally {
      clearInterval(progressInterval)
      setUploading(false)
      setProgress(0)
      event.target.value = ''
    }
  }

  const removeFile = (id: string) => {
    setFiles(prev => prev.filter(f => f.id !== id))
  }

  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return '0 Bytes'
    const k = 1024
    const sizes = ['Bytes', 'KB', 'MB', 'GB']
    const i = Math.floor(Math.log(bytes) / Math.log(k))
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i]
  }

  return (
    <div className="max-w-md mx-auto p-6 bg-white rounded-lg shadow">
      <h2 className="text-lg font-semibold mb-4">File Upload Test</h2>
      
      <div className="mb-4">
        <label className="block">
          <input
            type="file"
            accept=".pdf,.jpg,.jpeg,.png"
            onChange={handleFileUpload}
            className="hidden"
            disabled={uploading}
          />
          <div className={`border-2 border-dashed rounded-lg p-6 text-center transition-all duration-200 ${
            uploading 
              ? 'border-gray-200 bg-gray-50 cursor-not-allowed' 
              : 'border-gray-300 hover:border-blue-400 hover:bg-blue-50 cursor-pointer'
          }`}>
            <Upload className={`h-8 w-8 mx-auto mb-2 ${
              uploading ? 'text-gray-400' : 'text-gray-600'
            }`} />
            <p className={`text-sm ${
              uploading ? 'text-gray-400' : 'text-gray-600'
            }`}>
              {uploading ? 'Uploading...' : 'Click to upload file'}
            </p>
            <p className={`text-xs ${
              uploading ? 'text-gray-400' : 'text-gray-500'
            }`}>
              PDF, JPG, JPEG, PNG up to 10MB
            </p>
          </div>
        </label>
        
        {error && (
          <div className="mt-2 p-3 bg-red-50 border border-red-200 rounded-lg">
            <div className="flex items-center text-sm text-red-700">
              <AlertCircle className="h-4 w-4 mr-2 flex-shrink-0" />
              <span>{error}</span>
            </div>
          </div>
        )}
      </div>

      {uploading && (
        <div className="mb-4">
          <div className="flex justify-between text-sm text-gray-600 mb-1">
            <span>Uploading...</span>
            <span>{progress}%</span>
          </div>
          <div className="w-full bg-gray-200 rounded-full h-2">
            <div 
              className="bg-blue-600 h-2 rounded-full transition-all duration-300"
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>
      )}

      {files.length > 0 && (
        <div className="space-y-2">
          <h3 className="text-sm font-medium text-gray-700 mb-2">
            Uploaded Files ({files.length})
          </h3>
          {files.map((file) => (
            <div 
              key={file.id} 
              className="bg-green-50 border border-green-200 rounded-lg p-3"
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-3">
                  <CheckCircle className="h-5 w-5 text-green-600" />
                  <div>
                    <p className="text-sm font-medium text-green-800">{file.name}</p>
                    <p className="text-xs text-green-600">{formatFileSize(file.size)}</p>
                  </div>
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => removeFile(file.id)}
                  className="text-red-600 hover:text-red-700 hover:bg-red-50"
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}