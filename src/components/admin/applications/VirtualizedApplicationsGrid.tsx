import React, { useRef } from 'react'
import { useVirtualizer } from '@tanstack/react-virtual'

interface VirtualizedApplicationsGridProps {
  applications: any[]
  renderCard: (app: any) => React.ReactNode
  columns?: number
}

export function VirtualizedApplicationsGrid({
  applications,
  renderCard,
  columns = 3
}: VirtualizedApplicationsGridProps) {
  const parentRef = useRef<HTMLDivElement>(null)

  const rowVirtualizer = useVirtualizer({
    count: Math.ceil(applications.length / columns),
    getScrollElement: () => parentRef.current,
    estimateSize: () => 450,
    overscan: 2
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
              <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-3 px-1">
                {rowApps.map((app) => (
                  <div key={app.id}>{renderCard(app)}</div>
                ))}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
