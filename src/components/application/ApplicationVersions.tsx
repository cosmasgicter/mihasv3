import React, { useState, useEffect } from 'react'
import { Button } from '@/components/ui/Button'
import { useAuth } from '@/contexts/AuthContext'
import { supabase } from '@/lib/supabase'
import { formatDate } from '@/lib/utils'
import { History, Eye, Download, Clock } from 'lucide-react'

interface ApplicationVersion {
  id: string
  version_number: number
  form_data: any
  change_summary?: string
  created_at: string
}

interface ApplicationVersionsProps {
  applicationId?: string
  onRestoreVersion?: (versionData: any) => void
}

export function ApplicationVersions({ applicationId, onRestoreVersion }: ApplicationVersionsProps) {
  const { user } = useAuth()
  const [versions, setVersions] = useState<ApplicationVersion[]>([])
  const [loading, setLoading] = useState(false)
  const [showVersions, setShowVersions] = useState(false)
  const [selectedVersion, setSelectedVersion] = useState<ApplicationVersion | null>(null)

  useEffect(() => {
    if (showVersions && applicationId) {
      loadVersions()
    }
  }, [showVersions, applicationId])

  const loadVersions = async () => {
    if (!applicationId || !user) return

    try {
      setLoading(true)
      const { data, error } = await supabase
        .from('application_versions')
        .select('*')
        .eq('application_id', applicationId)
        .order('version_number', { ascending: false })

      if (error) throw error
      setVersions(data || [])
    } catch (error) {
      console.error('Error loading versions:', error)
    } finally {
      setLoading(false)
    }
  }

  const createVersion = async (formData: any, changeSummary?: string) => {
    if (!applicationId || !user) return

    try {
      const nextVersion = Math.max(...versions.map(v => v.version_number), 0) + 1
      
      const { error } = await supabase
        .from('application_versions')
        .insert({
          application_id: applicationId,
          user_id: user.id,
          version_number: nextVersion,
          form_data: formData,
          change_summary: changeSummary,
          created_by: user.id
        })

      if (error) throw error
      
      // Reload versions
      await loadVersions()
    } catch (error) {
      console.error('Error creating version:', error)
    }
  }

  const exportVersion = (version: ApplicationVersion) => {
    const dataStr = JSON.stringify(version.form_data, null, 2)
    const dataBlob = new Blob([dataStr], { type: 'application/json' })
    const url = URL.createObjectURL(dataBlob)
    
    const link = document.createElement('a')
    link.href = url
    link.download = `application-v${version.version_number}-${new Date().toISOString().split('T')[0]}.json`
    link.click()
    
    URL.revokeObjectURL(url)
  }

  if (!showVersions) {
    return (
      <Button
        variant="outline"
        size="sm"
        onClick={() => setShowVersions(true)}
        className="text-gray-600 hover:text-gray-800"
      >
        <History className="h-4 w-4 mr-2" />
        Version History
      </Button>
    )
  }

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl max-w-4xl w-full mx-4 max-h-[80vh] overflow-hidden">
        <div className="p-6 border-b">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-semibold text-gray-900">
              Application Version History
            </h3>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setShowVersions(false)}
            >
              ✕
            </Button>
          </div>
        </div>

        <div className="flex h-[60vh]">
          {/* Version List */}
          <div className="w-1/3 border-r overflow-y-auto">
            <div className="p-4">
              <h4 className="font-medium text-gray-900 mb-3">Versions</h4>
              
              {loading ? (
                <div className="text-center py-8">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto"></div>
                </div>
              ) : versions.length === 0 ? (
                <div className="text-center py-8 text-gray-500">
                  <History className="h-8 w-8 mx-auto mb-2 opacity-50" />
                  <p className="text-sm">No versions found</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {versions.map((version) => (
                    <div
                      key={version.id}
                      className={`p-3 rounded-lg border cursor-pointer transition-colors ${
                        selectedVersion?.id === version.id
                          ? 'border-primary bg-primary/5'
                          : 'border-gray-200 hover:border-gray-300'
                      }`}
                      onClick={() => setSelectedVersion(version)}
                    >
                      <div className="flex items-center justify-between mb-1">
                        <span className="font-medium text-sm">
                          Version {version.version_number}
                        </span>
                        <span className="text-xs text-gray-500">
                          {formatDate(version.created_at)}
                        </span>
                      </div>
                      
                      {version.change_summary && (
                        <p className="text-xs text-gray-600 truncate">
                          {version.change_summary.replace(/[<>&"']/g, (char) => {
                            const entities: Record<string, string> = {
                              '<': '&lt;',
                              '>': '&gt;',
                              '&': '&amp;',
                              '"': '&quot;',
                              "'": '&#x27;'
                            }
                            return entities[char] || char
                          })}
                        </p>
                      )}
                      
                      <div className="flex items-center mt-2 space-x-1">
                        <Clock className="h-3 w-3 text-gray-400" />
                        <span className="text-xs text-gray-500">
                          {new Date(version.created_at).toLocaleTimeString()}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Version Details */}
          <div className="flex-1 overflow-y-auto">
            {selectedVersion ? (
              <div className="p-4">
                <div className="flex items-center justify-between mb-4">
                  <h4 className="font-medium text-gray-900">
                    Version {selectedVersion.version_number} Details
                  </h4>
                  <div className="flex space-x-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => exportVersion(selectedVersion)}
                    >
                      <Download className="h-4 w-4 mr-1" />
                      Export
                    </Button>
                    {onRestoreVersion && (
                      <Button
                        size="sm"
                        onClick={() => {
                          onRestoreVersion(selectedVersion.form_data)
                          setShowVersions(false)
                        }}
                      >
                        Restore Version
                      </Button>
                    )}
                  </div>
                </div>

                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Created
                    </label>
                    <p className="text-sm text-gray-900">
                      {formatDate(selectedVersion.created_at)}
                    </p>
                  </div>

                  {selectedVersion.change_summary && (
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Changes
                      </label>
                      <p className="text-sm text-gray-900">
                        {selectedVersion.change_summary?.replace(/[<>&"']/g, (char) => {
                          const entities: Record<string, string> = {
                            '<': '&lt;',
                            '>': '&gt;',
                            '&': '&amp;',
                            '"': '&quot;',
                            "'": '&#x27;'
                          }
                          return entities[char] || char
                        })}
                      </p>
                    </div>
                  )}

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Form Data Preview
                    </label>
                    <div className="bg-gray-50 rounded-lg p-3 max-h-64 overflow-y-auto">
                      <pre className="text-xs text-gray-700 whitespace-pre-wrap">
                        {JSON.stringify(selectedVersion.form_data, null, 2)}
                      </pre>
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              <div className="flex items-center justify-center h-full text-gray-500">
                <div className="text-center">
                  <Eye className="h-8 w-8 mx-auto mb-2 opacity-50" />
                  <p className="text-sm">Select a version to view details</p>
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="p-4 border-t bg-gray-50">
          <div className="flex justify-end">
            <Button
              variant="outline"
              onClick={() => setShowVersions(false)}
            >
              Close
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}

// Hook for version management
export function useApplicationVersions(applicationId?: string) {
  const { user } = useAuth()

  const createVersion = async (formData: any, changeSummary?: string) => {
    if (!applicationId || !user) return

    try {
      const { error } = await supabase
        .from('application_versions')
        .insert({
          application_id: applicationId,
          user_id: user.id,
          version_number: Date.now(), // Simple versioning
          form_data: formData,
          change_summary: changeSummary,
          created_by: user.id
        })

      if (error) throw error
      return { success: true }
    } catch (error) {
      console.error('Error creating version:', error)
      return { success: false, error }
    }
  }

  return { createVersion }
}