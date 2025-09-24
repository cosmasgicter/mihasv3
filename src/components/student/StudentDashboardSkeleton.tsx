import React from 'react'

export function StudentDashboardSkeleton() {
  return (
    <div className="px-4 sm:px-6 lg:px-8 max-w-7xl mx-auto py-4 sm:py-6 lg:py-8 pb-20">
      {/* Welcome Section Skeleton */}
      <div className="mb-6 sm:mb-8">
        <div className="bg-gradient-to-r from-primary to-secondary rounded-2xl p-6 sm:p-8 text-white shadow-xl">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between space-y-4 sm:space-y-0">
            <div className="space-y-3">
              <div className="h-8 sm:h-10 w-64 sm:w-80 rounded-full bg-white/40 animate-pulse" />
              <div className="h-5 w-72 sm:w-96 rounded-full bg-white/30 animate-pulse" />
            </div>
            <div className="space-y-2 text-right">
              <div className="h-12 w-16 sm:w-20 rounded-xl bg-white/40 animate-pulse ml-auto" />
              <div className="h-4 w-24 sm:w-28 rounded-full bg-white/30 animate-pulse ml-auto" />
            </div>
          </div>
        </div>
      </div>

      {/* Continue Application Skeleton */}
      <div className="mb-6 sm:mb-8">
        <div className="bg-white border border-gray-200 rounded-2xl p-6 shadow-lg">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div className="space-y-3 flex-1">
              <div className="h-6 w-48 rounded-full bg-gray-200 animate-pulse" />
              <div className="h-4 w-64 rounded-full bg-gray-100 animate-pulse" />
              <div className="h-4 w-40 rounded-full bg-gray-100 animate-pulse" />
            </div>
            <div className="flex gap-3">
              <div className="h-10 w-32 rounded-lg bg-primary/20 animate-pulse" />
              <div className="h-10 w-32 rounded-lg bg-gray-100 animate-pulse" />
            </div>
          </div>
        </div>
      </div>

      {/* Main Grid Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 lg:gap-8">
        {/* Applications List - Left Side (2/3 width) */}
        <div className="lg:col-span-2">
          <div className="bg-white rounded-2xl shadow-lg border border-gray-100">
            {/* Header */}
            <div className="px-6 py-4 border-b border-gray-200 bg-gradient-to-r from-gray-50 to-blue-50">
              <div className="h-6 w-48 rounded-full bg-gray-200 animate-pulse" />
              <div className="mt-2 h-4 w-64 rounded-full bg-gray-100 animate-pulse" />
            </div>
            
            {/* Application Items */}
            <div className="divide-y divide-gray-200">
              {Array.from({ length: 3 }).map((_, index) => (
                <div key={index} className="px-6 py-4">
                  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between space-y-4 sm:space-y-0">
                    <div className="flex-1">
                      <div className="flex items-center space-x-3 mb-2">
                        <div className="h-5 w-5 rounded-full bg-gray-200 animate-pulse" />
                        <div className="h-5 w-48 rounded-full bg-gray-200 animate-pulse" />
                        <div className="h-5 w-20 rounded-full bg-gray-100 animate-pulse" />
                      </div>
                      <div className="space-y-2">
                        <div className="h-4 w-64 rounded-full bg-gray-100 animate-pulse" />
                        <div className="h-4 w-56 rounded-full bg-gray-100 animate-pulse" />
                        <div className="h-4 w-48 rounded-full bg-gray-100 animate-pulse" />
                      </div>
                    </div>
                    <div className="h-10 w-32 rounded-lg bg-gray-100 animate-pulse" />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Sidebar - Right Side (1/3 width) */}
        <div className="space-y-6">
          {/* Profile Summary */}
          <div className="bg-white rounded-2xl shadow-lg border border-gray-100 p-6">
            <div className="flex items-center justify-between mb-4">
              <div className="h-6 w-40 rounded-full bg-gray-200 animate-pulse" />
              <div className="h-6 w-16 rounded-full bg-gray-100 animate-pulse" />
            </div>
            <div className="space-y-4">
              {Array.from({ length: 4 }).map((_, index) => (
                <div key={index} className="p-3 bg-gray-50 rounded-xl space-y-2">
                  <div className="h-3 w-20 rounded-full bg-gray-200 animate-pulse" />
                  <div className="h-4 w-full rounded-full bg-gray-100 animate-pulse" />
                </div>
              ))}
            </div>
            <div className="h-10 w-full rounded-xl bg-gray-100 animate-pulse mt-4" />
          </div>

          {/* Upcoming Deadlines */}
          <div className="bg-white rounded-2xl shadow-lg border border-gray-100 p-6">
            <div className="h-6 w-48 rounded-full bg-gray-200 animate-pulse mb-4" />
            <div className="space-y-3">
              {Array.from({ length: 3 }).map((_, index) => (
                <div key={index} className="border-l-4 border-red-400 pl-4 p-3 bg-red-50 rounded-r-xl space-y-2">
                  <div className="h-4 w-3/4 rounded-full bg-gray-100 animate-pulse" />
                  <div className="h-3 w-1/2 rounded-full bg-gray-100 animate-pulse" />
                </div>
              ))}
            </div>
          </div>

          {/* Quick Actions */}
          <div className="bg-white rounded-2xl shadow-lg border border-gray-100 p-6">
            <div className="h-6 w-40 rounded-full bg-gray-200 animate-pulse mb-4" />
            <div className="space-y-3">
              {Array.from({ length: 3 }).map((_, index) => (
                <div key={index} className="h-10 w-full rounded-lg bg-gray-100 animate-pulse" />
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
