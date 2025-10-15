// Simple test utility to verify upload system works
import { uploadApplicationFile } from '@/lib/storage'

export async function testUploadSystem() {
  
  // Create a simple test file
  const testContent = 'This is a test file for upload verification'
  const testFile = new File([testContent], 'test-document.txt', { type: 'text/plain' })
  
  try {
    const result = await uploadApplicationFile(
      testFile,
      'test-user-id',
      'test-application-id',
      'test_document'
    )
    
    if (result.success && result.url) {
      return { success: true, url: result.url }
    } else {
      console.error('❌ Upload failed:', result.error)
      return { success: false, error: result.error }
    }
  } catch (error) {
    console.error('❌ Upload system error:', error)
    return { success: false, error: error instanceof Error ? error.message : 'Unknown error' }
  }
}

// Test function for browser console
if (typeof window !== 'undefined') {
  (window as any).testUpload = testUploadSystem
}