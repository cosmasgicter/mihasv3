import React from 'react'

export function MonitoringDashboard() {
  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold">System Monitoring</h2>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        <div className="bg-white p-6 rounded-lg shadow">
          <h3 className="text-lg font-semibold mb-2">System Status</h3>
          <p className="text-green-600">All systems operational</p>
        </div>
        <div className="bg-white p-6 rounded-lg shadow">
          <h3 className="text-lg font-semibold mb-2">Database</h3>
          <p className="text-green-600">Connected</p>
        </div>
        <div className="bg-white p-6 rounded-lg shadow">
          <h3 className="text-lg font-semibold mb-2">Storage</h3>
          <p className="text-green-600">Available</p>
        </div>
      </div>
    </div>
  )
}