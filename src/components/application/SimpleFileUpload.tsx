import React, { useState, useCallback } from 'react'
import { Button } from '@/components/ui/Button'
import { LoadingButton } from '@/components/ui/LoadingButton'
import { ProgressBar } from '@/components/ui/ProgressIndicator'
import { Upload, X, FileText, CheckCircle, AlertCircle, ImageIcon, Zap } from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import { uploadApplicationFile, validateApplicationFile, type UploadResult } from '@/lib/storage'
import { useAuth } from '@/contexts/AuthContext'
import { useImageCompression } from '@/hooks/useImageCompression'
import { formatFileSize, createUserFriendlyError } from '@/lib/utils'
import { cn } from '@/lib/utils'

interface UploadedFile {
  id: string
  name: string
  size: number
  url?: string
  type?: string
  compressed?: boolean
  originalSize?: number
  path?: string
}

interface SimpleFileUploadProps {
  uploadedFiles: UploadedFile[]
  uploadingFiles: string[]
  uploadProgress: {[key: string]: number}
  onFileUpload?: (
    file: File,
    context: {
      applicationId?: string
      userId?: string | null
      fileType: string
    }
  ) => Promise<UploadResult>
  onRemoveFile: (fileId: string) => void
  error?: string
  applicationId?: string
  fileType?: string
  onUploadComplete?: (file: UploadedFile) => void
  maxFileSize?: number
  acceptedTypes?: string[]
  enableCompression?: boolean
  showCompressionStats?: boolean
}

export function SimpleFileUpload({ 
  uploadedFiles, 
  uploadingFiles, 
  uploadProgress, 
  onFileUpload,
  onRemoveFile, 
  error,
  applicationId,
  fileType = 'document',
  onUploadComplete,
  maxFileSize = 10 * 1024 * 1024, // 10MB default
  acceptedTypes = ['.pdf', '.jpg', '.jpeg', '.png'],
  enableCompression = true,
  showCompressionStats = true
}: SimpleFileUploadProps) {
  const { user } = useAuth()
  const [localError, setLocalError] = useState<string>('')
  const [isUploading, setIsUploading] = useState(false)
  const [uploadStats, setUploadStats] = useState<{progress: number, speed: number, eta: number}>({
    progress: 0,
    speed: 0,
    eta: 0
  })
  const [dragActive, setDragActive] = useState(false)
  
  const { 
    compressFile, 
    isCompressing, 
    compressionResults,
    clearResults 
  } = useImageCompression({ 
    maxWidth: 1920, 
    maxHeight: 1080, 
    quality: 0.8,
    autoCompress: enableCompression 
  })

  const validateFile = useCallback((file: File): { valid: boolean; error?: string } => {
    // Check file size
    if (file.size > maxFileSize) {
      return {
        valid: false,
        error: `File size (${formatFileSize(file.size)}) exceeds maximum allowed size (${formatFileSize(maxFileSize)})`
      }
    }

    // Check file type
    const fileExtension = '.' + file.name.split('.').pop()?.toLowerCase()
    if (!acceptedTypes.includes(fileExtension)) {
      return {
        valid: false,
        error: `File type ${fileExtension} is not supported. Allowed types: ${acceptedTypes.join(', ')}`
      }
    }

    return { valid: true }
  }, [maxFileSize, acceptedTypes])

  const handleFileUpload = useCallback(async (files: File[]) => {
    if (!user || !applicationId) {
      setLocalError('User authentication required')
      return
    }

    setLocalError('')
    setIsUploading(true)

    try {
      const processedFiles: Array<{
        originalFile: File
        fileToUpload: File
        compressed: boolean
        originalSize: number
      }> = []

      for (const file of files) {
        const validation = validateFile(file)
        if (!validation.valid) {
          setLocalError(validation.error || 'Invalid file')
          continue
        }

        const storageValidation = validateApplicationFile(file)
        if (!storageValidation.valid) {
          setLocalError(storageValidation.error || 'Invalid file')
          continue
        }

        let fileToUpload = file
        let isCompressed = false
        const originalSize = file.size

        if (enableCompression && file.type.startsWith('image/')) {
          fileToUpload = await compressFile(file)
          isCompressed = fileToUpload.size < file.size
        }

        processedFiles.push({
          originalFile: file,
          fileToUpload,
          compressed: isCompressed,
          originalSize
        })
      }

      if (processedFiles.length === 0) {
        return
      }

      const totalBytes = processedFiles.reduce((sum, item) => sum + item.fileToUpload.size, 0)
      const uploadStart = Date.now()
      let uploadedBytes = 0

      setUploadStats({
        progress: 0,
        speed: 0,
        eta: 0
      })

      for (const { originalFile, fileToUpload, compressed, originalSize } of processedFiles) {
        const result = onFileUpload
          ? await onFileUpload(fileToUpload, {
              applicationId,
              userId: user.id,
              fileType
            })
          : await uploadApplicationFile(fileToUpload, user.id, applicationId, fileType)

        if (!result.success || !result.url) {
          throw new Error(result.error || 'Upload failed')
        }

        uploadedBytes += fileToUpload.size
        const elapsed = Date.now() - uploadStart
        const speed = elapsed > 0 ? (uploadedBytes / elapsed) * 1000 : 0
        const remaining = totalBytes - uploadedBytes
        const eta = speed > 0 ? remaining / speed : 0
        const progress = totalBytes > 0 ? Math.min(100, Math.round((uploadedBytes / totalBytes) * 100)) : 0

        setUploadStats({
          progress,
          speed,
          eta: isNaN(eta) ? 0 : eta
        })

        const uploadedFile: UploadedFile = {
          id: result.path || `${Date.now().toString()}-${Math.random()}`,
          name: originalFile.name,
          size: fileToUpload.size,
          url: result.url,
          type: originalFile.type,
          compressed,
          originalSize: compressed ? originalSize : undefined,
          path: result.path
        }

        if (onUploadComplete) {
          onUploadComplete(uploadedFile)
        }
      }
    } catch (error) {
      setLocalError(createUserFriendlyError(error))
    } finally {
      setIsUploading(false)
      setUploadStats({ progress: 0, speed: 0, eta: 0 })
    }
  }, [
    user,
    applicationId,
    validateFile,
    enableCompression,
    compressFile,
    onFileUpload,
    fileType,
    onUploadComplete
  ])

  const handleInputChange = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files || [])
    if (files.length > 0) {
      void handleFileUpload(files)
    }
    event.target.value = ''
  }, [handleFileUpload])

  const handleDrop = useCallback((event: React.DragEvent) => {
    event.preventDefault()
    setDragActive(false)

    const files = Array.from(event.dataTransfer.files)
    if (files.length > 0) {
      void handleFileUpload(files)
    }
  }, [handleFileUpload])

  const handleDragOver = useCallback((event: React.DragEvent) => {
    event.preventDefault()
    setDragActive(true)
  }, [])

  const handleDragLeave = useCallback((event: React.DragEvent) => {
    event.preventDefault()
    setDragActive(false)
  }, [])

  const displayError = error || localError
  const isUploading_ = isUploading || isCompressing || uploadingFiles.length > 0
  
  return (
    <div className="bg-white rounded-lg shadow-lg border border-gray-200 p-6">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold text-gray-900">
          Supporting Documents
        </h2>
        {uploadedFiles.length > 0 && (
          <div className="flex items-center text-sm text-green-600">
            <CheckCircle className="h-4 w-4 mr-1" />
            {uploadedFiles.length} file{uploadedFiles.length !== 1 ? 's' : ''} uploaded
          </div>
        )}
      </div>
      
      <div className="mb-4">
        <label className="block">
          <input
            type="file"
            accept={acceptedTypes.join(',')}
            onChange={handleInputChange}
            className="hidden"
            disabled={isUploading_}
            multiple
          />
          <div
            data-testid="file-upload-dropzone"
            className={cn(
              'border-2 border-dashed rounded-lg p-6 text-center transition-all duration-200 min-h-[48px] touch-target',
              isUploading_
                ? 'border-gray-200 bg-gray-50 cursor-not-allowed'
                : dragActive
                ? 'border-primary bg-primary/5 cursor-pointer'
                : 'border-gray-300 hover:border-primary hover:bg-primary/5 cursor-pointer'
            )}
            onDrop={handleDrop}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
          >
            <div className="flex flex-col items-center space-y-2">
              {isCompressing ? (
                <>
                  <Zap className="h-8 w-8 text-primary animate-pulse" />
                  <p className="text-sm text-primary font-medium">Optimizing image...</p>
                </>
              ) : isUploading ? (
                <>
                  <Upload className="h-8 w-8 text-primary animate-bounce" />
                  <p className="text-sm text-primary font-medium">Uploading...</p>
                    {uploadStats.progress > 0 && (
                      <div className="w-full max-w-xs">
                        <ProgressBar
                          value={uploadStats.progress}
                          size="sm"
                          showPercentage
                          color="blue"
                        />
                      {uploadStats.speed > 0 && (
                        <div className="flex justify-between text-xs text-gray-500 mt-1">
                          <span>{formatFileSize(uploadStats.speed)}/s</span>
                          <span>~{Math.ceil(uploadStats.eta)}s remaining</span>
                        </div>
                      )}
                    </div>
                  )}
                </>
              ) : (
                <>
                  <Upload className={cn(
                    'h-8 w-8 mx-auto',
                    dragActive ? 'text-primary' : 'text-gray-600'
                  )} />
                  <p className={cn(
                    'text-sm font-medium',
                    dragActive ? 'text-primary' : 'text-gray-600'
                  )}>
                    {dragActive ? 'Drop files here' : 'Click to upload or drag and drop'}
                  </p>
                  <p className="text-xs text-gray-500">
                    {acceptedTypes.join(', ').replace(/\./g, '').toUpperCase()} up to {formatFileSize(maxFileSize)}
                  </p>
                  {enableCompression && (
                    <p className="text-xs text-primary flex items-center">
                      <ImageIcon className="h-3 w-3 mr-1" />
                      Images will be automatically optimized
                    </p>
                  )}
                </>
              )}
            </div>
          </div>
        </label>
        
        {displayError && (
          <motion.div 
            className="mt-4 p-4 bg-red-50 border border-red-200 rounded-lg"
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3 }}
          >
            <div className="flex items-start space-x-3">
              <AlertCircle className="h-5 w-5 text-red-500 flex-shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-medium text-red-800">Upload Error</p>
                <p className="text-sm text-red-700 mt-1">{displayError}</p>
              </div>
            </div>
          </motion.div>
        )}
        
        {/* Compression Stats */}
        {showCompressionStats && compressionResults.length > 0 && (
          <motion.div 
            className="mt-4 p-4 bg-green-50 border border-green-200 rounded-lg"
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.3 }}
          >
            <div className="flex items-start space-x-3">
              <Zap className="h-5 w-5 text-green-600 flex-shrink-0 mt-0.5" />
              <div className="flex-1">
                <p className="text-sm font-medium text-green-800">Image Optimization Complete</p>
                <div className="mt-2 space-y-1">
                  {compressionResults.map((result, index) => (
                    <div key={index} className="text-xs text-green-700">
                      <span className="font-medium">{result.originalFile.name}</span>: 
                      {formatFileSize(result.originalSize)} → {formatFileSize(result.compressedSize)} 
                      ({result.compressionRatio.toFixed(1)}% smaller)
                    </div>
                  ))}
                </div>
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={clearResults}
                className="text-green-700 hover:text-green-800 p-1 h-auto"
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
          </motion.div>
        )}
      </div>

      {Object.keys(uploadProgress).length > 0 && (
        <div className="mt-4 space-y-3">
          {Object.entries(uploadProgress).map(([fileId, progress]) => {
            const fileName = uploadedFiles.find(f => f.id === fileId)?.name || fileId.split('-')[0]
            const isComplete = progress === 100
            return (
              <div key={fileId} className={`rounded-lg p-4 border transition-all duration-300 ${
                isComplete ? 'bg-green-50 border-green-200' : 'bg-blue-50 border-blue-200'
              }`}>
                <div className="flex justify-between items-center mb-2">
                  <div className="flex items-center">
                    {isComplete ? (
                      <CheckCircle className="h-4 w-4 text-green-600 mr-2" />
                    ) : (
                      <div className="h-4 w-4 mr-2 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
                    )}
                    <span className={`text-sm font-medium ${
                      isComplete ? 'text-green-800' : 'text-blue-800'
                    }`}>{fileName}</span>
                  </div>
                  <span className={`text-sm font-semibold ${
                    isComplete ? 'text-green-600' : 'text-blue-600'
                  }`}>
                    {isComplete ? 'Complete!' : `${progress}%`}
                  </span>
                </div>
                <div className="w-full bg-gray-200 rounded-full h-2">
                  <div 
                    className={`h-2 rounded-full transition-all duration-500 ${
                      isComplete 
                        ? 'bg-gradient-to-r from-green-500 to-green-600' 
                        : 'bg-gradient-to-r from-blue-500 to-blue-600'
                    }`}
                    style={{ width: `${progress}%` }}
                  />
                </div>
                {isComplete && (
                  <div className="mt-2 text-xs text-green-600">
                    File uploaded successfully!
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {uploadedFiles.length > 0 && (
        <div className="space-y-3">
          <h3 className="text-sm font-medium text-gray-700 mb-3">
            Uploaded Files ({uploadedFiles.length})
          </h3>
          <AnimatePresence>
            {uploadedFiles.map((file) => (
              <motion.div 
                key={file.id} 
                initial={{ opacity: 0, y: 20, scale: 0.95 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: -20, scale: 0.95 }}
                transition={{ duration: 0.3 }}
                className="bg-gradient-to-r from-green-50 to-emerald-50 border border-green-200 rounded-lg transition-all duration-200 hover:shadow-md group"
              >
                <div className="flex items-center justify-between p-4">
                  <div className="flex items-center space-x-4 flex-1">
                    <div className="flex items-center">
                      <CheckCircle className="h-5 w-5 text-green-600 mr-2" />
                      {file.type?.startsWith('image/') ? (
                        <ImageIcon className="h-5 w-5 text-green-700" />
                      ) : (
                        <FileText className="h-5 w-5 text-green-700" />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-green-800 truncate">{file.name}</p>
                      <div className="flex items-center space-x-3 mt-1">
                        <p className="text-xs text-green-600">{formatFileSize(file.size)}</p>
                        {file.compressed && file.originalSize && (
                          <div className="flex items-center space-x-1">
                            <Zap className="h-3 w-3 text-primary" />
                            <span className="text-xs text-primary font-medium">
                              Optimized ({((1 - file.size / file.originalSize) * 100).toFixed(0)}% smaller)
                            </span>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                  <LoadingButton
                    variant="ghost"
                    size="sm"
                    onClick={() => onRemoveFile(file.id)}
                    className="text-red-600 hover:text-red-700 hover:bg-red-50 min-h-[44px] min-w-[44px] touch-target opacity-0 group-hover:opacity-100 transition-opacity"
                    aria-label={`Remove ${file.name}`}
                  >
                    <X className="h-4 w-4" />
                  </LoadingButton>
                </div>
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
      )}
    </div>
  )
}