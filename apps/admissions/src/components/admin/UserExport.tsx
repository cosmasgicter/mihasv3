import React, { useState } from 'react'
import { Button } from '@/components/ui/Button'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/Dialog'
import { exportUsersToPDF, type UserPDFFieldDefinition } from '@/lib/exportUtils'
import { UserProfile } from '@/types/database'
import { Download, FileText, FileSpreadsheet, Filter, Users, CheckSquare, Square } from 'lucide-react'
import { toast } from '@/hooks/useToast'

interface UserExportProps {
  users: UserProfile[]
  isOpen: boolean
  onClose: () => void
}

type ExportField = UserPDFFieldDefinition<UserProfile> & { description: string }

interface ExportOptions {
  format: 'csv' | 'json' | 'pdf' | 'excel'
  fields: Array<keyof UserProfile & string>
  filters: {
    roles: string[]
    dateRange: {
      start: string
      end: string
    }
    includeInactive: boolean
  }
}

const AVAILABLE_FIELDS: ExportField[] = [
  { id: 'user_id', label: 'User ID', description: 'Unique user identifier' },
  { id: 'full_name', label: 'Full Name', description: 'User\'s full name' },
  { id: 'email', label: 'Email', description: 'Email address' },
  { id: 'phone', label: 'Phone', description: 'Phone number' },
  { id: 'role', label: 'Role', description: 'User role' },
  { id: 'date_of_birth', label: 'Date of Birth', description: 'Birth date' },
  { id: 'sex', label: 'Gender', description: 'Gender' },
  { id: 'country', label: 'Residence Country', description: 'Country of residence' },
  { id: 'residence_town', label: 'Residence Town', description: 'Town or city of residence' },
  { id: 'nationality', label: 'Nationality', description: 'Nationality' },
  { id: 'address', label: 'Address', description: 'Physical address' },
  { id: 'city', label: 'City', description: 'City of residence' },
  { id: 'next_of_kin_name', label: 'Next of Kin Name', description: 'Emergency contact name' },
  { id: 'next_of_kin_phone', label: 'Next of Kin Phone', description: 'Emergency contact phone' },
  { id: 'created_at', label: 'Registration Date', description: 'Account creation date' },
  { id: 'updated_at', label: 'Last Updated', description: 'Last profile update' },
]

const AVAILABLE_ROLES = [
  'student',
  'reviewer',
  'admissions_officer',
  'registrar',
  'finance_officer',
  'academic_head',
  'admin',
  'super_admin'
]

export function UserExport({ users, isOpen, onClose }: UserExportProps) {
  const [exportOptions, setExportOptions] = useState<ExportOptions>({
    format: 'csv',
    fields: ['full_name', 'email', 'role', 'created_at'],
    filters: {
      roles: [],
      dateRange: {
        start: '',
        end: ''
      },
      includeInactive: false
    }
  })
  const [exporting, setExporting] = useState(false)

  const sanitizeFileSegment = (value: string) =>
    value
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')

  const buildExportRows = (data: UserProfile[]) =>
    data.map(user => {
      const row: Record<string, unknown> = {}

      exportOptions.fields.forEach(fieldId => {
        const field = AVAILABLE_FIELDS.find(item => item.id === fieldId)
        const rawValue = (user as Record<string, unknown>)[fieldId]
        row[field?.label || fieldId] = rawValue ?? ''
      })

      return row
    })

  const buildExportFileStem = () => {
    const datePart = new Date().toISOString().split('T')[0]
    const rolePart =
      exportOptions.filters.roles.length > 0
        ? sanitizeFileSegment(exportOptions.filters.roles.join('-'))
        : 'all-roles'
    const activityPart = exportOptions.filters.includeInactive ? 'all-users' : 'active-users'
    const dateRangePart =
      exportOptions.filters.dateRange.start || exportOptions.filters.dateRange.end
        ? sanitizeFileSegment(
            `${exportOptions.filters.dateRange.start || 'any'}-${exportOptions.filters.dateRange.end || 'any'}`
          )
        : 'all-dates'

    return `users_export_${activityPart}_${rolePart}_${dateRangePart}_${datePart}`
  }

  const handleFieldToggle = (fieldId: string) => {
    if (exportOptions.fields.includes(fieldId)) {
      setExportOptions({
        ...exportOptions,
        fields: exportOptions.fields.filter(id => id !== fieldId)
      })
    } else {
      setExportOptions({
        ...exportOptions,
        fields: [...exportOptions.fields, fieldId]
      })
    }
  }

  const handleRoleToggle = (role: string) => {
    if (exportOptions.filters.roles.includes(role)) {
      setExportOptions({
        ...exportOptions,
        filters: {
          ...exportOptions.filters,
          roles: exportOptions.filters.roles.filter(r => r !== role)
        }
      })
    } else {
      setExportOptions({
        ...exportOptions,
        filters: {
          ...exportOptions.filters,
          roles: [...exportOptions.filters.roles, role]
        }
      })
    }
  }

  const handleSelectAllFields = () => {
    if (exportOptions.fields.length === AVAILABLE_FIELDS.length) {
      setExportOptions({ ...exportOptions, fields: [] })
    } else {
      setExportOptions({ ...exportOptions, fields: AVAILABLE_FIELDS.map(f => f.id) })
    }
  }

  const handleSelectAllRoles = () => {
    if (exportOptions.filters.roles.length === AVAILABLE_ROLES.length) {
      setExportOptions({
        ...exportOptions,
        filters: { ...exportOptions.filters, roles: [] }
      })
    } else {
      setExportOptions({
        ...exportOptions,
        filters: { ...exportOptions.filters, roles: [...AVAILABLE_ROLES] }
      })
    }
  }

  const getFilteredUsers = () => {
    let filtered = users

    if (!exportOptions.filters.includeInactive) {
      filtered = filtered.filter(user => user.is_active !== false)
    }

    // Filter by roles
    if (exportOptions.filters.roles.length > 0) {
      filtered = filtered.filter(user => exportOptions.filters.roles.includes(user.role))
    }

    // Filter by date range
    if (exportOptions.filters.dateRange.start) {
      const startDate = new Date(exportOptions.filters.dateRange.start)
      filtered = filtered.filter(user => new Date(user.created_at ?? 0) >= startDate)
    }
    if (exportOptions.filters.dateRange.end) {
      const endDate = new Date(exportOptions.filters.dateRange.end)
      endDate.setHours(23, 59, 59, 999)
      filtered = filtered.filter(user => new Date(user.created_at ?? 0) <= endDate)
    }

    return filtered
  }

  const exportToCSV = (data: UserProfile[]) => {
    const exportRows = buildExportRows(data)
    const headers = Object.keys(exportRows[0] ?? {})

    const escapeCsvField = (raw: unknown): string => {
      if (raw === null || raw === undefined) return ''
      const str = String(raw).substring(0, 1000)
      if (str.includes('"') || str.includes(',') || str.includes('\n') || str.includes('\r')) {
        return `"${str.replace(/"/g, '""')}"`
      }
      return str
    }

    const rows = exportRows.map(row =>
      headers.map(header => escapeCsvField(row[header]))
    )

    const csvContent = [headers, ...rows]
      .map(row => row.join(','))
      .join('\n')

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })
    const link = document.createElement('a')
    const url = URL.createObjectURL(blob)
    link.setAttribute('href', url)
    link.setAttribute('download', `${buildExportFileStem()}.csv`)
    link.style.visibility = 'hidden'
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    URL.revokeObjectURL(url)
  }

  const exportToJSON = (data: UserProfile[]) => {
    const exportData = buildExportRows(data)

    const jsonContent = JSON.stringify({
      exportDate: new Date().toISOString(),
      totalRecords: exportData.length,
      fields: exportOptions.fields,
      filters: {
        roles: exportOptions.filters.roles,
        dateRange: exportOptions.filters.dateRange,
        includeInactive: exportOptions.filters.includeInactive
      },
      data: exportData
    }, null, 2)

    const blob = new Blob([jsonContent], { type: 'application/json;charset=utf-8;' })
    const link = document.createElement('a')
    const url = URL.createObjectURL(blob)
    link.setAttribute('href', url)
    link.setAttribute('download', `${buildExportFileStem()}.json`)
    link.style.visibility = 'hidden'
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    URL.revokeObjectURL(url)
  }

  const exportToExcel = async (data: UserProfile[]) => {
    // @ts-ignore -- xlsx is an optional peer dependency, may not have type declarations in CI
    const XLSX = await import('xlsx')
    const exportRows = buildExportRows(data)
    const worksheet = XLSX.utils.json_to_sheet(exportRows)
    const workbook = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Users')
    XLSX.writeFile(workbook, `${buildExportFileStem()}.xlsx`)
  }

  const handleExport = async () => {
    try {
      setExporting(true)
      const filteredUsers = getFilteredUsers()

      if (filteredUsers.length === 0) {
        toast.info('No Results', 'No users match the selected filters')
        return
      }

      let exportCompleted = false

      switch (exportOptions.format) {
        case 'csv':
          exportToCSV(filteredUsers)
          exportCompleted = true
          break
        case 'excel':
          await exportToExcel(filteredUsers)
          exportCompleted = true
          break
        case 'json':
          exportToJSON(filteredUsers)
          exportCompleted = true
          break
        case 'pdf': {
          const fieldLabels = exportOptions.fields
            .map(fieldId => AVAILABLE_FIELDS.find(field => field.id === fieldId)?.label || fieldId)

          const metadataLines: string[] = [
            `Fields: ${fieldLabels.join(', ')}`,
            `Total Users: ${filteredUsers.length}`
          ]

          if (exportOptions.filters.roles.length > 0) {
            metadataLines.push(`Roles: ${exportOptions.filters.roles.map(role => role.replace(/_/g, ' ')).join(', ')}`)
          }

          metadataLines.push(`Include inactive accounts: ${exportOptions.filters.includeInactive ? 'Yes' : 'No'}`)

          if (exportOptions.filters.dateRange.start || exportOptions.filters.dateRange.end) {
            metadataLines.push(
              `Registered: ${exportOptions.filters.dateRange.start || 'Any'} to ${exportOptions.filters.dateRange.end || 'Any'}`
            )
          }

          await exportUsersToPDF(filteredUsers, exportOptions.fields, AVAILABLE_FIELDS, {
            filename: `${buildExportFileStem()}.pdf`,
            metadata: metadataLines
          })
          exportCompleted = true
          break
        }
      }

      if (exportCompleted) {
        onClose()
      }
    } catch (error) {
      console.error('Export failed:', error)
      toast.error('Export Failed', 'Please try again')
    } finally {
      setExporting(false)
    }
  }

  const filteredUsers = getFilteredUsers()

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center space-x-2">
            <Download className="h-5 w-5 text-primary" />
            <span>Export Users</span>
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-6">
          {/* Export Format */}
          <div>
            <h3 className="text-lg font-medium text-foreground mb-3">Export Format</h3>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {[
                { value: 'csv', label: 'CSV', icon: <FileSpreadsheet className="h-5 w-5" />, description: 'Comma-separated values' },
                { value: 'excel', label: 'Excel', icon: <FileSpreadsheet className="h-5 w-5" />, description: 'Spreadsheet workbook' },
                { value: 'json', label: 'JSON', icon: <FileText className="h-5 w-5" />, description: 'JavaScript Object Notation' },
                { value: 'pdf', label: 'PDF', icon: <FileText className="h-5 w-5" />, description: 'Portable Document Format' }
              ].map(format => (
                <div
                  key={format.value}
                  className={`p-4 border rounded-lg cursor-pointer transition-colors ${
                    exportOptions.format === format.value
                      ? 'border-primary bg-blue-50'
                      : 'border-border hover:border-input'
                  }`}
                  onClick={() => setExportOptions({ ...exportOptions, format: format.value as typeof exportOptions.format })}
                >
                  <div className="flex items-center space-x-3">
                    <div className={`${exportOptions.format === format.value ? 'text-primary' : 'text-foreground'}`}>
                      {format.icon}
                    </div>
                    <div>
                      <h4 className="font-medium">{format.label}</h4>
                      <p className="text-sm text-foreground">{format.description}</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Fields Selection */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-lg font-medium text-foreground">Fields to Export</h3>
              <Button
                variant="outline"
                size="sm"
                onClick={handleSelectAllFields}
                className="text-xs"
              >
                {exportOptions.fields.length === AVAILABLE_FIELDS.length ? (
                  <>
                    <Square className="h-3 w-3 mr-1" />
                    Deselect All
                  </>
                ) : (
                  <>
                    <CheckSquare className="h-3 w-3 mr-1" />
                    Select All
                  </>
                )}
              </Button>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3 max-h-48 overflow-y-auto border border-border rounded-lg p-4">
              {AVAILABLE_FIELDS.map(field => (
                <div
                  key={field.id}
                  className={`p-2 border rounded cursor-pointer transition-colors ${
                    exportOptions.fields.includes(field.id)
                      ? 'border-blue-300 bg-blue-50'
                      : 'border-border hover:border-input'
                  }`}
                  onClick={() => handleFieldToggle(field.id)}
                >
                  <div className="flex items-center space-x-2">
                    {exportOptions.fields.includes(field.id) ? (
                      <CheckSquare className="h-4 w-4 text-primary" />
                    ) : (
                      <Square className="h-4 w-4 text-foreground" />
                    )}
                    <div>
                      <p className="text-sm font-medium">{field.label}</p>
                      <p className="text-xs text-foreground">{field.description}</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Filters */}
          <div>
            <h3 className="text-lg font-medium text-foreground mb-3 flex items-center">
              <Filter className="h-5 w-5 mr-2" />
              Filters
            </h3>
            
            {/* Role Filter */}
            <div className="mb-4">
              <div className="flex items-center justify-between mb-2">
                <label className="text-sm font-medium text-foreground">User Roles</label>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleSelectAllRoles}
                  className="text-xs"
                >
                  {exportOptions.filters.roles.length === AVAILABLE_ROLES.length ? 'Deselect All' : 'Select All'}
                </Button>
              </div>
              <div className="flex flex-wrap gap-2">
                {AVAILABLE_ROLES.map(role => (
                  <button
                    key={role}
                    onClick={() => handleRoleToggle(role)}
                    className={`px-3 py-1 rounded-full text-sm font-medium border transition-colors ${
                      exportOptions.filters.roles.includes(role)
                        ? 'bg-primary/10 text-primary-foreground border-blue-300'
                        : 'bg-accent text-foreground border-input hover:bg-skeleton'
                    }`}
                  >
                    {role.replace(/_/g, ' ').toUpperCase()}
                  </button>
                ))}
              </div>
            </div>

            {/* Date Range Filter */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-foreground mb-1">
                  Registration Date From
                </label>
                <input
                  type="date"
                  value={exportOptions.filters.dateRange.start}
                  onChange={(e) => setExportOptions({
                    ...exportOptions,
                    filters: {
                      ...exportOptions.filters,
                      dateRange: { ...exportOptions.filters.dateRange, start: e.target.value }
                    }
                  })}
                  className="w-full px-3 py-2 border border-input rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-foreground mb-1">
                  Registration Date To
                </label>
                <input
                  type="date"
                  value={exportOptions.filters.dateRange.end}
                  onChange={(e) => setExportOptions({
                    ...exportOptions,
                    filters: {
                      ...exportOptions.filters,
                      dateRange: { ...exportOptions.filters.dateRange, end: e.target.value }
                    }
                  })}
                  className="w-full px-3 py-2 border border-input rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                />
              </div>
            </div>

            <div className="mt-4 flex items-center gap-3 rounded-lg border border-border p-3">
              <input
                id="include-inactive-users"
                type="checkbox"
                checked={exportOptions.filters.includeInactive}
                onChange={(e) => setExportOptions({
                  ...exportOptions,
                  filters: {
                    ...exportOptions.filters,
                    includeInactive: e.target.checked
                  }
                })}
                className="h-4 w-4 rounded border-input"
              />
              <label htmlFor="include-inactive-users" className="text-sm text-foreground">
                Include inactive/deactivated accounts in this export
              </label>
            </div>
          </div>

          {/* Preview */}
          <div className="bg-muted border border-border rounded-lg p-4">
            <div className="flex items-center justify-between mb-2">
              <h4 className="font-medium text-foreground flex items-center">
                <Users className="h-4 w-4 mr-2" />
                Export Preview
              </h4>
              <span className="text-sm text-foreground">
                {filteredUsers.length} users will be exported
              </span>
            </div>
            <div className="text-sm text-foreground">
              <p>Format: {exportOptions.format.toUpperCase()}</p>
              <p>Fields: {exportOptions.fields.length} selected</p>
              {exportOptions.filters.roles.length > 0 && (
                <p>Roles: {exportOptions.filters.roles.join(', ')}</p>
              )}
              <p>Account scope: {exportOptions.filters.includeInactive ? 'Active and inactive users' : 'Active users only'}</p>
              {(exportOptions.filters.dateRange.start || exportOptions.filters.dateRange.end) && (
                <p>
                  Date Range: {exportOptions.filters.dateRange.start || 'Any'} to {exportOptions.filters.dateRange.end || 'Any'}
                </p>
              )}
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={exporting}>
            Cancel
          </Button>
          <Button
            onClick={handleExport}
            loading={exporting}
            disabled={exportOptions.fields.length === 0 || filteredUsers.length === 0}
            className="bg-primary hover:bg-primary text-white"
          >
            <Download className="h-4 w-4 mr-2" />
            Export {filteredUsers.length} Users
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
