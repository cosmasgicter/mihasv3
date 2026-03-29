import React, { useRef, useState, useEffect, useCallback } from 'react'
import { useVirtualizer } from '@tanstack/react-virtual'
import { ApplicationCard, ApplicationSummary } from './ApplicationCard'

interface VirtualizedApplicationsGridProps {
  applications: ApplicationSummary[]
  onStatusUpdate: (id: string, status: string) => void | Promise<void>
  onPaymentStatusUpdate: (id: string, status: string, verificationNotes?: string) => void | Promise<void>
  onViewDetails: (id: string) => void
  updatingStatusId: string | null
  updatingPaymentId: string | null
  selectedIds?: string[]
  onSelectionChange?: (ids: string[]) => void
}

// Hook to get responsive column count based on window width
function useResponsiveColumns(): number {
  const [columns, setColumns] = useState(() => {
    if (typeof window === 'undefined') return 3
    const width = window.innerWidth
    if (width < 768) return 1      // mobile
    if (width < 1280) return 2     // tablet
    return 3                        // desktop
  })

  useEffect(() => {
    const handleResize = () => {
      const width = window.innerWidth
      if (width < 768) {
        setColumns(1)
      } else if (width < 1280) {
        setColumns(2)
      } else {
        setColumns(3)
      }
    }

    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [])

  return columns
}

export function VirtualizedApplicationsGrid({
  applications,
  onStatusUpdate,
  onPaymentStatusUpdate,
  onViewDetails,
  updatingStatusId,
  updatingPaymentId,
  selectedIds = [],
  onSelectionChange
}: VirtualizedApplicationsGridProps) {
  const parentRef = useRef<HTMLDivElement>(null)
  const columns = useResponsiveColumns()

  // Handle selection change for individual cards
  const handleSelect = useCallback((id: string, selected: boolean) => {
    if (!onSelectionChange) return
    
    if (selected) {
      onSelectionChange([...selectedIds, id])
    } else {
      onSelectionChange(selectedIds.filter(selectedId => selectedId !== id))
    }
  }, [selectedIds, onSelectionChange])

  const rowVirtualizer = useVirtualizer({
    count: Math.ceil(applications.length / columns),
    getScrollElement: () => parentRef.current,
    estimateSize: () => 480,
    overscan: 5 // Increased overscan for smoother mobile scrolling
  })

  return (
    <div ref={parentRef} className="h-[calc(100vh-400px)] overflow-auto">
      <div
        style={{
          height: `${rowVirtualizer.getTotalSize()}px`,
          width: '100%',
          position: 'relative'
        }}
      >
        {rowVirtualizer.getVirtualItems().map((virtualRow) => {
          const startIdx = virtualRow.index * columns
          const rowApps = applications.slice(startIdx, startIdx + columns)

          return (
            <div
              key={virtualRow.key}
              style={{
                position: 'absolute',
                top: 0,
                left: 0,
                width: '100%',
                height: `${virtualRow.size}px`,
                transform: `translateY(${virtualRow.start}px)`
              }}
            >
              <div className={`grid gap-6 px-1 ${
                columns === 1 ? 'grid-cols-1' : 
                columns === 2 ? 'grid-cols-1 md:grid-cols-2' : 
                'grid-cols-1 md:grid-cols-2 xl:grid-cols-3'
              }`}>
                {rowApps.map((app) => (
                  <div key={app.id}>
                    <ApplicationCard
                      application={app}
                      onStatusUpdate={onStatusUpdate}
                      onPaymentStatusUpdate={onPaymentStatusUpdate}
                      onViewDetails={onViewDetails}
                      updatingStatus={updatingStatusId === app.id}
                      updatingPayment={updatingPaymentId === app.id}
                      isSelected={selectedIds.includes(app.id)}
                      onSelect={onSelectionChange ? handleSelect : undefined}
                    />
                  </div>
                ))}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
