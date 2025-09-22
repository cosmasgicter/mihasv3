import React from 'react'
import { Input } from '@/components/ui/Input'
import { Search } from 'lucide-react'
import type { ApplicationFilters } from '@/hooks/admin/useApplicationFilters'

interface FiltersPanelProps {
  searchTerm: string
  statusFilter: string
  paymentFilter: string
  programFilter: string
  institutionFilter: string
  onFilterChange: (key: keyof ApplicationFilters, value: string) => void
}

export function FiltersPanel({
  searchTerm,
  statusFilter,
  paymentFilter,
  programFilter,
  institutionFilter,
  onFilterChange
}: FiltersPanelProps) {
  return (
    <div className="bg-white rounded-lg shadow p-6 mb-6">
      <div className="grid grid-cols-1 md:grid-cols-6 gap-4">
        <div className="md:col-span-2">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
            <Input
              placeholder="Search by name, email, or application number..."
              value={searchTerm}
              onChange={(e) => onFilterChange('searchTerm', e.target.value)}
              className="pl-10"
            />
          </div>
        </div>
        
        <div>
          <select
            value={statusFilter}
            onChange={(e) => onFilterChange('statusFilter', e.target.value)}
            className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
          >
            <option value="">All Statuses</option>
            <option value="draft">Draft</option>
            <option value="submitted">Submitted</option>
            <option value="under_review">Under Review</option>
            <option value="approved">Approved</option>
            <option value="rejected">Rejected</option>
          </select>
        </div>
        
        <div>
          <select
            value={paymentFilter}
            onChange={(e) => onFilterChange('paymentFilter', e.target.value)}
            className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
          >
            <option value="">All Payments</option>
            <option value="pending_review">Pending Review</option>
            <option value="verified">Verified</option>
            <option value="rejected">Rejected</option>
          </select>
        </div>
        
        <div>
          <select
            value={programFilter}
            onChange={(e) => onFilterChange('programFilter', e.target.value)}
            className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
          >
            <option value="">All Programs</option>
            <option value="Clinical Medicine">Clinical Medicine</option>
            <option value="Environmental Health">Environmental Health</option>
            <option value="Registered Nursing">Registered Nursing</option>
          </select>
        </div>
        
        <div>
          <select
            value={institutionFilter}
            onChange={(e) => onFilterChange('institutionFilter', e.target.value)}
            className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
          >
            <option value="">All Institutions</option>
            <option value="Kalulushi Training Centre">Kalulushi Training Centre</option>
            <option value="Mukuba Institute of Health and Allied Sciences">Mukuba Institute of Health and Allied Sciences</option>
          </select>
        </div>
      </div>
    </div>
  )
}