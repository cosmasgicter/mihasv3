/**
 * AnimatedFileUpload Component - SmoothUI-style animated file upload
 * Provides smooth animations for file upload with progress indication
 * Uses CSS transitions instead of framer-motion for performance.
 * 
 * @requirements 1.2 - CSS transitions instead of framer-motion
 * @requirements 1.5 - Preserve same visual transition behavior
 * @requirements 7.3, 7.4, 7.5 - SmoothUI form components with validation and auto-save status
 */

import { forwardRef, useState, useCallback, useId } from 'react';
import { Upload, CheckCircle, AlertCircle, FileText, X } from 'lucide-react';
import { cn } from '@/lib/utils';

interface AnimatedFileUploadProps {
  label?: string;
  error?: string;
  helperText?: string;
  accept?: string;
  onChange?: (event: React.ChangeEvent<HTMLInputElement>) => void;
  file?: File | null;
  uploadProgress?: number;
  isUploaded?: boolean;
  required?: boolean;
  id?: string;
  className?: string;
  /** When true, shows a prominent progress bar during upload (for files > 1MB) */
  showProgressBar?: boolean;
}

export const AnimatedFileUpload = forwardRef<HTMLInputElement, AnimatedFileUploadProps>(
  ({ 
    label, 
    error, 
    helperText, 
    accept = '.pdf,.jpg,.jpeg,.png',
    onChange,
    file,
    uploadProgress,
    isUploaded,
    required,
    id,
    className,
    showProgressBar,
  }, ref) => {
    const [isDragging, setIsDragging] = useState(false);
    const [isFocused, setIsFocused] = useState(false);
    const generatedId = useId();
    const inputId = id || generatedId;

    const handleDragOver = useCallback((e: React.DragEvent) => {
      e.preventDefault();
      setIsDragging(true);
    }, []);

    const handleDragLeave = useCallback((e: React.DragEvent) => {
      e.preventDefault();
      setIsDragging(false);
    }, []);

    const handleDrop = useCallback((e: React.DragEvent) => {
      e.preventDefault();
      setIsDragging(false);
      
      const files = e.dataTransfer.files;
      if (files.length > 0 && onChange) {
        const syntheticEvent = {
          target: { files },
        } as React.ChangeEvent<HTMLInputElement>;
        onChange(syntheticEvent);
      }
    }, [onChange]);

    const isUploading = uploadProgress !== undefined && uploadProgress < 100;
    const showSuccess = isUploaded || (uploadProgress === 100);
    const isLargeFile = file ? file.size > 1 * 1024 * 1024 : false;
    const shouldShowProgressBar = showProgressBar ?? isLargeFile;

    return (
      <div className={cn('relative', className)}>
        {label && (
          <label 
            htmlFor={inputId}
            className="block text-sm font-medium text-foreground mb-2"
          >
            {label}
            {required && <span className="text-destructive ml-1">*</span>}
          </label>
        )}

        <div
          className={cn(
            'relative border-2 border-dashed rounded-lg p-6 transition-all duration-150 ease-out motion-reduce:transition-none',
            'cursor-pointer hover:border-primary/50',
            isDragging && 'border-primary bg-primary/5 scale-[1.02]',
            isFocused && 'ring-2 ring-primary ring-offset-2',
            error ? 'border-destructive' : 'border-border',
            showSuccess && 'border-success bg-success/5'
          )}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
        >
          <input
            ref={ref}
            type="file"
            id={inputId}
            accept={accept}
            onChange={onChange}
            onFocus={() => setIsFocused(true)}
            onBlur={() => setIsFocused(false)}
            className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
            aria-invalid={error ? 'true' : undefined}
            aria-required={required || undefined}
            aria-describedby={error ? `${inputId}-error` : helperText ? `${inputId}-helper` : undefined}
          />

          {isUploading ? (
            <div className="text-center animate-fade-in">
              {shouldShowProgressBar ? (
                <>
                  <Upload className="w-10 h-10 mx-auto mb-3 text-primary animate-pulse" />
                  <p className="text-sm font-medium text-foreground">Uploading{file ? ` ${file.name}` : ''}...</p>
                  <div className="mt-3 w-full max-w-sm mx-auto">
                    <div className="flex justify-between text-xs text-muted-foreground mb-1.5">
                      <span className="truncate max-w-[70%]">{file?.name}</span>
                      <span className="font-medium text-primary">{uploadProgress}%</span>
                    </div>
                    <div className="h-3 bg-border rounded-full overflow-hidden">
                      <div
                        className="h-full bg-primary rounded-full transition-all duration-300 ease-out"
                        style={{ width: `${uploadProgress}%` }}
                        role="progressbar"
                        aria-valuenow={uploadProgress}
                        aria-valuemin={0}
                        aria-valuemax={100}
                        aria-label={`Upload progress: ${uploadProgress}%`}
                      />
                    </div>
                  </div>
                </>
              ) : (
                <>
                  <Upload className="w-12 h-12 mx-auto mb-3 text-primary animate-pulse motion-reduce:animate-none" />
                  <p className="text-sm font-medium text-foreground">Uploading...</p>
                  <div className="mt-2 w-full max-w-xs mx-auto">
                    <div className="flex justify-between text-xs text-muted-foreground mb-1">
                      <span>{file?.name}</span>
                      <span>{uploadProgress}%</span>
                    </div>
                    <div className="h-2 bg-border rounded-full overflow-hidden">
                      <div
                        className="h-full bg-primary rounded-full transition-all duration-300 ease-out"
                        style={{ width: `${uploadProgress}%` }}
                      />
                    </div>
                  </div>
                </>
              )}
            </div>
          ) : showSuccess ? (
            <div className="text-center animate-scale-in">
              <CheckCircle className="w-12 h-12 mx-auto mb-3 text-success animate-scale-in" />
              <p className="text-sm font-medium text-success">Upload complete!</p>
              {file && (
                <p className="text-xs text-muted-foreground mt-1 truncate max-w-xs mx-auto">
                  {file.name}
                </p>
              )}
              <p className="text-xs text-muted-foreground mt-2">
                Click or drag to replace
              </p>
            </div>
          ) : file ? (
            <div className="text-center animate-fade-in">
              <FileText className="w-12 h-12 mx-auto mb-3 text-primary" />
              <p className="text-sm font-medium text-foreground truncate max-w-xs mx-auto">
                {file.name}
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                Click or drag to replace
              </p>
            </div>
          ) : (
            <div className="text-center animate-fade-in">
              <div
                className={cn(
                  'transition-transform duration-150 ease-out motion-reduce:transition-none',
                  isDragging && '-translate-y-1'
                )}
              >
                <Upload className={cn(
                  'w-12 h-12 mx-auto mb-3 transition-colors',
                  isDragging ? 'text-primary' : 'text-muted-foreground'
                )} />
              </div>
              <p className="text-sm font-medium text-foreground">
                {isDragging ? 'Drop file here' : 'Click to upload or drag and drop'}
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                {accept.split(',').join(', ')} files accepted
              </p>
            </div>
          )}
        </div>

        {/* Error message with animation */}
        <div
          className={cn(
            'transition-all duration-150 ease-out overflow-hidden motion-reduce:transition-none',
            error ? 'opacity-100 max-h-10 mt-2' : 'opacity-0 max-h-0'
          )}
        >
          {error && (
            <div className="flex items-center gap-1.5">
              <AlertCircle className="h-4 w-4 text-destructive flex-shrink-0" />
              <p 
                id={`${inputId}-error`}
                className="text-sm text-destructive"
                role="alert"
              >
                {error}
              </p>
            </div>
          )}
        </div>

        {/* Helper text */}
        {helperText && !error && (
          <p 
            id={`${inputId}-helper`}
            className="mt-2 text-sm text-muted-foreground"
          >
            {helperText}
          </p>
        )}
      </div>
    );
  }
);

AnimatedFileUpload.displayName = 'AnimatedFileUpload';

export default AnimatedFileUpload;
