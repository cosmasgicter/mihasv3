import React, { useState, useEffect } from 'react'
import { Button } from '@/components/ui/Button'
import type { ApplicationVersion } from '@/types/application'
import { formatDate, formatTimestamp } from '@/lib/dateFormat'
import { History, Eye, Download, Clock } from 'lucide-react'
import { useFocusTrap } from '@/hooks/useFocusTrap'
import { useEscapeKey } from '@/hooks/useEscapeKey'

// Shared ApplicationVersion type

interface ApplicationVersionsProps {
  applicationId?: string
  onRestoreVersion?: (versionData: unknown) => void
}

const VERSION_STORAGE_PREFIX = 'mihas:application-versions:'
const MAX_STORED_VERSIONS = 20

function getVersionStorageKey(applicationId: string): string {
  return `${VERSION_STORAGE_PREFIX}${applicationId}`
}

function readStoredVersions(applicationId: string): ApplicationVersion[] {
  if (typeof window === 'undefined') {
    return []
  }

  try {
    const raw = window.localStorage.getItem(getVersionStorageKey(applicationId))
    if (!raw) {
      return []
    }

    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed : []
  } catch (error) {
    console.error('Failed to read stored application versions:', error)
    return []
  }
}

function writeStoredVersions(applicationId: string, versions: ApplicationVersion[]): void {
  if (typeof window === 'undefined') {
    return
  }

  window.localStorage.setItem(
    getVersionStorageKey(applicationId),
    JSON.stringify(versions.slice(0, MAX_STORED_VERSIONS))
  )
}

function createStoredVersion(
  applicationId: string,
  formData: unknown,
  changeSummary?: string
): ApplicationVersion {
  const existingVersions = readStoredVersions(applicationId)
  const nextVersionNumber = existingVersions.length > 0
    ? Math.max(...existingVersions.map((version) => version.version_number)) + 1
    : 1

  const version: ApplicationVersion = {
    id: `local-version-${Date.now()}`,
    version_number: nextVersionNumber,
    form_data: formData,
    change_summary: changeSummary ?? null,
    created_at: new Date().toISOString(),
  }

  writeStoredVersions(applicationId, [version, ...existingVersions])
  return version
}

export function ApplicationVersions({ applicationId, onRestoreVersion }: ApplicationVersionsProps) {
  const [versions, setVersions] = useState<ApplicationVersion[]>([])
  const [loading, setLoading] = useState(false)
  const [showVersions, setShowVersions] = useState(false)
  const [selectedVersion, setSelectedVersion] = useState<ApplicationVersion | null>(null)
  const focusTrapRef = useFocusTrap(showVersions)
  useEscapeKey(showVersions, () => setShowVersions(false))

  useEffect(() => {
    if (showVersions && applicationId) {
      loadVersions()
    }
  }, [showVersions, applicationId])

  const loadVersions = async () => {
    if (!applicationId) return

    try {
      setLoading(true)
      const storedVersions = readStoredVersions(applicationId)
      setVersions(storedVersions)
      setSelectedVersion((current) => current ?? storedVersions[0] ?? null)
    } catch (error) {
      console.error('Error loading versions:', error)
    } finally {
      setLoading(false)
    }
  }

  const createVersion = async (formData: unknown, changeSummary?: string) => {
    if (!applicationId) return

    try {
      createStoredVersion(applicationId, formData, changeSummary)
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
        className="text-foreground hover:text-foreground"
      >
        <History className="h-4 w-4 mr-2" />
        Version History
      </Button>
    )
  }

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div
        ref={focusTrapRef as React.RefObject<HTMLDivElement>}
        role="dialog"
        aria-modal="true"
        aria-label="Application Version History"
        className="bg-card rounded-lg shadow-xl max-w-4xl w-full mx-4 max-h-[80vh] overflow-hidden"
      >
        <div className="p-6 border-b">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-semibold text-foreground">
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
              <h4 className="font-medium text-foreground mb-3">Versions</h4>
              
              {loading ? (
                <div className="text-center py-8">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto"></div>
                </div>
              ) : versions.length === 0 ? (
                <div className="text-center py-8 text-foreground">
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
                          : 'border-border hover:border-input'
                      }`}
                      onClick={() => setSelectedVersion(version)}
                    >
                      <div className="flex items-center justify-between mb-1">
                        <span className="font-medium text-sm">
                          Version {version.version_number}
                        </span>
                        <span className="text-xs text-foreground">
                          {formatDate(version.created_at)}
                        </span>
                      </div>
                      
                      {version.change_summary && (
                        <p className="text-xs text-foreground truncate">
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
                        <Clock className="h-3 w-3 text-foreground" />
                        <span className="text-xs text-foreground">
                          {formatTimestamp(version.created_at)}
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
                  <h4 className="font-medium text-foreground">
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
                    <label className="block text-sm font-medium text-foreground mb-1">
                      Created
                    </label>
                    <p className="text-sm text-foreground">
                      {formatDate(selectedVersion.created_at)}
                    </p>
                  </div>

                  {selectedVersion.change_summary && (
                    <div>
                      <label className="block text-sm font-medium text-foreground mb-1">
                        Changes
                      </label>
                      <p className="text-sm text-foreground">
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
                    <label className="block text-sm font-medium text-foreground mb-1">
                      Form Data Preview
                    </label>
                    <div className="bg-muted rounded-lg p-3 max-h-64 overflow-y-auto">
                      <pre className="text-xs text-foreground whitespace-pre-wrap">
                        {JSON.stringify(selectedVersion.form_data, null, 2)}
                      </pre>
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              <div className="flex items-center justify-center h-full text-foreground">
                <div className="text-center">
                  <Eye className="h-8 w-8 mx-auto mb-2 opacity-50" />
                  <p className="text-sm">Select a version to view details</p>
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="p-4 border-t bg-muted">
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
  const createVersion = async (formData: unknown, changeSummary?: string) => {
    if (!applicationId) return

    try {
      createStoredVersion(applicationId, formData, changeSummary)
      return { success: true }
    } catch (error) {
      console.error('Error creating version:', error)
      return { success: false, error }
    }
  }

  return { createVersion }
}
