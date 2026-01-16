/**
 * AnimatedFileUpload Component - SmoothUI-style animated file upload
 * Provides smooth animations for file upload with progress indication
 * 
 * @requirements 7.3, 7.4, 7.5 - SmoothUI form components with validation and auto-save status
 */

import { forwardRef, useState, useCallback } from 'react';
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion';
import { Upload, CheckCircle, AlertCircle, FileText, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { durations, easings } from '@/lib/animation-config';

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
  }, ref) => {
    const [isDragging, setIsDragging] = useState(false);
    const [isFocused, setIsFocused] = useState(false);
    const prefersReducedMotion = useReducedMotion();

    const inputId = id || `file-upload-${Math.random().toString(36).substr(2, 9)}`;

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
        // Create a synthetic event
        const syntheticEvent = {
          target: { files },
        } as React.ChangeEvent<HTMLInputElement>;
        onChange(syntheticEvent);
      }
    }, [onChange]);

    const isUploading = uploadProgress !== undefined && uploadProgress < 100;
    const showSuccess = isUploaded || (uploadProgress === 100);

    return (
      <div className={cn('relative', className)}>
        {label && (
          <label 
            htmlFor={inputId}
            className="block text-sm font-medium text-gray-900 mb-2"
          >
            {label}
            {required && <span className="text-error ml-1">*</span>}
          </label>
        )}

        <motion.div
          className={cn(
            'relative border-2 border-dashed rounded-lg p-6 transition-colors',
            'cursor-pointer hover:border-primary/50',
            isDragging && 'border-primary bg-primary/5',
            isFocused && 'ring-2 ring-primary ring-offset-2',
            error ? 'border-destructive' : 'border-border',
            showSuccess && 'border-success bg-success/5'
          )}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          animate={{
            scale: isDragging && !prefersReducedMotion ? 1.02 : 1,
          }}
          transition={{ duration: durations.fast }}
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
            aria-invalid={!!error}
            aria-describedby={error ? `${inputId}-error` : helperText ? `${inputId}-helper` : undefined}
          />

          <AnimatePresence mode="wait">
            {isUploading ? (
              <motion.div
                key="uploading"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="text-center"
              >
                <motion.div
                  className="w-12 h-12 mx-auto mb-3 rounded-full border-4 border-primary/20 border-t-primary"
                  animate={{ rotate: 360 }}
                  transition={{ 
                    duration: prefersReducedMotion ? 0 : 1,
                    repeat: Infinity,
                    ease: 'linear',
                  }}
                />
                <p className="text-sm font-medium text-foreground">Uploading...</p>
                <div className="mt-2 w-full max-w-xs mx-auto">
                  <div className="flex justify-between text-xs text-muted-foreground mb-1">
                    <span>{file?.name}</span>
                    <span>{uploadProgress}%</span>
                  </div>
                  <div className="h-2 bg-border rounded-full overflow-hidden">
                    <motion.div
                      className="h-full bg-primary rounded-full"
                      initial={{ width: 0 }}
                      animate={{ width: `${uploadProgress}%` }}
                      transition={{ 
                        duration: prefersReducedMotion ? 0 : durations.normal,
                        ease: easings.easeOut,
                      }}
                    />
                  </div>
                </div>
              </motion.div>
            ) : showSuccess ? (
              <motion.div
                key="success"
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.9 }}
                className="text-center"
              >
                <motion.div
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  transition={{ 
                    type: 'spring',
                    stiffness: 300,
                    damping: 20,
                  }}
                >
                  <CheckCircle className="w-12 h-12 mx-auto mb-3 text-success" />
                </motion.div>
                <p className="text-sm font-medium text-success">Upload complete!</p>
                {file && (
                  <p className="text-xs text-muted-foreground mt-1 truncate max-w-xs mx-auto">
                    {file.name}
                  </p>
                )}
                <p className="text-xs text-muted-foreground mt-2">
                  Click or drag to replace
                </p>
              </motion.div>
            ) : file ? (
              <motion.div
                key="file-selected"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="text-center"
              >
                <FileText className="w-12 h-12 mx-auto mb-3 text-primary" />
                <p className="text-sm font-medium text-foreground truncate max-w-xs mx-auto">
                  {file.name}
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  Click or drag to replace
                </p>
              </motion.div>
            ) : (
              <motion.div
                key="empty"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="text-center"
              >
                <motion.div
                  animate={isDragging ? { y: -5 } : { y: 0 }}
                  transition={{ duration: durations.fast }}
                >
                  <Upload className={cn(
                    'w-12 h-12 mx-auto mb-3 transition-colors',
                    isDragging ? 'text-primary' : 'text-muted-foreground'
                  )} />
                </motion.div>
                <p className="text-sm font-medium text-foreground">
                  {isDragging ? 'Drop file here' : 'Click to upload or drag and drop'}
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  {accept.split(',').join(', ')} files accepted
                </p>
              </motion.div>
            )}
          </AnimatePresence>
        </motion.div>

        {/* Error message with animation */}
        <AnimatePresence>
          {error && (
            <motion.div
              initial={{ opacity: 0, height: 0, y: -10 }}
              animate={{ opacity: 1, height: 'auto', y: 0 }}
              exit={{ opacity: 0, height: 0, y: -10 }}
              transition={{ duration: prefersReducedMotion ? 0 : durations.fast }}
              className="flex items-center gap-1.5 mt-2"
            >
              <AlertCircle className="h-4 w-4 text-destructive flex-shrink-0" />
              <p 
                id={`${inputId}-error`}
                className="text-sm text-destructive"
                role="alert"
              >
                {error}
              </p>
            </motion.div>
          )}
        </AnimatePresence>

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
