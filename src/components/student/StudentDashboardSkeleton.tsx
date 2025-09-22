import React from 'react'

export function StudentDashboardSkeleton() {
  return (
    <div className="space-y-6 sm:space-y-8">
      <div className="bg-gradient-to-r from-primary to-secondary rounded-2xl p-6 sm:p-8 text-white shadow-xl">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between space-y-4 sm:space-y-0">
          <div className="space-y-3">
            <div className="h-6 sm:h-8 w-48 sm:w-64 rounded-full bg-white/40 animate-pulse" />
            <div className="h-4 w-56 sm:w-72 rounded-full bg-white/30 animate-pulse" />
          </div>
          <div className="space-y-2 text-right">
            <div className="h-10 w-16 sm:w-20 rounded-xl bg-white/40 animate-pulse ml-auto" />
            <div className="h-3 w-24 sm:w-28 rounded-full bg-white/30 animate-pulse ml-auto" />
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {Array.from({ length: 3 }).map((_, index) => (
          <div
            key={index}
            className="rounded-2xl border border-gray-100 bg-white p-4 shadow-sm"
          >
            <div className="space-y-3">
              <div className="h-4 w-24 rounded-full bg-gray-200 animate-pulse" />
              <div className="h-6 w-1/2 rounded-full bg-gray-100 animate-pulse" />
              <div className="h-3 w-3/4 rounded-full bg-gray-100 animate-pulse" />
            </div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 lg:gap-8">
        <div className="lg:col-span-2 space-y-6">
          <div className="bg-white rounded-2xl shadow-lg border border-gray-100">
            <div className="px-6 py-4 border-b border-gray-200 bg-gradient-to-r from-gray-50 to-blue-50">
              <div className="h-6 w-48 rounded-full bg-gray-200 animate-pulse" />
              <div className="mt-2 h-4 w-64 rounded-full bg-gray-100 animate-pulse" />
            </div>
            <div className="divide-y divide-gray-100">
              {Array.from({ length: 3 }).map((_, index) => (
                <div key={index} className="px-6 py-4 space-y-3">
                  <div className="flex items-center space-x-3">
                    <div className="h-8 w-8 rounded-full bg-gray-200 animate-pulse" />
                    <div className="h-4 w-1/3 rounded-full bg-gray-200 animate-pulse" />
                    <div className="h-4 w-20 rounded-full bg-gray-100 animate-pulse" />
                  </div>
                  <div className="space-y-2">
                    <div className="h-3 w-3/4 rounded-full bg-gray-100 animate-pulse" />
                    <div className="h-3 w-2/3 rounded-full bg-gray-100 animate-pulse" />
                    <div className="h-3 w-1/2 rounded-full bg-gray-100 animate-pulse" />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="space-y-6">
          {Array.from({ length: 3 }).map((_, index) => (
            <div
              key={index}
              className="bg-white rounded-2xl shadow-lg border border-gray-100 p-6 space-y-4"
            >
              <div className="h-5 w-40 rounded-full bg-gray-200 animate-pulse" />
              <div className="space-y-3">
                <div className="h-3 w-full rounded-full bg-gray-100 animate-pulse" />
                <div className="h-3 w-5/6 rounded-full bg-gray-100 animate-pulse" />
                <div className="h-3 w-2/3 rounded-full bg-gray-100 animate-pulse" />
              </div>
              <div className="h-9 w-full rounded-xl bg-gray-100 animate-pulse" />
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
