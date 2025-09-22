import React from 'react'

export function ApplicationsSkeleton() {
  return (
    <div className="space-y-6">
      {/* Card Grid Skeleton */}
      <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-3">
        {Array.from({ length: 6 }).map((_, index) => (
          <div
            key={index}
            className="bg-white rounded-xl border border-gray-200 p-6 animate-pulse"
          >
            {/* Header */}
            <div className="flex items-start justify-between mb-4">
              <div className="flex-1">
                <div className="h-5 bg-gray-200 rounded w-3/4 mb-2" />
                <div className="h-4 bg-gray-100 rounded w-1/2" />
              </div>
              <div className="h-6 bg-gray-200 rounded-full w-20" />
            </div>

            {/* Contact Info */}
            <div className="space-y-2 mb-4">
              <div className="h-4 bg-gray-100 rounded w-full" />
              <div className="h-4 bg-gray-100 rounded w-2/3" />
            </div>

            {/* Program Info */}
            <div className="bg-gray-50 rounded-lg p-3 mb-4">
              <div className="h-4 bg-gray-200 rounded w-3/4 mb-2" />
              <div className="h-3 bg-gray-100 rounded w-1/2" />
            </div>

            {/* Payment & Grades */}
            <div className="grid grid-cols-2 gap-4 mb-4">
              <div>
                <div className="h-3 bg-gray-100 rounded w-16 mb-1" />
                <div className="h-5 bg-gray-200 rounded w-20 mb-1" />
                <div className="h-4 bg-gray-100 rounded w-24" />
              </div>
              <div>
                <div className="h-3 bg-gray-100 rounded w-12 mb-1" />
                <div className="h-4 bg-gray-100 rounded w-20 mb-1" />
                <div className="h-4 bg-gray-200 rounded w-16" />
              </div>
            </div>

            {/* Controls */}
            <div className="space-y-3">
              <div className="h-8 bg-gray-100 rounded" />
              <div className="h-8 bg-gray-100 rounded" />
              <div className="flex gap-2">
                <div className="flex-1 h-10 bg-gray-200 rounded-lg" />
                <div className="h-10 w-10 bg-gray-100 rounded-lg" />
                <div className="h-10 w-10 bg-gray-100 rounded-lg" />
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Pagination Skeleton */}
      <div className="bg-white rounded-xl p-6 border border-gray-200">
        <div className="flex justify-between items-center">
          <div className="h-4 bg-gray-200 rounded w-48" />
          <div className="h-10 bg-gray-200 rounded w-32" />
        </div>
      </div>
    </div>
  )
}
