import React, { useState, useMemo } from 'react'
import { Search, Filter, Eye, AlertTriangle, CheckCircle, Clock } from 'lucide-react'
import { Input } from '../ui/Input'
import { Button } from '../ui/Button'
import { regulatoryEngine, RegulatoryGuideline } from '@/lib/regulatoryGuidelines'

interface RegulatoryGuidelinesTableProps {
 onGuidelineSelect?: (guideline: RegulatoryGuideline) => void
}

export function RegulatoryGuidelinesTable({ onGuidelineSelect }: RegulatoryGuidelinesTableProps) {
 const [searchQuery, setSearchQuery] = useState('')
 const [filters, setFilters] = useState({
 regulatory_body: '',
 program_code: '',
 compliance_level: ''
 })
 const [showFilters, setShowFilters] = useState(false)

 const [filteredGuidelines, setFilteredGuidelines] = useState<RegulatoryGuideline[]>([])
 const [loading, setLoading] = useState(false)

 // Load guidelines when search or filters change
 React.useEffect(() => {
 const loadGuidelines = async () => {
 setLoading(true)
 try {
 const results = await regulatoryEngine.searchGuidelines(searchQuery, filters)
 setFilteredGuidelines(results)
 } catch (error) {
 console.error('Error loading guidelines:', error)
 // Fallback to local search
 const results = regulatoryEngine.searchGuidelinesLocal(searchQuery, filters)
 setFilteredGuidelines(results)
 } finally {
 setLoading(false)
 }
 }
 
 loadGuidelines()
 }, [searchQuery, filters])

 const getComplianceIcon = (level: string) => {
 switch (level) {
 case 'mandatory':
 return <AlertTriangle className="h-4 w-4 text-error" />
 case 'recommended':
 return <CheckCircle className="h-4 w-4 text-warning" />
 case 'optional':
 return <Clock className="h-4 w-4 text-muted-foreground" />
 default:
 return null
 }
 }

 const getComplianceBadge = (level: string) => {
 const styles = {
 mandatory: 'bg-destructive/10 text-destructive-foreground border-red-200',
 recommended: 'bg-accent/10 text-accent-foreground border-yellow-200',
 optional: 'bg-accent text-foreground border-border'
 }
 
 return (
 <span className={`px-2 py-1 text-xs font-medium rounded-full border ${styles[level as keyof typeof styles]}`}>
 {level.charAt(0).toUpperCase() + level.slice(1)}
 </span>
 )
 }

 const getRegulatoryBodyBadge = (body: string) => {
 const styles = {
 HPCZ: 'bg-primary/10 text-primary-foreground border-blue-200',
 NMCZ: 'bg-accent/10 text-accent-foreground border-green-200',
 ECZ: 'bg-purple-100 text-purple-800 border-purple-200'
 }
 
 return (
 <span className={`px-2 py-1 text-xs font-medium rounded-full border ${styles[body as keyof typeof styles]}`}>
 {body}
 </span>
 )
 }

 return (
 <div className="space-y-4">
 {/* Search and Filter Controls */}
 <div className="bg-card p-4 rounded-lg shadow-sm border">
 <div className="flex flex-col sm:flex-row gap-4">
 <div className="flex-1">
 <div className="relative">
 <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
 <Input
 placeholder="Search guidelines by program, requirement, or regulatory body..."
 value={searchQuery}
 onChange={(e) => setSearchQuery(e.target.value)}
 className="pl-10"
 />
 </div>
 </div>
 
 <Button
 variant="outline"
 onClick={() => setShowFilters(!showFilters)}
 className="flex items-center space-x-2"
 >
 <Filter className="h-4 w-4" />
 <span>Filters</span>
 </Button>
 </div>

 {/* Filter Panel */}
 {showFilters && (
 <div className="mt-4 pt-4 border-t grid grid-cols-1 sm:grid-cols-3 gap-4">
 <div>
 <label className="block text-sm font-medium text-foreground mb-1">
 Regulatory Body
 </label>
 <select
 value={filters.regulatory_body}
 onChange={(e) => setFilters({ ...filters, regulatory_body: e.target.value })}
 className="w-full px-3 py-2 border border-input rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
 >
 <option value="">All Bodies</option>
 <option value="HPCZ">HPCZ</option>
 <option value="NMCZ">NMCZ</option>
 <option value="ECZ">ECZ</option>
 </select>
 </div>
 
 <div>
 <label className="block text-sm font-medium text-foreground mb-1">
 Program Code
 </label>
 <select
 value={filters.program_code}
 onChange={(e) => setFilters({ ...filters, program_code: e.target.value })}
 className="w-full px-3 py-2 border border-input rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
 >
 <option value="">All Programs</option>
 <option value="CMED">Clinical Medicine</option>
 <option value="ENVH">Environmental Health</option>
 <option value="RN">Registered Nursing</option>
 <option value="TEACH">Teacher Education</option>
 </select>
 </div>
 
 <div>
 <label className="block text-sm font-medium text-foreground mb-1">
 Compliance Level
 </label>
 <select
 value={filters.compliance_level}
 onChange={(e) => setFilters({ ...filters, compliance_level: e.target.value })}
 className="w-full px-3 py-2 border border-input rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
 >
 <option value="">All Levels</option>
 <option value="mandatory">Mandatory</option>
 <option value="recommended">Recommended</option>
 <option value="optional">Optional</option>
 </select>
 </div>
 </div>
 )}
 </div>

 {/* Results Summary */}
 <div className="flex items-center justify-between text-sm text-muted-foreground">
 <span>
 Showing {filteredGuidelines.length} guidelines
 {searchQuery && ` for "${searchQuery}"`}
 </span>
 
 {filteredGuidelines.length > 0 && (
 <div className="flex items-center space-x-4">
 <span className="flex items-center space-x-1">
 <AlertTriangle className="h-3 w-3 text-error" />
 <span>{filteredGuidelines.filter(g => g.compliance_level === 'mandatory').length} Mandatory</span>
 </span>
 <span className="flex items-center space-x-1">
 <CheckCircle className="h-3 w-3 text-warning" />
 <span>{filteredGuidelines.filter(g => g.compliance_level === 'recommended').length} Recommended</span>
 </span>
 </div>
 )}
 </div>

 {/* Guidelines Table */}
 <div className="bg-card rounded-lg shadow overflow-hidden">
 {loading ? (
 <div className="p-8 text-center">
 <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-4"></div>
 <p className="text-muted-foreground">Loading guidelines...</p>
 </div>
 ) : filteredGuidelines.length === 0 ? (
 <div className="p-8 text-center text-muted-foreground">
 <Search className="h-12 w-12 mx-auto mb-4 text-foreground" />
 <h3 className="text-lg font-medium mb-2">No guidelines found</h3>
 <p>Try adjusting your search terms or filters</p>
 </div>
 ) : (
 <div className="overflow-x-auto">
 <table className="min-w-full divide-y divide-border">
 <thead className="bg-muted">
 <tr>
 <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
 Regulatory Body
 </th>
 <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
 Program
 </th>
 <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
 Requirement
 </th>
 <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
 Type
 </th>
 <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
 Compliance Level
 </th>
 <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
 Verification
 </th>
 <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
 Actions
 </th>
 </tr>
 </thead>
 <tbody className="bg-card divide-y divide-border">
 {filteredGuidelines.map((guideline) => (
 <tr key={guideline.id} className="hover:bg-muted">
 <td className="px-6 py-4 whitespace-nowrap">
 {getRegulatoryBodyBadge(guideline.regulatory_body)}
 </td>
 <td className="px-6 py-4 whitespace-nowrap">
 <div>
 <div className="text-sm font-medium text-foreground">
 {guideline.program_name}
 </div>
 <div className="text-sm text-muted-foreground">
 {guideline.program_code}
 </div>
 </div>
 </td>
 <td className="px-6 py-4">
 <div className="text-sm text-foreground max-w-md">
 {guideline.requirement_text}
 </div>
 </td>
 <td className="px-6 py-4 whitespace-nowrap">
 <span className="text-sm text-muted-foreground capitalize">
 {guideline.guideline_type}
 </span>
 </td>
 <td className="px-6 py-4 whitespace-nowrap">
 <div className="flex items-center space-x-2">
 {getComplianceIcon(guideline.compliance_level)}
 {getComplianceBadge(guideline.compliance_level)}
 </div>
 </td>
 <td className="px-6 py-4 whitespace-nowrap">
 <span className={`px-2 py-1 text-xs font-medium rounded-full ${
 guideline.verification_required
 ? 'bg-orange-100 text-orange-800'
 : 'bg-accent text-foreground'
 }`}>
 {guideline.verification_required ? 'Required' : 'Not Required'}
 </span>
 </td>
 <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
 <Button
 variant="ghost"
 size="sm"
 onClick={() => onGuidelineSelect?.(guideline)}
 className="text-primary hover:text-primary-foreground"
 >
 <Eye className="h-4 w-4 mr-1" />
 View
 </Button>
 </td>
 </tr>
 ))}
 </tbody>
 </table>
 </div>
 )}
 </div>
 </div>
 )
}