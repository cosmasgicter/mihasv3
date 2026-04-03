import { useState, useCallback } from 'react'
import { compressImage } from '@/lib/utils'

interface UseImageCompressionOptions {
  maxWidth?: number
  maxHeight?: number
  quality?: number
  autoCompress?: boolean
}

interface CompressionResult {
  originalFile: File
  compressedFile: File
  originalSize: number
  compressedSize: number
  compressionRatio: number
}

export function useImageCompression({
  maxWidth = 1920,
  maxHeight = 1080,
  quality = 0.8,
  autoCompress = true
}: UseImageCompressionOptions = {}) {
  const [isCompressing, setIsCompressing] = useState(false)
  const [compressionResults, setCompressionResults] = useState<CompressionResult[]>([])

  const shouldCompress = useCallback((file: File): boolean => {
    if (!file.type.startsWith('image/')) return false
    if (!autoCompress) return false
    
    // Compress if file is larger than 1MB or if it's a high-resolution image
    return file.size > 1024 * 1024
  }, [autoCompress])

  const compressFiles = useCallback(async (files: File[]): Promise<File[]> => {
    setIsCompressing(true)
    const results: CompressionResult[] = []
    const processedFiles: File[] = []

    try {
      for (const file of files) {
        if (shouldCompress(file)) {
          const compressedFile = await compressImage(file, maxWidth, maxHeight, quality)
          
          const result: CompressionResult = {
            originalFile: file,
            compressedFile,
            originalSize: file.size,
            compressedSize: compressedFile.size,
            compressionRatio: (1 - compressedFile.size / file.size) * 100
          }
          
          results.push(result)
          processedFiles.push(compressedFile)
        } else {
          processedFiles.push(file)
        }
      }
      
      setCompressionResults(prev => [...prev, ...results])
      return processedFiles
    } finally {
      setIsCompressing(false)
    }
  }, [shouldCompress, maxWidth, maxHeight, quality])

  const compressFile = useCallback(async (file: File): Promise<File> => {
    const [result] = await compressFiles([file])
    return result!
  }, [compressFiles])

  const clearResults = useCallback(() => {
    setCompressionResults([])
  }, [])

  const getTotalSavings = useCallback(() => {
    return compressionResults.reduce((total, result) => {
      return total + (result.originalSize - result.compressedSize)
    }, 0)
  }, [compressionResults])

  const getAverageCompression = useCallback(() => {
    if (compressionResults.length === 0) return 0
    
    const totalRatio = compressionResults.reduce((total, result) => {
      return total + result.compressionRatio
    }, 0)
    
    return totalRatio / compressionResults.length
  }, [compressionResults])

  return {
    isCompressing,
    compressionResults,
    compressFile,
    compressFiles,
    clearResults,
    getTotalSavings,
    getAverageCompression,
    shouldCompress
  }
}