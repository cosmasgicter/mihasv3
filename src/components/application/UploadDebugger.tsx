import React, { useState } from 'react'
import { Button } from '@/components/ui/Button'
import { Upload, CheckCircle, AlertCircle, X } from 'lucide-react'
import { uploadApplicationFile } from '@/lib/storage'
import { useAuth } from '@/contexts/AuthContext'
import { sanitizeForLog } from '@/lib/security'

export function UploadDebugger() {
  const { user } = useAuth()
  const [file, setFile] = useState<File | null>(null)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [progress, setProgress] = useState(0)
  const [logs, setLogs] = useState<string[]>([])

  const addLog = (message: string) => {
    const timestamp = new Date().toLocaleTimeString()
    const sanitizedMessage = sanitizeForLog(message)
    setLogs(prev => [...prev, `[${timestamp}] ${sanitizedMessage}`])
    console.log('[Upload Debug]', sanitizedMessage)
  }

  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = event.target.files?.[0]
    if (selectedFile) {
      setFile(selectedFile)
      setError('')
      setSuccess('')
      setLogs([])
      addLog(`File selected: ${selectedFile.name} (${selectedFile.size} bytes, ${selectedFile.type})`)
    }
  }

  const handleUpload = async () => {
    if (!file || !user) {
      setError('No file selected or user not authenticated')
      return
    }

    setUploading(true)
    setError('')
    setSuccess('')
    setProgress(0)
    
    addLog('Starting upload process...')

    // Simulate progress
    const progressInterval = setInterval(() => {
      setProgress(prev => {
        if (prev < 90) {
          const newProgress = prev + 10
          addLog(`Progress: ${newProgress}%`)
          return newProgress
        }
        return prev
      })
    }, 500)

    try {
      addLog(`Uploading file: ${file.name}`)
      addLog(`User ID: ${user.id}`)
      addLog(`Application ID: test-${Date.now()}`)
      
      const result = await uploadApplicationFile(
        file, 
        user.id, 
        `test-${Date.now()}`, 
        'debug-upload'
      )
      
      clearInterval(progressInterval)
      setProgress(100)
      addLog('Upload completed')
      
      if (result.success) {
        setSuccess(`Upload successful! URL: ${result.url}`)
        addLog(`Success: ${result.url}`)
      } else {
        setError(result.error || 'Upload failed')
        addLog(`Error: ${result.error}`)
      }
    } catch (err) {
      clearInterval(progressInterval)
      setProgress(0)
      const errorMessage = err instanceof Error ? err.message : 'Unknown error'
      setError(errorMessage)
      addLog(`Exception: ${errorMessage}`)
    } finally {
      setUploading(false)
      addLog('Upload process finished')
    }
  }

  const clearLogs = () => {
    setLogs([])
    setError('')
    setSuccess('')
    setProgress(0)
  }

  return (
    <div className="max-w-2xl mx-auto p-6 bg-white rounded-lg shadow">
      <h2 className="text-lg font-semibold mb-4">Upload Debugger</h2>
      
      <div className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Select File to Test Upload
          </label>
          <input
            type="file"
            accept=".pdf,.jpg,.jpeg,.png"
            onChange={handleFileSelect}
            className="w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100"
          />
        </div>

        {file && (
          <div className="p-3 bg-gray-50 rounded">
            <p className="text-sm">
              <strong>Selected:</strong> {file.name} ({(file.size / 1024 / 1024).toFixed(2)} MB)
            </p>
          </div>
        )}

        <div className="flex gap-2">
          <Button
            onClick={handleUpload}
            disabled={!file || uploading || !user}
            className="flex-1"
          >
            {uploading ? 'Uploading...' : 'Test Upload'}
          </Button>
          <Button
            onClick={clearLogs}
            variant="outline"
          >
            Clear Logs
          </Button>
        </div>

        {uploading && (
          <div>
            <div className="flex justify-between text-sm text-gray-600 mb-1">
              <span>Progress</span>
              <span>{progress}%</span>
            </div>
            <div className="w-full bg-gray-200 rounded-full h-2">
              <div 
                className="bg-blue-600 h-2 rounded-full transition-all duration-300"
                style={{ width: `${progress}%` }}
              />
            </div>
          </div>
        )}

        {error && (
          <div className="p-3 bg-red-50 border border-red-200 rounded">
            <div className="flex items-center text-sm text-red-700">
              <AlertCircle className="h-4 w-4 mr-2 flex-shrink-0" />
              <span>{error}</span>
            </div>
          </div>
        )}

        {success && (
          <div className="p-3 bg-green-50 border border-green-200 rounded">
            <div className="flex items-center text-sm text-green-700">
              <CheckCircle className="h-4 w-4 mr-2 flex-shrink-0" />
              <span>{success}</span>
            </div>
          </div>
        )}

        {logs.length > 0 && (
          <div className="mt-4">
            <h3 className="text-sm font-medium text-gray-700 mb-2">Debug Logs:</h3>
            <div className="bg-gray-900 text-green-400 p-3 rounded text-xs font-mono max-h-64 overflow-y-auto">
              {logs.map((log, index) => (
                <div key={index}>{log}</div>
              ))}
            </div>
          </div>
        )}

        {!user && (
          <div className="p-3 bg-yellow-50 border border-yellow-200 rounded">
            <p className="text-sm text-yellow-700">
              Please sign in to test file uploads
            </p>
          </div>
        )}
      </div>
    </div>
  )
}