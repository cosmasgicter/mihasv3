import React, { useCallback, useId, useMemo } from 'react'
import { useDropzone } from 'react-dropzone'
import {
  Upload,
  X,
  File as FileIcon,
  FileText,
  Image as ImageIcon,
  CheckCircle,
  AlertCircle,
  RotateCcw,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from './Button'

interface FileUploadProps {
  accept?: string
  maxSize?: number // bytes
  multiple?: boolean
  value?: File | File[] | null
  onChange?: (files: File | File[] | null) => void
  onError?: (error: string) => void
  disabled?: boolean
  uploading?: boolean
  progress?: number // 0-100
  error?: string
  preview?: { url: string; type: 'image' | 'pdf' | 'other' }
  className?: string
  /** Optional cancel handler shown during upload */
  onCancel?: () => void
  /** Optional retry handler shown on error */
  onRetry?: () => void
  /** Accessible label for the drop zone */
  label?: string
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return bytes + ' B'
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB'
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB'
}

/** Parse an accept string like ".pdf,.jpg,.png" into a dropzone-compatible accept object */
function parseAccept(accept?: string): Record<string, string[]> | undefined {
  if (!accept) return undefined
  const mimeMap: Record<string, string> = {
    '.pdf': 'application/pdf',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.png': 'image/png',
    '.gif': 'image/gif',
    '.webp': 'image/webp',
    '.doc': 'application/msword',
    '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  }
  const result: Record<string, string[]> = {}
  for (const ext of accept.split(',').map(s => s.trim().toLowerCase())) {
    const mime = mimeMap[ext]
    if (mime) {
      if (!result[mime]) result[mime] = []
      if (!result[mime].includes(ext)) result[mime].push(ext)
    }
  }
  return Object.keys(result).length > 0 ? result : undefined
}

function getFileIcon(type?: 'image' | 'pdf' | 'other') {
  switch (type) {
    case 'image':
      return <ImageIcon className="h-8 w-8 text-primary" aria-hidden="true" />
    case 'pdf':
      return <FileText className="h-8 w-8 text-primary" aria-hidden="true" />
    default:
      return <FileIcon className="h-8 w-8 text-primary" aria-hidden="true" />
  }
}

/** Get the first file from value for display purposes */
function getPrimaryFile(value?: File | File[] | null): File | null {
  if (!value) return null
  if (Array.isArray(value)) return value[0] ?? null
  return value
}

function FileUpload({
  accept = '.pdf,.jpg,.jpeg,.png',
  maxSize = 5 * 1024 * 1024,
  multiple = false,
  value,
  onChange,
  onError,
  disabled = false,
  uploading = false,
  progress = 0,
  error,
  preview,
  className,
  onCancel,
  onRetry,
  label,
}: FileUploadProps) {
  const componentId = useId()
  const errorId = `${componentId}-error`

  const dropzoneAccept = useMemo(() => parseAccept(accept), [accept])

  const onDrop = useCallback(
    (acceptedFiles: File[]) => {
      if (!onChange || acceptedFiles.length === 0) return
      if (multiple) {
        onChange(acceptedFiles)
      } else {
        onChange(acceptedFiles[0])
      }
    },
    [onChange, multiple]
  )

  const onDropRejected = useCallback(
    (rejections: Array<{ file: File; errors: Array<{ code: string; message: string }> }>) => {
      if (!onError || rejections.length === 0) return
      const first = rejections[0].errors[0]
      if (first.code === 'file-too-large') {
        onError(`File exceeds maximum size of ${formatFileSize(maxSize)}`)
      } else if (first.code === 'file-invalid-type') {
        onError(`Invalid file type. Accepted: ${accept}`)
      } else {
        onError(first.message)
      }
    },
    [onError, maxSize, accept]
  )

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    onDropRejected,
    accept: dropzoneAccept,
    maxSize,
    multiple,
    disabled: disabled || uploading,
    noClick: uploading,
    noKeyboard: uploading,
  })

  const primaryFile = getPrimaryFile(value)
  const fileCount = Array.isArray(value) ? value.length : value ? 1 : 0
  const hasFile = fileCount > 0
  const hasPreview = !!preview

  const handleRemove = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation()
      onChange?.(null)
    },
    [onChange]
  )

  const handleCancel = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation()
      onCancel?.()
    },
    [onCancel]
  )

  const handleRetry = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation()
      onRetry?.()
    },
    [onRetry]
  )

  // --- Uploading state ---
  if (uploading && hasFile) {
    return (
      <div className={cn('w-full', className)}>
        <div className="border border-border rounded-lg p-4 bg-card">
          <div className="flex items-center gap-3 mb-3">
            <Upload className="h-6 w-6 text-primary flex-shrink-0 animate-pulse" aria-hidden="true" />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium text-foreground truncate">
                {primaryFile?.name ?? 'Uploading...'}
              </p>
              {primaryFile && (
                <p className="text-xs text-muted-foreground">
                  {formatFileSize(primaryFile.size)}
                </p>
              )}
            </div>
            {onCancel && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={handleCancel}
                className="flex-shrink-0"
                aria-label="Cancel upload"
              >
                <X className="h-4 w-4" aria-hidden="true" />
              </Button>
            )}
          </div>
          <div className="w-full">
            <div className="flex justify-between text-xs text-muted-foreground mb-1">
              <span>Uploading...</span>
              <span className="font-medium text-primary">{Math.round(progress)}%</span>
            </div>
            <div className="h-2 bg-muted rounded-full overflow-hidden">
              <div
                className="h-full bg-primary rounded-full transition-all duration-normal ease-out"
                style={{ width: `${Math.min(100, Math.max(0, progress))}%` }}
                role="progressbar"
                aria-valuenow={Math.round(progress)}
                aria-valuemin={0}
                aria-valuemax={100}
                aria-label={`Upload progress: ${Math.round(progress)}%`}
              />
            </div>
          </div>
        </div>
      </div>
    )
  }

  // --- Success state (preview available) ---
  if (hasPreview && hasFile && !error) {
    return (
      <div className={cn('w-full', className)}>
        <div className="border border-success/30 rounded-lg p-4 bg-success/5">
          <div className="flex items-center gap-3">
            {preview.type === 'image' ? (
              <img
                src={preview.url}
                alt={primaryFile?.name ?? 'Uploaded file preview'}
                className="h-12 w-12 rounded-md object-cover flex-shrink-0"
              />
            ) : (
              <div className="flex-shrink-0">
                {getFileIcon(preview.type)}
              </div>
            )}
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1.5">
                <p className="text-sm font-medium text-foreground truncate">
                  {primaryFile?.name ?? 'File uploaded'}
                </p>
                <CheckCircle className="h-4 w-4 text-success flex-shrink-0" aria-hidden="true" />
              </div>
              {primaryFile && (
                <p className="text-xs text-muted-foreground">
                  {formatFileSize(primaryFile.size)}
                </p>
              )}
            </div>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={handleRemove}
              disabled={disabled}
              className="flex-shrink-0"
              aria-label="Remove file"
            >
              <X className="h-4 w-4" aria-hidden="true" />
            </Button>
          </div>
        </div>
      </div>
    )
  }

  // --- Error state with file retained ---
  if (error && hasFile) {
    return (
      <div className={cn('w-full', className)}>
        <div className="border border-destructive/30 rounded-lg p-4 bg-destructive/5">
          <div className="flex items-center gap-3">
            <div className="flex-shrink-0">
              <FileIcon className="h-8 w-8 text-muted-foreground" aria-hidden="true" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium text-foreground truncate">
                {primaryFile?.name}
              </p>
              {primaryFile && (
                <p className="text-xs text-muted-foreground">
                  {formatFileSize(primaryFile.size)}
                </p>
              )}
            </div>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={handleRemove}
              disabled={disabled}
              className="flex-shrink-0"
              aria-label="Remove file"
            >
              <X className="h-4 w-4" aria-hidden="true" />
            </Button>
          </div>
          <div className="mt-2 flex items-center justify-between gap-2">
            <div className="flex items-center gap-1.5 min-w-0">
              <AlertCircle className="h-4 w-4 text-destructive flex-shrink-0" aria-hidden="true" />
              <p id={errorId} className="text-sm text-destructive truncate" role="alert">
                {error}
              </p>
            </div>
            {onRetry && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handleRetry}
                disabled={disabled}
                className="flex-shrink-0"
              >
                <RotateCcw className="h-3.5 w-3.5 mr-1" aria-hidden="true" />
                Retry
              </Button>
            )}
          </div>
        </div>
      </div>
    )
  }

  // --- File selected (no preview, no error, not uploading) ---
  if (hasFile && !error && !uploading && !hasPreview) {
    return (
      <div className={cn('w-full', className)}>
        <div className="border border-border rounded-lg p-4 bg-card">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3 min-w-0 flex-1">
              <div className="flex-shrink-0">
                <FileIcon className="h-8 w-8 text-primary" aria-hidden="true" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-foreground truncate" title={primaryFile?.name}>
                  {primaryFile?.name}
                </p>
                {primaryFile && (
                  <p className="text-xs text-muted-foreground">
                    {formatFileSize(primaryFile.size)}
                  </p>
                )}
                {multiple && fileCount > 1 && (
                  <p className="text-xs text-muted-foreground">
                    +{fileCount - 1} more file{fileCount - 1 > 1 ? 's' : ''}
                  </p>
                )}
              </div>
              <CheckCircle className="h-5 w-5 text-success flex-shrink-0" aria-hidden="true" />
            </div>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={handleRemove}
              disabled={disabled}
              className="ml-2 flex-shrink-0"
              aria-label="Remove file"
            >
              <X className="h-4 w-4" aria-hidden="true" />
            </Button>
          </div>
        </div>
      </div>
    )
  }

  // --- Default drop zone (no file, or error without file) ---
  return (
    <div className={cn('w-full', className)}>
      <div
        {...getRootProps({
          className: cn(
            'border-2 border-dashed rounded-lg p-6 text-center transition-colors duration-fast cursor-pointer',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
            isDragActive && 'border-primary bg-primary/5',
            error && !hasFile && 'border-destructive',
            disabled && 'opacity-50 cursor-not-allowed',
            !isDragActive && !error && !disabled && 'border-border hover:border-primary/50'
          ),
        })}
      >
        <input
          {...getInputProps()}
          aria-label={label || 'File upload'}
          aria-describedby={error ? errorId : undefined}
        />
        <Upload
          className={cn(
            'h-10 w-10 mx-auto mb-3 transition-colors duration-fast',
            isDragActive ? 'text-primary' : 'text-muted-foreground'
          )}
          aria-hidden="true"
        />
        <p className="text-sm font-medium text-foreground mb-1">
          {isDragActive ? 'Drop file here' : 'Drop file here or click to browse'}
        </p>
        <p className="text-xs text-muted-foreground">
          {accept.split(',').map(s => s.trim()).join(', ')} • Max {formatFileSize(maxSize)}
        </p>
      </div>

      {error && !hasFile && (
        <div className="mt-2 flex items-center gap-2">
          <AlertCircle className="h-4 w-4 text-destructive flex-shrink-0" aria-hidden="true" />
          <p id={errorId} className="text-sm text-destructive" role="alert">
            {error}
          </p>
        </div>
      )}
    </div>
  )
}

export { FileUpload }
export type { FileUploadProps }
