import React, { useRef, useState } from 'react'
import { Upload, X, File, CheckCircle, AlertCircle } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from './Button'

interface FileUploadProps {
  accept?: string
  maxSize?: number
  onFileSelect: (file: File) => void
  onFileRemove?: () => void
  currentFile?: File | null
  error?: string
  disabled?: boolean
  label?: string
  helperText?: string
}

export function FileUpload({
  accept = '.pdf,.jpg,.jpeg,.png',
  maxSize = 5 * 1024 * 1024, // 5MB
  onFileSelect,
  onFileRemove,
  currentFile,
  error,
  disabled,
  label,
  helperText
}: FileUploadProps) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [dragActive, setDragActive] = useState(false)

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setDragActive(true)
    } else if (e.type === 'dragleave') {
      setDragActive(false)
    }
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setDragActive(false)

    if (disabled) return

    const file = e.dataTransfer.files?.[0]
    if (file) validateAndSelect(file)
  }

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) validateAndSelect(file)
  }

  const validateAndSelect = (file: File) => {
    if (file.size > maxSize) {
      return
    }
    onFileSelect(file)
  }

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return bytes + ' B'
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB'
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB'
  }

  return (
    <div className="w-full">
      {label && (
        <label className="block text-sm font-medium text-body mb-2">
          {label}
        </label>
      )}

      {currentFile ? (
        <div className="border border-border rounded-lg p-4 bg-card">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3 min-w-0 flex-1">
              <div className="flex-shrink-0">
                <File className="h-8 w-8 text-primary" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-body truncate" title={currentFile.name}>
                  {currentFile.name}
                </p>
                <p className="text-xs text-body">
                  {formatFileSize(currentFile.size)}
                </p>
              </div>
              <CheckCircle className="h-5 w-5 text-success flex-shrink-0" />
            </div>
            {onFileRemove && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={onFileRemove}
                disabled={disabled}
                className="ml-2 flex-shrink-0"
              >
                <X className="h-4 w-4" />
              </Button>
            )}
          </div>
        </div>
      ) : (
        <div
          className={cn(
            'border-2 border-dashed rounded-lg p-6 text-center transition-colors cursor-pointer',
            dragActive && 'border-primary bg-primary/5',
            error && 'border-destructive',
            disabled && 'opacity-50 cursor-not-allowed',
            !dragActive && !error && 'border-border hover:border-primary'
          )}
          onDragEnter={handleDrag}
          onDragLeave={handleDrag}
          onDragOver={handleDrag}
          onDrop={handleDrop}
          onClick={() => !disabled && inputRef.current?.click()}
        >
          <input
            ref={inputRef}
            type="file"
            accept={accept}
            onChange={handleChange}
            disabled={disabled}
            className="hidden"
            aria-label={label || 'File upload'}
          />
          <Upload className="h-10 w-10 mx-auto mb-3 text-foreground" />
          <p className="text-sm font-medium text-body mb-1">
            Drop file here or click to browse
          </p>
          <p className="text-xs text-body">
            {accept.split(',').join(', ')} • Max {formatFileSize(maxSize)}
          </p>
        </div>
      )}

      {error && (
        <div className="mt-2 flex items-center gap-2 text-sm text-destructive">
          <AlertCircle className="h-4 w-4 flex-shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {helperText && !error && (
        <p className="mt-2 text-xs text-body">{helperText}</p>
      )}
    </div>
  )
}
