import React, { useState, useRef } from 'react'
import { Button } from '@/components/ui/Button'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/Dialog'
import { supabase } from '@/lib/supabase'
import { Upload, FileText, AlertTriangle, CheckCircle, XCircle, Users, Download } from 'lucide-react'
import { sanitizeForLog, sanitizeText, sanitizeEmail } from '@/lib/sanitize'

interface UserImportProps {
  isOpen: boolean
  onClose: () => void
  onImportComplete: () => void
}

interface ImportResult {
  success: number
  failed: number
  errors: Array<{ row: number; error: string; data?: any }>
  duplicates: number
}

interface UserData {
  full_name: string
  email: string
  phone?: string
  role: string
  password?: string
}

const REQUIRED_FIELDS = ['full_name', 'email', 'role']
const VALID_ROLES = ['student', 'admissions_officer', 'registrar', 'finance_officer', 'academic_head', 'admin']

export function UserImport({ isOpen, onClose, onImportComplete }: UserImportProps) {
  const [file, setFile] = useState<File | null>(null)
  const [importing, setImporting] = useState(false)
  const [importResult, setImportResult] = useState<ImportResult | null>(null)
  const [previewData, setPreviewData] = useState<UserData[]>([])
  const [showPreview, setShowPreview] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = event.target.files?.[0]
    if (selectedFile) {
      setFile(selectedFile)
      setImportResult(null)
      setPreviewData([])
      setShowPreview(false)
      
      if (selectedFile.type === 'text/csv' || selectedFile.name.endsWith('.csv')) {
        parseCSVFile(selectedFile)
      } else {
        alert('Please select a CSV file.')
        setFile(null)
      }
    }
  }

  const parseCSVFile = (file: File) => {
    const reader = new FileReader()
    reader.onload = (e) => {
      const text = e.target?.result as string
      const lines = text.split('\n').filter(line => line.trim())
      
      if (lines.length < 2) {
        alert('CSV file must have at least a header row and one data row.')
        setFile(null)
        return
      }

      const headers = lines[0].split(',').map(h => h.trim().toLowerCase())
      const data: UserData[] = []
      
      // Check if required fields are present
      const missingFields = REQUIRED_FIELDS.filter(field => 
        !headers.some(h => h.includes(field.toLowerCase()) || field.toLowerCase().includes(h))
      )
      
      if (missingFields.length > 0) {
        alert(`Missing required fields: ${missingFields.join(', ')}`)
        setFile(null)
        return
      }

      for (let i = 1; i < lines.length && i <= 6; i++) { // Preview first 5 rows
        const values = lines[i].split(',').map(v => v.trim().replace(/"/g, ''))
        const userData: any = {}
        
        headers.forEach((header, index) => {
          if (header.includes('name') || header.includes('full_name')) {
            userData.full_name = sanitizeText(values[index])
          } else if (header.includes('email')) {
            userData.email = sanitizeEmail(values[index])
          } else if (header.includes('phone')) {
            userData.phone = sanitizeText(values[index])
          } else if (header.includes('role')) {
            userData.role = sanitizeText(values[index])
          } else if (header.includes('password')) {
            userData.password = sanitizeText(values[index])
          }
        })
        
        if (userData.full_name && userData.email && userData.role) {
          data.push(userData)
        }
      }
      
      setPreviewData(data)
      setShowPreview(true)
    }
    reader.readAsText(file)
  }

  const validateUserData = (userData: UserData, rowIndex: number): string | null => {
    if (!userData.full_name?.trim()) {
      return `Row ${rowIndex}: Full name is required`
    }
    
    if (!userData.email?.trim()) {
      return `Row ${rowIndex}: Email is required`
    }
    
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(userData.email)) {
      return `Row ${rowIndex}: Invalid email format`
    }
    
    if (!userData.role?.trim()) {
      return `Row ${rowIndex}: Role is required`
    }
    
    if (!VALID_ROLES.includes(userData.role.toLowerCase())) {
      return `Row ${rowIndex}: Invalid role. Must be one of: ${VALID_ROLES.join(', ')}`
    }
    
    return null
  }

  const handleImport = async () => {
    if (!file) return

    try {
      setImporting(true)
      const reader = new FileReader()
      
      reader.onload = async (e) => {
        const text = e.target?.result as string
        const lines = text.split('\n').filter(line => line.trim())
        const headers = lines[0].split(',').map(h => h.trim().toLowerCase())
        
        const result: ImportResult = {
          success: 0,
          failed: 0,
          errors: [],
          duplicates: 0
        }

        for (let i = 1; i < lines.length; i++) {
          const values = lines[i].split(',').map(v => v.trim().replace(/"/g, ''))
          const userData: any = {}
          
          headers.forEach((header, index) => {
            if (header.includes('name') || header.includes('full_name')) {
              userData.full_name = sanitizeText(values[index])
            } else if (header.includes('email')) {
              userData.email = sanitizeEmail(values[index])
            } else if (header.includes('phone')) {
              userData.phone = sanitizeText(values[index])
            } else if (header.includes('role')) {
              userData.role = sanitizeText(values[index])?.toLowerCase()
            } else if (header.includes('password')) {
              userData.password = sanitizeText(values[index])
            }
          })

          // Validate data
          const validationError = validateUserData(userData, i + 1)
          if (validationError) {
            result.failed++
            result.errors.push({ row: i + 1, error: validationError, data: userData })
            continue
          }

          try {
            // Check for existing user
            const { data: existingUser } = await supabase
              .from('user_profiles')
              .select('email')
              .eq('email', userData.email)
              .single()

            if (existingUser) {
              result.duplicates++
              result.failed++
              result.errors.push({ 
                row: i + 1, 
                error: `User with email ${userData.email} already exists`,
                data: userData 
              })
              continue
            }

            // Create auth user
            const password = userData.password || `temp${Math.random().toString(36).slice(-8)}`
            const { data: authData, error: authError } = await supabase.auth.signUp({
              email: userData.email,
              password: password,
            })

            if (authError) throw authError
            if (!authData.user) throw new Error('Failed to create auth user')

            // Create user profile
            const { error: profileError } = await supabase
              .from('user_profiles')
              .insert({
                user_id: authData.user.id,
                full_name: userData.full_name,
                email: userData.email,
                phone: userData.phone,
                role: userData.role
              })

            if (profileError) throw profileError

            result.success++
          } catch (error) {
            result.failed++
            const errorMessage = error instanceof Error ? error.message : 'Unknown error'
            result.errors.push({ 
              row: i + 1, 
              error: errorMessage,
              data: userData 
            })
          }
        }

        setImportResult(result)
        if (result.success > 0) {
          onImportComplete()
        }
      }

      reader.readAsText(file)
    } catch (error) {
      console.error('Import failed:', sanitizeForLog(error))
      alert('Import failed. Please try again.')
    } finally {
      setImporting(false)
    }
  }

  const downloadTemplate = () => {
    const template = [
      'full_name,email,phone,role,password',
      'John Doe,john.doe@example.com,+1234567890,student,password123',
      'Jane Smith,jane.smith@example.com,+0987654321,admissions_officer,password456'
    ].join('\n')

    const blob = new Blob([template], { type: 'text/csv;charset=utf-8;' })
    const link = document.createElement('a')
    const url = URL.createObjectURL(blob)
    link.setAttribute('href', url)
    link.setAttribute('download', 'user_import_template.csv')
    link.style.visibility = 'hidden'
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
  }

  const resetImport = () => {
    setFile(null)
    setImportResult(null)
    setPreviewData([])
    setShowPreview(false)
    if (fileInputRef.current) {
      fileInputRef.current.value = ''
    }
  }

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center space-x-2">
            <Upload className="h-5 w-5 text-blue-600" />
            <span>Import Users</span>
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-6">
          {!importResult ? (
            <>
              {/* Instructions */}
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                <h3 className="font-medium text-blue-900 mb-2">Import Instructions</h3>
                <ul className="text-sm text-blue-700 space-y-1">
                  <li>• Upload a CSV file with user data</li>
                  <li>• Required fields: full_name, email, role</li>
                  <li>• Optional fields: phone, password</li>
                  <li>• Valid roles: {VALID_ROLES.join(', ')}</li>
                  <li>• If password is not provided, a temporary password will be generated</li>
                </ul>
              </div>

              {/* Template Download */}
              <div className="flex justify-center">
                <Button
                  variant="outline"
                  onClick={downloadTemplate}
                  className="text-blue-600 border-blue-300 hover:bg-blue-50"
                >
                  <Download className="h-4 w-4 mr-2" />
                  Download Template
                </Button>
              </div>

              {/* File Upload */}
              <div className="border-2 border-dashed border-gray-300 rounded-lg p-8 text-center hover:border-gray-400 transition-colors">
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".csv"
                  onChange={handleFileSelect}
                  className="hidden"
                />
                <FileText className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                <h3 className="text-lg font-medium text-gray-900 mb-2">
                  {file ? file.name : 'Select CSV File'}
                </h3>
                <p className="text-gray-600 mb-4">
                  {file ? 'File selected. Click Import to proceed.' : 'Choose a CSV file to import users'}
                </p>
                <Button
                  onClick={() => fileInputRef.current?.click()}
                  variant="outline"
                  className="mr-2"
                >
                  <Upload className="h-4 w-4 mr-2" />
                  {file ? 'Change File' : 'Select File'}
                </Button>
                {file && (
                  <Button onClick={resetImport} variant="outline">
                    Clear
                  </Button>
                )}
              </div>

              {/* Preview */}
              {showPreview && previewData.length > 0 && (
                <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
                  <h3 className="font-medium text-gray-900 mb-3">Preview (First 5 rows)</h3>
                  <div className="overflow-x-auto">
                    <table className="min-w-full divide-y divide-gray-200">
                      <thead className="bg-gray-100">
                        <tr>
                          <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Name</th>
                          <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Email</th>
                          <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Phone</th>
                          <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Role</th>
                        </tr>
                      </thead>
                      <tbody className="bg-white divide-y divide-gray-200">
                        {previewData.map((user, index) => (
                          <tr key={index}>
                            <td className="px-3 py-2 text-sm text-gray-900">{sanitizeText(user.full_name)}</td>
                            <td className="px-3 py-2 text-sm text-gray-900">{sanitizeText(user.email)}</td>
                            <td className="px-3 py-2 text-sm text-gray-900">{sanitizeText(user.phone) || '-'}</td>
                            <td className="px-3 py-2 text-sm text-gray-900">
                              <span className="px-2 py-1 bg-blue-100 text-blue-800 rounded text-xs">
                                {sanitizeText(user.role)}
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </>
          ) : (
            /* Import Results */
            <div className="space-y-4">
              <div className="text-center">
                <div className="flex justify-center space-x-8 mb-4">
                  <div className="text-center">
                    <div className="flex items-center justify-center w-12 h-12 bg-green-100 rounded-full mb-2">
                      <CheckCircle className="h-6 w-6 text-green-600" />
                    </div>
                    <p className="text-2xl font-bold text-green-600">{importResult.success}</p>
                    <p className="text-sm text-gray-600">Successful</p>
                  </div>
                  <div className="text-center">
                    <div className="flex items-center justify-center w-12 h-12 bg-red-100 rounded-full mb-2">
                      <XCircle className="h-6 w-6 text-red-600" />
                    </div>
                    <p className="text-2xl font-bold text-red-600">{importResult.failed}</p>
                    <p className="text-sm text-gray-600">Failed</p>
                  </div>
                  {importResult.duplicates > 0 && (
                    <div className="text-center">
                      <div className="flex items-center justify-center w-12 h-12 bg-yellow-100 rounded-full mb-2">
                        <AlertTriangle className="h-6 w-6 text-yellow-600" />
                      </div>
                      <p className="text-2xl font-bold text-yellow-600">{importResult.duplicates}</p>
                      <p className="text-sm text-gray-600">Duplicates</p>
                    </div>
                  )}
                </div>
              </div>

              {importResult.errors.length > 0 && (
                <div className="bg-red-50 border border-red-200 rounded-lg p-4 max-h-60 overflow-y-auto">
                  <h3 className="font-medium text-red-900 mb-3">Import Errors</h3>
                  <div className="space-y-2">
                    {importResult.errors.map((error, index) => (
                      <div key={index} className="text-sm text-red-700 bg-white p-2 rounded border">
                        <p className="font-medium">Row {error.row}: {error.error}</p>
                        {error.data && (
                          <p className="text-xs text-red-600 mt-1">
                            Data: {sanitizeForLog(JSON.stringify(error.data))}
                          </p>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        <DialogFooter>
          {!importResult ? (
            <>
              <Button variant="outline" onClick={onClose} disabled={importing}>
                Cancel
              </Button>
              <Button
                onClick={handleImport}
                loading={importing}
                disabled={!file || !showPreview}
                className="bg-blue-600 hover:bg-blue-700 text-white"
              >
                <Upload className="h-4 w-4 mr-2" />
                Import Users
              </Button>
            </>
          ) : (
            <>
              <Button variant="outline" onClick={resetImport}>
                Import More
              </Button>
              <Button onClick={onClose} className="bg-blue-600 hover:bg-blue-700 text-white">
                Close
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}