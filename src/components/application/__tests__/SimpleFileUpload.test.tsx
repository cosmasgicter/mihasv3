import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, fireEvent, waitFor, screen } from '@testing-library/react'
import React from 'react'

import { SimpleFileUpload } from '../SimpleFileUpload'
import { uploadApplicationFile } from '@/lib/storage'

vi.mock('@/lib/storage', async () => {
  const actual = await vi.importActual<typeof import('@/lib/storage')>('@/lib/storage')
  return {
    ...actual,
    uploadApplicationFile: vi.fn()
  }
})

vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({
    user: { id: 'user-123' }
  })
}))

vi.mock('@/hooks/useImageCompression', () => ({
  useImageCompression: () => ({
    compressFile: (file: File) => Promise.resolve(file),
    isCompressing: false,
    compressionResults: [],
    clearResults: vi.fn()
  })
}))

describe('SimpleFileUpload', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    vi.mocked(uploadApplicationFile).mockResolvedValue({
      success: true,
      url: 'https://storage.example/files/document.pdf',
      path: 'app_docs/user-123/app-456/document.pdf'
    })
  })

  it('uploads dropped files through the storage client and reports persisted metadata', async () => {
    const handleUploadComplete = vi.fn()

    render(
      <SimpleFileUpload
        uploadedFiles={[]}
        uploadingFiles={[]}
        uploadProgress={{}}
        onRemoveFile={() => {}}
        applicationId="app-456"
        fileType="result_slip"
        onUploadComplete={handleUploadComplete}
      />
    )

    const dropTarget = screen.getByTestId('file-upload-dropzone')
    const file = new File(['file content'], 'document.pdf', { type: 'application/pdf' })

    fireEvent.drop(dropTarget, {
      dataTransfer: {
        files: [file]
      }
    })

    await waitFor(() => {
      expect(uploadApplicationFile).toHaveBeenCalledWith(file, 'user-123', 'app-456', 'result_slip')
    })

    await waitFor(() => {
      expect(handleUploadComplete).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'document.pdf',
          url: 'https://storage.example/files/document.pdf',
          path: 'app_docs/user-123/app-456/document.pdf'
        })
      )
    })
  })
})
