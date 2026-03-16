import React, { useState, useCallback, useRef } from 'react'
import { useDropzone } from 'react-dropzone'
import { Upload, X, Image, FileText, Check, AlertCircle, Minimize2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { UnifiedSpinner } from './UnifiedLoader'
import { ProgressIndicator } from './ProgressIndicator'
import { compressImage, validateFile, formatFileSize } from '@/lib/utils'
import { useNetworkStatus } from '@/hooks/useNetworkStatus'

interface EnhancedFileUploadProps {
  onFileSelect: (file: File) => Promise<void>
  accept?: string[]
  maxSize?: number // in bytes
  maxFiles?: number
  disabled?: boolean
  value?: File[]
  className?: string
  autoCompress?: boolean
  compressionQuality?: number
}

interface FileWithProgress {
  file: File
  progress: number
  status: 'uploading' | 'compressing' | 'completed' | 'error'
  error?: string
  compressed?: boolean
  originalSize?: number
}

export function EnhancedFileUpload({
  onFileSelect,
  accept = ['image/*', '.pdf'],
  maxSize = 10 * 1024 * 1024, // 10MB per Req 17.2
  maxFiles = 5,
  disabled = false,
  value = [],
  className,
  autoCompress = true,
  compressionQuality = 0.8
}: EnhancedFileUploadProps) {
  const [files, setFiles] = useState<FileWithProgress[]>([])
  const [isDragActive, setIsDragActive] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const { isOnline, isSlowConnection } = useNetworkStatus()

  const processFile = useCallback(async (file: File): Promise<File> => {
    // Validate file first
    const validation = validateFile(file, accept, maxSize)
    if (!validation.isValid) {
      throw new Error(validation.error)
    }

    // Compress image if needed and enabled
    if (autoCompress && file.type.startsWith('image/') && file.size > 1024 * 1024) {
      setFiles(prev => prev.map(f => 
        f.file === file ? { ...f, status: 'compressing' as const } : f
      ))
      
      const compressedFile = await compressImage(file, compressionQuality)
      return compressedFile
    }

    return file
  }, [accept, maxSize, autoCompress, compressionQuality])

  const handleFileUpload = useCallback(async (uploadedFiles: File[]) => {
    if (disabled || !isOnline) return

    // Check file limits
    if (files.length + uploadedFiles.length > maxFiles) {
      throw new Error(`Maximum ${maxFiles} files allowed`)
    }

    // Initialize files with progress tracking
    const newFiles: FileWithProgress[] = uploadedFiles.map(file => ({
      file,
      progress: 0,
      status: 'uploading' as const,
      originalSize: file.size
    }))

    setFiles(prev => [...prev, ...newFiles])

    // Process each file
    for (const fileWithProgress of newFiles) {
      try {
        const processedFile = await processFile(fileWithProgress.file)
        
        // Update file status to uploading
        setFiles(prev => prev.map(f => 
          f.file === fileWithProgress.file 
            ? { 
                ...f, 
                status: 'uploading' as const,
                file: processedFile,
                compressed: processedFile !== fileWithProgress.file
              } 
            : f
        ))

        // Simulate upload progress (replace with actual upload logic)
        await simulateUploadProgress(fileWithProgress.file, (progress) => {
          setFiles(prev => prev.map(f => 
            f.file === fileWithProgress.file ? { ...f, progress } : f
          ))
        })

        // Call the upload handler
        await onFileSelect(processedFile)

        // Mark as completed
        setFiles(prev => prev.map(f => 
          f.file === fileWithProgress.file 
            ? { ...f, status: 'completed' as const, progress: 100 } 
            : f
        ))

      } catch (error) {
        // Mark as error
        setFiles(prev => prev.map(f => 
          f.file === fileWithProgress.file 
            ? { 
                ...f, 
                status: 'error' as const, 
                error: error instanceof Error ? error.message : 'Upload failed'
              } 
            : f
        ))
      }
    }
  }, [disabled, isOnline, files.length, maxFiles, processFile, onFileSelect])

  const simulateUploadProgress = async (
    file: File, 
    onProgress: (progress: number) => void
  ) => {
    // Simulate realistic upload progress
    const steps = isSlowConnection ? 20 : 10
    const stepDelay = isSlowConnection ? 200 : 100
    
    for (let i = 0; i <= steps; i++) {
      const progress = Math.min((i / steps) * 100, 95) // Stop at 95% until actual completion
      onProgress(progress)
      await new Promise(resolve => setTimeout(resolve, stepDelay))
    }
  }

  const onDrop = useCallback((acceptedFiles: File[]) => {
    handleFileUpload(acceptedFiles)
  }, [handleFileUpload])

  const { getRootProps, getInputProps, isDragActive: dzIsDragActive } = useDropzone({
    onDrop,
    accept: {
      'image/jpeg': ['.jpg', '.jpeg'],
      'image/png': ['.png'],
      'application/pdf': ['.pdf'],
    },
    maxSize,
    maxFiles: maxFiles - files.length,
    disabled: disabled || !isOnline,
    onDragEnter: () => setIsDragActive(true),
    onDragLeave: () => setIsDragActive(false),
    onDropAccepted: () => setIsDragActive(false),
    onDropRejected: () => setIsDragActive(false)
  })

  const removeFile = (fileToRemove: File) => {
    setFiles(prev => prev.filter(f => f.file !== fileToRemove))
  }

  const retryUpload = (fileToRetry: File) => {
    handleFileUpload([fileToRetry])
  }

  const getFileIcon = (file: File) => {
    if (file.type.startsWith('image/')) {
      return <Image className="w-5 h-5" />
    }
    return <FileText className="w-5 h-5" />
  }

  const getStatusIcon = (fileWithProgress: FileWithProgress) => {
    switch (fileWithProgress.status) {
      case 'completed':
        return <Check className="w-4 h-4 text-success" />
      case 'error':
        return <AlertCircle className="w-4 h-4 text-error" />
      case 'compressing':
        return <Minimize2 className="w-4 h-4 text-primary animate-pulse" />
      default:
        return <UnifiedSpinner size="sm" />
    }
  }

  return (
    <div className={cn('space-y-4', className)}>
      {/* Upload Area */}
      <div
        {...getRootProps()}
        className={cn(
          'relative border-2 border-dashed rounded-lg p-6 transition-all duration-200',
          'cursor-pointer hover:bg-muted focus:outline-none focus:ring-2 focus:ring-ring',
          // Touch-optimized minimum height
          'min-h-[120px] flex flex-col items-center justify-center',
          // State-based styling
          isDragActive || dzIsDragActive
            ? 'border-primary bg-primary/5'
            : 'border-input',
          disabled || !isOnline
            ? 'opacity-50 cursor-not-allowed bg-muted'
            : 'hover:border-input',
          // Mobile optimizations
          'touch-manipulation'
        )}
      >
        <input {...getInputProps()} ref={fileInputRef} />
        
        <div className="text-center space-y-2">
          <Upload className={cn(
            'w-8 h-8 mx-auto',
            isDragActive || dzIsDragActive ? 'text-primary' : 'text-foreground'
          )} />
          
          <div className="space-y-1">
            <p className="text-sm font-medium text-foreground">
              {isDragActive || dzIsDragActive
                ? 'Drop files here'
                : 'Drop files here or click to browse'
              }
            </p>
            <p className="text-xs text-foreground">
              {accept.join(', ')} up to {formatFileSize(maxSize)}
              {autoCompress && ' (Images will be compressed)'}
            </p>
            {!isOnline && (
              <p className="text-xs text-destructive">
                No internet connection - upload disabled
              </p>
            )}
            {isSlowConnection && (
              <p className="text-xs text-warning-strong">
                Slow connection detected - uploads may take longer
              </p>
            )}
          </div>
        </div>
      </div>

      {/* File List */}
      {files.length > 0 && (
        <div className="space-y-3">
          <h4 className="text-sm font-medium text-foreground">
            Files ({files.length}/{maxFiles})
          </h4>
          
          <div className="space-y-2">
            {files.map((fileWithProgress, index) => (
              <div
                key={`${fileWithProgress.file.name}-${index}`}
                className="flex items-center space-x-3 p-3 bg-muted rounded-lg"
              >
                {/* File Icon */}
                <div className="shrink-0">
                  {getFileIcon(fileWithProgress.file)}
                </div>
                
                {/* File Info */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-medium text-foreground truncate">
                      {fileWithProgress.file.name}
                    </p>
                    <div className="flex items-center space-x-2">
                      {getStatusIcon(fileWithProgress)}
                      <button
                        onClick={() => removeFile(fileWithProgress.file)}
                        className="p-1 hover:bg-skeleton rounded-full transition-colors"
                        type="button"
                      >
                        <X className="w-4 h-4 text-foreground" />
                      </button>
                    </div>
                  </div>
                  
                  <div className="mt-1 space-y-1">
                    <div className="flex items-center justify-between text-xs text-foreground">
                      <span>
                        {formatFileSize(fileWithProgress.file.size)}
                        {fileWithProgress.compressed && fileWithProgress.originalSize && (
                          <span className="text-accent ml-1">
                            (compressed from {formatFileSize(fileWithProgress.originalSize)})
                          </span>
                        )}
                      </span>
                      {fileWithProgress.status === 'uploading' && (
                        <span>{Math.round(fileWithProgress.progress)}%</span>
                      )}
                    </div>
                    
                    {/* Progress Bar */}
                    {(fileWithProgress.status === 'uploading' || fileWithProgress.status === 'compressing') && (
                      <ProgressIndicator
                        progress={fileWithProgress.progress}
                        status={fileWithProgress.status === 'compressing' ? 'loading' : 'loading'}
                        size="sm"
                        showPercentage={false}
                      />
                    )}
                    
                    {/* Error Message */}
                    {fileWithProgress.status === 'error' && fileWithProgress.error && (
                      <div className="flex items-center justify-between">
                        <p className="text-xs text-destructive">{fileWithProgress.error}</p>
                        <button
                          onClick={() => retryUpload(fileWithProgress.file)}
                          className="text-xs text-primary hover:text-primary font-medium"
                          type="button"
                        >
                          Retry
                        </button>
                      </div>
                    )}
                    
                    {/* Status Messages */}
                    {fileWithProgress.status === 'compressing' && (
                      <p className="text-xs text-info-strong">Compressing image...</p>
                    )}
                    {fileWithProgress.status === 'completed' && (
                      <p className="text-xs text-warning-strong">Upload completed</p>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

// Image preview component for uploaded files
export function ImagePreview({ file, className }: { file: File, className?: string }) {
  const [preview, setPreview] = useState<string | null>(null)

  React.useEffect(() => {
    if (file.type.startsWith('image/')) {
      const objectUrl = URL.createObjectURL(file)
      setPreview(objectUrl)
      return () => URL.revokeObjectURL(objectUrl)
    }
  }, [file])

  if (!preview) return null

  return (
    <div className={cn('aspect-square bg-accent rounded-lg overflow-hidden', className)}>
      <img
        src={preview}
        alt={`Preview of uploaded document: ${file.name}`}
        className="w-full h-full object-cover"
        loading="lazy"
      />
    </div>
  )
}
