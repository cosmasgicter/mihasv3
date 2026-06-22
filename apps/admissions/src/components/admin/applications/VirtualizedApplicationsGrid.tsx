import React, { useRef, useState, useEffect, useCallback, useMemo } from 'react'
import { useVirtualizer } from '@tanstack/react-virtual'
import { ApplicationCard, ApplicationSummary } from './ApplicationCard'

// Hook to track keyboard-focused row index for visible focus styling
function useGridKeyboardNav(
  totalRows: number,
  columns: number,
  applications: ApplicationSummary[],
  onViewDetails: (id: string) => void,
  rowRefs: React.MutableRefObject<Map<number, HTMLDivElement>>
) {
  const [focusedRowIndex, setFocusedRowIndex] = useState<number | null>(null)

  const focusRow = useCallback((index: number) => {
    if (index < 0 || index >= totalRows) return
    setFocusedRowIndex(index)
    const el = rowRefs.current.get(index)
    if (el) {
      el.focus({ preventScroll: false })
      el.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
    }
  }, [totalRows, rowRefs])

  const handleRowKeyDown = useCallback((e: React.KeyboardEvent, rowIndex: number) => {
    switch (e.key) {
      case 'ArrowDown': {
        e.preventDefault()
        focusRow(rowIndex + 1)
        break
      }
      case 'ArrowUp': {
        e.preventDefault()
        focusRow(rowIndex - 1)
        break
      }
      case 'Enter':
      case ' ': {
        e.preventDefault()
        const startIdx = rowIndex * columns
        const firstApp = applications[startIdx]
        if (firstApp) {
          onViewDetails(firstApp.id)
        }
        break
      }
    }
  }, [focusRow, columns, applications, onViewDetails])

  return { focusedRowIndex, setFocusedRowIndex, handleRowKeyDown }
}

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
  const rowRefs = useRef<Map<number, HTMLDivElement>>(new Map())
  const columns = useResponsiveColumns()
  const totalRows = Math.ceil(applications.length / columns)

  // Memoized Set for O(1) selection-membership checks (equivalent to
  // selectedIds.includes(id) over the identical collection).
  const selectedIdSet = useMemo(() => new Set(selectedIds), [selectedIds])

  const { focusedRowIndex, setFocusedRowIndex, handleRowKeyDown } = useGridKeyboardNav(
    totalRows,
    columns,
    applications,
    onViewDetails,
    rowRefs
  )

  // Handle selection change for individual cards
  const handleSelect = useCallback((id: string, selected: boolean) => {
    if (!onSelectionChange) return
    
    if (selected) {
      onSelectionChange([...selectedIds, id])
    } else {
      onSelectionChange(selectedIds.filter(selectedId => selectedId !== id))
    }
  }, [selectedIds, onSelectionChange])

  const setRowRef = useCallback((index: number, el: HTMLDivElement | null) => {
    if (el) {
      rowRefs.current.set(index, el)
    } else {
      rowRefs.current.delete(index)
    }
  }, [])

  const rowVirtualizer = useVirtualizer({
    count: totalRows,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 480,
    overscan: 5
  })

  if (columns === 1) {
    return (
      <div className="space-y-4" role="list" aria-label="Applications list">
        {applications.map((app) => (
          <div key={app.id} role="listitem">
            <ApplicationCard
              application={app}
              onStatusUpdate={onStatusUpdate}
              onPaymentStatusUpdate={onPaymentStatusUpdate}
              onViewDetails={onViewDetails}
              updatingStatus={updatingStatusId === app.id}
              updatingPayment={updatingPaymentId === app.id}
              isSelected={selectedIdSet.has(app.id)}
              onSelect={onSelectionChange ? handleSelect : undefined}
            />
          </div>
        ))}
      </div>
    )
  }

  return (
    <div
      ref={parentRef}
      className="h-[calc(100vh-400px)] min-h-[32rem] overflow-auto"
      role="grid"
      aria-label="Applications grid"
      aria-rowcount={totalRows}
    >
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
          const isFocused = focusedRowIndex === virtualRow.index

          return (
            <div
              key={virtualRow.key}
              ref={(el) => setRowRef(virtualRow.index, el)}
              role="row"
              aria-rowindex={virtualRow.index + 1}
              tabIndex={isFocused ? 0 : -1}
              onKeyDown={(e) => handleRowKeyDown(e, virtualRow.index)}
              onFocus={() => setFocusedRowIndex(virtualRow.index)}
              className={`outline-none ${
                isFocused
                  ? 'ring-2 ring-primary ring-offset-2 rounded-lg'
                  : ''
              }`}
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
                  <div key={app.id} role="gridcell">
                    <ApplicationCard
                      application={app}
                      onStatusUpdate={onStatusUpdate}
                      onPaymentStatusUpdate={onPaymentStatusUpdate}
                      onViewDetails={onViewDetails}
                      updatingStatus={updatingStatusId === app.id}
                      updatingPayment={updatingPaymentId === app.id}
                      isSelected={selectedIdSet.has(app.id)}
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
