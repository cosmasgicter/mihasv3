import React, { useState, useRef } from 'react'
import { Button } from '@/components/ui/Button'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/Dialog'
import { apiClient } from '@/services/client'
import { Upload, FileText, AlertTriangle, CheckCircle, XCircle, Users, Download } from 'lucide-react'
import { sanitizeForLog, sanitizeText, sanitizeEmail } from '@/lib/sanitize'
import { toast } from '@/hooks/useToast'

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
const VALID_ROLES = ['student', 'reviewer', 'admin', 'super_admin']

function splitFullName(fullName: string): { first_name: string; last_name: string } {
  const normalized = fullName.trim().replace(/\s+/g, ' ')
  if (!normalized) {
    return { first_name: '', last_name: '' }
  }

  const [first_name, ...rest] = normalized.split(' ')
  return {
    first_name: first_name ?? '',
    last_name: rest.join(' ') || (first_name ?? ''),
  }
}

async function checkUserExists(email: string): Promise<boolean> {
  const result = await apiClient.request<{
    results?: Array<{ email?: string }>
  }>(`/admin/users/?search=${encodeURIComponent(email)}&include_inactive=true`)

  return Boolean(
    result?.results?.some((user) => user.email?.toLowerCase() === email.toLowerCase())
  )
}

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
        toast.error('Error', 'Please select a CSV file')
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
        toast.error('Error', 'CSV file must have at least a header row and one data row')
        setFile(null)
        return
      }

      const headers = lines[0]!.split(',').map(h => h.trim().toLowerCase())
      const data: UserData[] = []
      
      // Check if required fields are present
      const missingFields = REQUIRED_FIELDS.filter(field => 
        !headers.some(h => h.includes(field.toLowerCase()) || field.toLowerCase().includes(h))
      )
      
      if (missingFields.length > 0) {
        toast.error('Missing Fields', missingFields.join(', '))
        setFile(null)
        return
      }

      for (let i = 1; i < lines.length && i <= 6; i++) { // Preview first 5 rows
        const values = lines[i]!.split(',').map(v => v.trim().replace(/"/g, ''))
        const userData: any = {}
        
        headers.forEach((header, index) => {
          if (header.includes('name') || header.includes('full_name')) {
            userData.full_name = sanitizeText(values[index] ?? '')
          } else if (header.includes('email')) {
            userData.email = sanitizeEmail(values[index] ?? '')
          } else if (header.includes('phone')) {
            userData.phone = sanitizeText(values[index] ?? '')
          } else if (header.includes('role')) {
            userData.role = sanitizeText(values[index] ?? '')
          } else if (header.includes('password')) {
            userData.password = sanitizeText(values[index] ?? '')
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
        const headers = lines[0]!.split(',').map(h => h.trim().toLowerCase())
        
        const result: ImportResult = {
          success: 0,
          failed: 0,
          errors: [],
          duplicates: 0
        }

        for (let i = 1; i < lines.length; i++) {
          const values = lines[i]!.split(',').map(v => v.trim().replace(/"/g, ''))
          const userData: any = {}
          
          headers.forEach((header, index) => {
            if (header.includes('name') || header.includes('full_name')) {
              userData.full_name = sanitizeText(values[index] ?? '')
            } else if (header.includes('email')) {
              userData.email = sanitizeEmail(values[index] ?? '')
            } else if (header.includes('phone')) {
              userData.phone = sanitizeText(values[index] ?? '')
            } else if (header.includes('role')) {
              userData.role = sanitizeText(values[index] ?? '')?.toLowerCase()
            } else if (header.includes('password')) {
              userData.password = sanitizeText(values[index] ?? '')
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
            const userExists = await checkUserExists(userData.email)
            if (userExists) {
              result.duplicates++
              result.failed++
              result.errors.push({ 
                row: i + 1, 
                error: `User with email ${userData.email} already exists`,
                data: userData 
              })
              continue
            }

            // Create user via admin register endpoint
            const password = userData.password || `temp${Math.random().toString(36).slice(-8)}`
            const createResult = await apiClient.request<{ id?: string; message?: string }>('/admin/users/', {
              method: 'POST',
              body: JSON.stringify({
                email: userData.email,
                password: password,
                ...splitFullName(userData.full_name),
                phone: userData.phone,
                role: userData.role
              })
            })

            if (!createResult?.id) {
              throw new Error(createResult?.message || 'Failed to create user')
            }

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
      toast.error('Import Failed', 'Please try again')
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
            <Upload className="h-5 w-5 text-primary" />
            <span>Import Users</span>
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-6">
          {!importResult ? (
            <>
              {/* Instructions */}
              <div className="bg-primary/5 border border-primary/30 rounded-lg p-4">
                <h3 className="font-medium text-primary-foreground mb-2">Import Instructions</h3>
                <ul className="text-sm text-primary space-y-1">
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
                  className="text-primary border-blue-300 hover:bg-primary/5"
                >
                  <Download className="h-4 w-4 mr-2" />
                  Download Template
                </Button>
              </div>

              {/* File Upload */}
              <div className="border-2 border-dashed border-input rounded-lg p-8 text-center hover:border-input transition-colors">
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".csv"
                  onChange={handleFileSelect}
                  className="hidden"
                />
                <FileText className="h-12 w-12 text-foreground mx-auto mb-4" />
                <h3 className="text-lg font-medium text-foreground mb-2">
                  {file ? file.name : 'Select CSV File'}
                </h3>
                <p className="text-foreground mb-4">
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
                <div className="bg-muted border border-border rounded-lg p-4">
                  <h3 className="font-medium text-foreground mb-3">Preview (First 5 rows)</h3>
                  <div className="overflow-x-auto">
                    <table className="min-w-full divide-y divide-border">
                      <thead className="bg-accent">
                        <tr>
                          <th scope="col" className="px-3 py-2 text-left text-xs font-medium text-foreground uppercase">Name</th>
                          <th scope="col" className="px-3 py-2 text-left text-xs font-medium text-foreground uppercase">Email</th>
                          <th scope="col" className="px-3 py-2 text-left text-xs font-medium text-foreground uppercase">Phone</th>
                          <th scope="col" className="px-3 py-2 text-left text-xs font-medium text-foreground uppercase">Role</th>
                        </tr>
                      </thead>
                      <tbody className="bg-card divide-y divide-border">
                        {previewData.map((user, index) => (
                          <tr key={index}>
                            <td className="px-3 py-2 text-sm text-foreground">{sanitizeText(user.full_name)}</td>
                            <td className="px-3 py-2 text-sm text-foreground">{sanitizeText(user.email)}</td>
                            <td className="px-3 py-2 text-sm text-foreground">{sanitizeText(user.phone ?? '') || '-'}</td>
                            <td className="px-3 py-2 text-sm text-foreground">
                              <span className="px-2 py-1 bg-primary/10 text-primary-foreground rounded text-xs">
                                {sanitizeText(user.role ?? '')}
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
                    <div className="flex items-center justify-center w-12 h-12 bg-accent/10 rounded-full mb-2">
                      <CheckCircle className="h-6 w-6 text-accent" />
                    </div>
                    <p className="text-2xl font-bold text-warning-strong">{importResult.success}</p>
                    <p className="text-sm text-foreground">Successful</p>
                  </div>
                  <div className="text-center">
                    <div className="flex items-center justify-center w-12 h-12 bg-destructive/10 rounded-full mb-2">
                      <XCircle className="h-6 w-6 text-destructive" />
                    </div>
                    <p className="text-2xl font-bold text-destructive">{importResult.failed}</p>
                    <p className="text-sm text-foreground">Failed</p>
                  </div>
                  {importResult.duplicates > 0 && (
                    <div className="text-center">
                      <div className="flex items-center justify-center w-12 h-12 bg-accent/10 rounded-full mb-2">
                        <AlertTriangle className="h-6 w-6 text-accent" />
                      </div>
                      <p className="text-2xl font-bold text-warning-strong">{importResult.duplicates}</p>
                      <p className="text-sm text-foreground">Duplicates</p>
                    </div>
                  )}
                </div>
              </div>

              {importResult.errors.length > 0 && (
                <div className="bg-destructive/5 border border-destructive/30 rounded-lg p-4 max-h-60 overflow-y-auto">
                  <h3 className="font-medium text-red-900 mb-3">Import Errors</h3>
                  <div className="space-y-2">
                    {importResult.errors.map((error, index) => (
                      <div key={index} className="text-sm text-error bg-card p-2 rounded border">
                        <p className="font-medium">Row {error.row}: {error.error}</p>
                        {error.data && (
                          <p className="text-xs text-destructive mt-1">
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
                className="bg-primary hover:bg-primary text-white"
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
              <Button onClick={onClose} className="bg-primary hover:bg-primary text-white">
                Close
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
