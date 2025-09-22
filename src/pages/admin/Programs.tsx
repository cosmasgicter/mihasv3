import React, { useEffect, useState, useCallback } from 'react'
import { Link } from 'react-router-dom'
import { supabase, Institution } from '@/lib/supabase'
import { programService } from '@/services/catalog'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { TextArea } from '@/components/ui/TextArea'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription
} from '@/components/ui/Dialog'
import { LoadingSpinner } from '@/components/ui/LoadingSpinner'
import { AdminNavigation } from '@/components/ui/AdminNavigation'
import { Pencil, Trash2, Plus, ArrowLeft } from 'lucide-react'

interface Program {
  id: string
  name: string
  description?: string
  duration_years: number
  institution_id: string
  is_active: boolean
  institutions?: Institution
}

export default function AdminPrograms() {
  const [programs, setPrograms] = useState<Program[]>([])
  const [institutions, setInstitutions] = useState<Institution[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [showCreate, setShowCreate] = useState(false)
  const [showEdit, setShowEdit] = useState(false)
  const [showDelete, setShowDelete] = useState(false)
  const [currentProgram, setCurrentProgram] = useState<Program | null>(null)
  const [saving, setSaving] = useState(false)

  const [form, setForm] = useState({
    name: '',
    description: '',
    duration_years: 1,
    institution_id: ''
  })

  useEffect(() => {
    loadPrograms()
    loadInstitutions()
  }, [])

  const loadPrograms = async () => {
    try {
      setLoading(true)
      const response = await programService.list()
      setPrograms(response.programs || [])
    } catch (err: any) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  const loadInstitutions = async () => {
    try {
      const { data, error } = await supabase
        .from('institutions')
        .select('*')
        .eq('is_active', true)
        .order('name')
      if (error) throw error
      setInstitutions(data || [])
    } catch (err: any) {
      console.error('Error loading institutions:', err.message)
    }
  }

  const handleChange = useCallback((e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target
    setForm((f) => ({
      ...f,
      [name]: name === 'duration_years' ? Number(value) : value
    }))
  }, [])

  const handleSelectChange = useCallback((e: React.ChangeEvent<HTMLSelectElement>) => {
    const { name, value } = e.target
    setForm((f) => ({
      ...f,
      [name]: value
    }))
  }, [])

  const openCreate = useCallback(() => {
    setForm({ name: '', description: '', duration_years: 1, institution_id: '' })
    setShowCreate(true)
  }, [])

  const openEdit = useCallback((program: Program) => {
    setCurrentProgram(program)
    setForm({
      name: program.name,
      description: program.description || '',
      duration_years: program.duration_years,
      institution_id: program.institution_id
    })
    setShowEdit(true)
  }, [])

  const openDelete = useCallback((program: Program) => {
    setCurrentProgram(program)
    setShowDelete(true)
  }, [])

  const closeCreate = useCallback(() => setShowCreate(false), [])
  const closeEdit = useCallback(() => setShowEdit(false), [])
  const closeDelete = useCallback(() => setShowDelete(false), [])

  const handleOperation = async (operation: () => any, onSuccess: () => void) => {
    try {
      setSaving(true)
      await operation()
      onSuccess()
      await loadPrograms()
    } catch (err: any) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  const createProgram = () => {
    // Validate form
    if (!form.name.trim()) {
      setError('Program name is required')
      return
    }
    if (!form.institution_id) {
      setError('Institution is required')
      return
    }
    if (form.duration_years < 1 || form.duration_years > 10) {
      setError('Duration must be between 1 and 10 years')
      return
    }
    
    handleOperation(
      () => programService.create({
        name: form.name.trim(),
        description: form.description.trim(),
        duration_years: form.duration_years,
        institution_id: form.institution_id
      }),
      () => setShowCreate(false)
    )
  }

  const updateProgram = () => {
    if (!currentProgram) return
    
    // Validate form
    if (!form.name.trim()) {
      setError('Program name is required')
      return
    }
    if (!form.institution_id) {
      setError('Institution is required')
      return
    }
    if (form.duration_years < 1 || form.duration_years > 10) {
      setError('Duration must be between 1 and 10 years')
      return
    }
    
    handleOperation(
      () => programService.update({
        id: currentProgram.id,
        name: form.name.trim(),
        description: form.description.trim(),
        duration_years: form.duration_years,
        institution_id: form.institution_id
      }),
      () => {
        setShowEdit(false)
        setCurrentProgram(null)
      }
    )
  }

  const deleteProgram = () => {
    if (!currentProgram) return
    handleOperation(
      () => programService.delete(currentProgram.id),
      () => {
        setShowDelete(false)
        setCurrentProgram(null)
      }
    )
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-purple-50">
      <AdminNavigation />
      <div className="container-mobile py-4 sm:py-6 lg:py-8 safe-area-bottom">
        <div className="bg-white rounded-2xl shadow-xl border border-gray-100 overflow-hidden">
          {/* Header - Mobile First */}
          <div className="bg-gradient-to-r from-primary to-secondary p-6 text-white">
            <div className="flex flex-col space-y-4 sm:flex-row sm:items-center sm:justify-between sm:space-y-0">
              <div className="flex flex-col space-y-3 sm:flex-row sm:items-center sm:space-y-0 sm:space-x-4">
                <Link to="/admin">
                  <Button variant="ghost" size="sm" className="text-white hover:bg-white/20 border-white/30">
                    <ArrowLeft className="h-4 w-4 mr-2" />
                    Back
                  </Button>
                </Link>
                <div>
                  <h1 className="text-2xl sm:text-3xl font-bold">🎓 Programs</h1>
                  <p className="text-white/90 text-sm sm:text-base">Manage academic programs</p>
                </div>
              </div>
              <Button 
                onClick={openCreate}
                className="bg-white text-primary hover:bg-gray-100 font-semibold shadow-lg"
              >
                <Plus className="h-4 w-4 mr-2" /> Add Program
              </Button>
            </div>
          </div>

          {/* Content */}
          <div className="p-6">

            {loading ? (
              <div className="flex justify-center py-16">
                <div className="text-center">
                  <LoadingSpinner size="lg" />
                  <p className="mt-4 text-lg text-gray-600">Loading programs...</p>
                </div>
              </div>
            ) : error ? (
              <div className="rounded-xl bg-red-50 border border-red-200 p-6 text-center">
                <div className="text-6xl mb-4">😱</div>
                <p className="text-red-600 font-medium text-lg">{error}</p>
                <Button 
                  onClick={loadPrograms} 
                  variant="outline" 
                  className="mt-4 text-red-600 border-red-300 hover:bg-red-50"
                >
                  Try Again
                </Button>
              </div>
            ) : programs.length === 0 ? (
              <div className="text-center py-16">
                <div className="text-8xl mb-6">🎓</div>
                <h3 className="text-2xl font-bold text-gray-900 mb-2">No Programs Yet</h3>
                <p className="text-gray-600 mb-6 max-w-md mx-auto">
                  Start by creating your first academic program. Programs define the courses and duration for student applications.
                </p>
                <Button onClick={openCreate} className="bg-gradient-to-r from-primary to-secondary text-white font-semibold">
                  <Plus className="h-5 w-5 mr-2" />
                  Create First Program
                </Button>
              </div>
            ) : (
              <>
                {/* Mobile Cards View */}
                <div className="block sm:hidden space-y-4">
                  {programs.map((program) => (
                    <div key={program.id} className="bg-gray-50 rounded-xl p-4 border border-gray-200">
                      <div className="flex items-start justify-between mb-3">
                        <div className="flex-1">
                          <h3 className="font-bold text-lg text-gray-900">{program.name}</h3>
                          <p className="text-sm text-gray-600 mt-1">
                            Duration: {program.duration_years} year{program.duration_years !== 1 ? 's' : ''}
                          </p>
                          <p className="text-sm text-blue-600 font-medium mt-1">
                            {program.institutions?.name || 'Unknown Institution'}
                          </p>
                          {program.description && (
                            <p className="text-sm text-gray-500 mt-2 line-clamp-2">{program.description}</p>
                          )}
                        </div>
                      </div>
                      <div className="flex space-x-2">
                        <Button 
                          variant="outline" 
                          size="sm" 
                          onClick={() => openEdit(program)}
                          className="flex-1 text-blue-600 border-blue-300 hover:bg-blue-50"
                        >
                          <Pencil className="h-4 w-4 mr-1" />
                          Edit
                        </Button>
                        <Button 
                          variant="outline" 
                          size="sm" 
                          onClick={() => openDelete(program)}
                          className="flex-1 text-red-600 border-red-300 hover:bg-red-50"
                        >
                          <Trash2 className="h-4 w-4 mr-1" />
                          Delete
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>

                {/* Desktop Table View */}
                <div className="hidden sm:block overflow-x-auto">
                  <table className="min-w-full divide-y divide-gray-200">
                    <thead className="bg-gradient-to-r from-gray-50 to-blue-50">
                      <tr>
                        <th className="px-6 py-4 text-left text-sm font-bold text-gray-700 uppercase tracking-wider">
                          🎓 Program Name
                        </th>
                        <th className="px-6 py-4 text-left text-sm font-bold text-gray-700 uppercase tracking-wider">
                          🏫 Institution
                        </th>
                        <th className="px-6 py-4 text-left text-sm font-bold text-gray-700 uppercase tracking-wider">
                          🕰️ Duration
                        </th>
                        <th className="px-6 py-4 text-left text-sm font-bold text-gray-700 uppercase tracking-wider">
                          📝 Description
                        </th>
                        <th className="px-6 py-4 text-right text-sm font-bold text-gray-700 uppercase tracking-wider">
                          ⚙️ Actions
                        </th>
                      </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                      {programs.map((program) => (
                        <tr key={program.id} className="hover:bg-blue-50 transition-colors">
                          <td className="px-6 py-4">
                            <div className="font-semibold text-gray-900">{program.name}</div>
                          </td>
                          <td className="px-6 py-4">
                            <span className="inline-flex items-center px-3 py-1 rounded-full text-sm font-medium bg-green-100 text-green-800">
                              {program.institutions?.name || 'Unknown'}
                            </span>
                          </td>
                          <td className="px-6 py-4">
                            <span className="inline-flex items-center px-3 py-1 rounded-full text-sm font-medium bg-blue-100 text-blue-800">
                              {program.duration_years} year{program.duration_years !== 1 ? 's' : ''}
                            </span>
                          </td>
                          <td className="px-6 py-4">
                            <div className="text-sm text-gray-600 max-w-xs truncate">
                              {program.description || 'No description provided'}
                            </div>
                          </td>
                          <td className="px-6 py-4 text-right">
                            <div className="flex items-center justify-end space-x-2">
                              <Button 
                                variant="outline" 
                                size="sm" 
                                onClick={() => openEdit(program)}
                                className="text-blue-600 border-blue-300 hover:bg-blue-50"
                              >
                                <Pencil className="h-4 w-4" />
                              </Button>
                              <Button 
                                variant="outline" 
                                size="sm" 
                                onClick={() => openDelete(program)}
                                className="text-red-600 border-red-300 hover:bg-red-50"
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Create Program Dialog */}
      <Dialog open={showCreate} onOpenChange={setShowCreate}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create Program</DialogTitle>
            <DialogDescription>Enter program details below.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <Input label="Name" name="name" value={form.name} onChange={handleChange} required />
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Institution</label>
              <select
                name="institution_id"
                value={form.institution_id}
                onChange={handleSelectChange}
                className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                required
              >
                <option value="">Select an institution</option>
                {institutions.map((institution) => (
                  <option key={institution.id} value={institution.id}>
                    {institution.name}
                  </option>
                ))}
              </select>
            </div>
            <TextArea label="Description" name="description" value={form.description} onChange={handleChange} />
            <Input label="Duration (years)" type="number" name="duration_years" value={form.duration_years} onChange={handleChange} />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={closeCreate} disabled={saving}>Cancel</Button>
            <Button onClick={createProgram} loading={saving}>Create</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Program Dialog */}
      <Dialog open={showEdit} onOpenChange={setShowEdit}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Program</DialogTitle>
            <DialogDescription>Update program details below.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <Input label="Name" name="name" value={form.name} onChange={handleChange} required />
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Institution</label>
              <select
                name="institution_id"
                value={form.institution_id}
                onChange={handleSelectChange}
                className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                required
              >
                <option value="">Select an institution</option>
                {institutions.map((institution) => (
                  <option key={institution.id} value={institution.id}>
                    {institution.name}
                  </option>
                ))}
              </select>
            </div>
            <TextArea label="Description" name="description" value={form.description} onChange={handleChange} />
            <Input label="Duration (years)" type="number" name="duration_years" value={form.duration_years} onChange={handleChange} />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={closeEdit} disabled={saving}>Cancel</Button>
            <Button onClick={updateProgram} loading={saving}>Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Program Dialog */}
      <Dialog open={showDelete} onOpenChange={setShowDelete}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Program</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete "{currentProgram?.name}"? This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={closeDelete} disabled={saving}>Cancel</Button>
            <Button variant="danger" onClick={deleteProgram} loading={saving}>Delete</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
