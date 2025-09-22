import React, { useState } from 'react'
import { uploadFile, STORAGE_CONFIGS, deleteFile } from '@/lib/storage'
import { Button } from '@/components/ui/Button'

export function StorageExample() {
  const [uploading, setUploading] = useState(false)
  const [uploadResult, setUploadResult] = useState<string>('')

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return

    setUploading(true)
    setUploadResult('')

    try {
      // Upload to public documents bucket
      const result = await uploadFile(file, STORAGE_CONFIGS.documents)
      
      if (result.success) {
        setUploadResult(`✅ Upload successful! URL: ${result.url}`)
      } else {
        setUploadResult(`❌ Upload failed: ${result.error}`)
      }
    } catch (error) {
      setUploadResult(`❌ Error: ${error instanceof Error ? error.message : 'Unknown error'}`)
    } finally {
      setUploading(false)
    }
  }

  return (
    <div className="p-6 bg-white rounded-lg shadow">
      <h3 className="text-lg font-semibold mb-4">Storage Upload Example</h3>
      
      <div className="space-y-4">
        <div>
          <label className="block text-sm font-medium mb-2">
            Upload File
          </label>
          <input
            type="file"
            onChange={handleFileUpload}
            disabled={uploading}
            accept=".pdf,.doc,.docx,.jpg,.jpeg,.png"
            className="block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100"
          />
        </div>

        {uploading && (
          <div className="text-blue-600">
            Uploading...
          </div>
        )}

        {uploadResult && (
          <div className={`p-3 rounded ${
            uploadResult.includes('✅') ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'
          }`}>
            {uploadResult}
          </div>
        )}

        <div className="text-sm text-gray-600">
          <p><strong>Available buckets:</strong></p>
          <ul className="list-disc list-inside mt-1">
            <li>documents (public) - for general documents</li>
            <li>application-documents (private) - for sensitive files</li>
            <li>app_docs (public) - for app documents</li>
          </ul>
        </div>
      </div>
    </div>
  )
}