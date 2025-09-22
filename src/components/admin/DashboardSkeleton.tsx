import React from 'react'

export function DashboardSkeleton() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-purple-50">
      <div className="container-mobile py-4 sm:py-6 lg:py-8 space-y-6">
        <div className="bg-white/80 backdrop-blur rounded-2xl p-6 sm:p-8 shadow-lg animate-pulse">
          <div className="h-6 sm:h-8 bg-gray-200 rounded w-48 mb-4" />
          <div className="h-4 bg-gray-100 rounded w-32 mb-6" />
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="h-3 bg-gray-100 rounded" />
            <div className="h-3 bg-gray-100 rounded" />
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {Array.from({ length: 4 }).map((_, index) => (
            <div key={index} className="bg-white rounded-2xl shadow-lg p-6 space-y-4 animate-pulse">
              <div className="h-10 w-10 bg-gray-100 rounded-xl" />
              <div className="h-4 bg-gray-100 rounded w-1/3" />
              <div className="h-6 bg-gray-200 rounded w-1/2" />
              <div className="h-3 bg-gray-100 rounded w-2/3" />
            </div>
          ))}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {Array.from({ length: 2 }).map((_, index) => (
            <div key={index} className="bg-white rounded-2xl shadow-lg p-6 space-y-4 animate-pulse">
              <div className="h-4 bg-gray-100 rounded w-1/3" />
              <div className="h-48 bg-gray-100 rounded" />
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
