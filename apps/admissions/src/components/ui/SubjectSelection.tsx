import React, { useState, useMemo } from 'react'
import { Button } from './Button'
import { Input } from './input'
import { Plus, Search, GripVertical, X, AlertCircle } from 'lucide-react'
import { Subject } from '@/forms/applicationSchema'

interface SubjectSelectionProps {
  selectedSubjects: Subject[]
  onSubjectsChange: (subjects: Subject[]) => void
  error?: string
}

const AVAILABLE_SUBJECTS: Subject[] = [
  // Core Subjects (Required)
  { id: 'math', name: 'Mathematics', code: 'MATH', category: 'core' },
  { id: 'eng', name: 'English', code: 'ENG', category: 'core' },
  { id: 'bio', name: 'Biology', code: 'BIO', category: 'core' },
  { id: 'chem', name: 'Chemistry', code: 'CHEM', category: 'core' },
  { id: 'phy', name: 'Physics', code: 'PHY', category: 'core' },
  
  // Sciences
  { id: 'agr_sci', name: 'Agricultural Science', code: 'AGR', category: 'elective' },
  { id: 'add_math', name: 'Additional Mathematics', code: 'ADDMATH', category: 'elective' },
  { id: 'comp_sci', name: 'Computer Science', code: 'CS', category: 'elective' },
  
  // Languages
  { id: 'bemba', name: 'Bemba', code: 'BEMBA', category: 'elective' },
  { id: 'nyanja', name: 'Nyanja', code: 'NYANJA', category: 'elective' },
  { id: 'tonga', name: 'Tonga', code: 'TONGA', category: 'elective' },
  { id: 'lozi', name: 'Lozi', code: 'LOZI', category: 'elective' },
  { id: 'kaonde', name: 'Kaonde', code: 'KAONDE', category: 'elective' },
  { id: 'lunda', name: 'Lunda', code: 'LUNDA', category: 'elective' },
  { id: 'luvale', name: 'Luvale', code: 'LUVALE', category: 'elective' },
  { id: 'french', name: 'French', code: 'FRENCH', category: 'elective' },
  { id: 'portuguese', name: 'Portuguese', code: 'PORT', category: 'elective' },
  
  // Social Sciences
  { id: 'geo', name: 'Geography', code: 'GEO', category: 'elective' },
  { id: 'hist', name: 'History', code: 'HIST', category: 'elective' },
  { id: 'rel_ed', name: 'Religious Education', code: 'RE', category: 'elective' },
  { id: 'civic_ed', name: 'Civic Education', code: 'CE', category: 'elective' },
  { id: 'dev_studies', name: 'Development Studies', code: 'DS', category: 'elective' },
  
  // Business & Economics
  { id: 'accounts', name: 'Principles of Accounts', code: 'POA', category: 'elective' },
  { id: 'commerce', name: 'Commerce', code: 'COM', category: 'elective' },
  { id: 'economics', name: 'Economics', code: 'ECON', category: 'elective' },
  { id: 'business', name: 'Business Studies', code: 'BS', category: 'elective' },
  
  // Technical & Practical
  { id: 'design_tech', name: 'Design & Technology', code: 'DT', category: 'elective' },
  { id: 'home_econ', name: 'Home Economics', code: 'HE', category: 'elective' },
  { id: 'art', name: 'Art', code: 'ART', category: 'elective' },
  { id: 'music', name: 'Music', code: 'MUSIC', category: 'elective' },
  { id: 'pe', name: 'Physical Education', code: 'PE', category: 'elective' },
  { id: 'ict', name: 'Information & Communication Technology', code: 'ICT', category: 'elective' },
  
  // Applied Sciences
  { id: 'env_sci', name: 'Environmental Science', code: 'ES', category: 'elective' },
  { id: 'food_nutr', name: 'Food & Nutrition', code: 'FN', category: 'elective' },
  { id: 'health_sci', name: 'Health Science', code: 'HS', category: 'elective' }
]

export function SubjectSelection({ selectedSubjects, onSubjectsChange, error }: SubjectSelectionProps) {
  const [searchTerm, setSearchTerm] = useState('')
  const [showAddForm, setShowAddForm] = useState(false)
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null)

  const filteredSubjects = useMemo(() => {
    return AVAILABLE_SUBJECTS.filter(subject => 
      !selectedSubjects.find(s => s.id === subject.id) &&
      (subject.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
       subject.code.toLowerCase().includes(searchTerm.toLowerCase()))
    )
  }, [selectedSubjects, searchTerm])

  const addSubject = (subject: Subject) => {
    if (selectedSubjects.length < 10) {
      onSubjectsChange([...selectedSubjects, { ...subject, grade: '', score: 0 }])
    }
  }

  const removeSubject = (subjectId: string) => {
    onSubjectsChange(selectedSubjects.filter(s => s.id !== subjectId))
  }

  const updateSubject = (subjectId: string, field: 'grade' | 'score', value: string | number) => {
    onSubjectsChange(
      selectedSubjects.map(s => 
        s.id === subjectId ? { ...s, [field]: value } : s
      )
    )
  }

  const handleDragStart = (index: number) => {
    setDraggedIndex(index)
  }

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault()
  }

  const handleDrop = (e: React.DragEvent, dropIndex: number) => {
    e.preventDefault()
    if (draggedIndex === null) return

    const newSubjects = [...selectedSubjects]
    const draggedSubject = newSubjects[draggedIndex]!
    newSubjects.splice(draggedIndex, 1)
    newSubjects.splice(dropIndex, 0, draggedSubject)
    
    onSubjectsChange(newSubjects)
    setDraggedIndex(null)
  }

  const coreSubjects = selectedSubjects.filter(s => s.category === 'core')
  const electiveSubjects = selectedSubjects.filter(s => s.category === 'elective')

  return (
    <div className="space-y-6">
      {/* Header with counter and add button */}
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-4">
          <h3 className="text-lg font-semibold text-foreground">
            Subject Selection
          </h3>
          <div className={`px-3 py-1 rounded-full text-sm font-medium ${
            selectedSubjects.length >= 5 
              ? 'bg-accent/10 text-accent-foreground' 
              : 'bg-destructive/10 text-destructive-foreground'
          }`}>
            {selectedSubjects.length}/10 subjects
          </div>
        </div>
        
        <Button
          type="button"
          onClick={() => setShowAddForm(!showAddForm)}
          className="bg-primary hover:bg-primary fixed bottom-6 right-6 rounded-full w-14 h-14 shadow-lg z-10 md:relative md:bottom-auto md:right-auto md:w-auto md:h-auto md:rounded-md"
          aria-label={showAddForm ? "Close subject selection" : "Add subject"}
          aria-expanded={showAddForm}
        >
          <Plus className="h-5 w-5 md:mr-2" aria-hidden="true" />
          <span className="hidden md:inline">Add Subject</span>
        </Button>
      </div>

      {/* Minimum requirement warning */}
      {selectedSubjects.length < 5 && (
        <div className="bg-destructive/5 border border-destructive/30 rounded-lg p-4 flex items-start space-x-3">
          <AlertCircle className="h-5 w-5 text-error mt-0.5" />
          <div>
            <p className="text-sm font-medium text-destructive-foreground">
              Minimum 5 subjects required
            </p>
            <p className="text-sm text-error">
              You need to select at least {5 - selectedSubjects.length} more subject(s) to proceed.
            </p>
          </div>
        </div>
      )}

      {/* Add subject form */}
      {showAddForm && (
        <div className="bg-muted border rounded-lg p-4" role="search" aria-label="Subject search and selection">
          <div className="flex items-center space-x-3 mb-4">
            <div className="relative flex-1">
              <Search className="h-4 w-4 absolute left-3 top-1/2 transform -translate-y-1/2 text-foreground" aria-hidden="true" />
              <input
                type="text"
                placeholder="Search subjects..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-10 pr-3 py-2 border border-input rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                aria-label="Search for subjects by name or code"
              />
            </div>
            <Button
              type="button"
              variant="ghost"
              onClick={() => setShowAddForm(false)}
              aria-label="Close subject selection"
            >
              <X className="h-4 w-4" aria-hidden="true" />
            </Button>
          </div>
          
          <div 
            className="grid grid-cols-1 md:grid-cols-2 gap-2 max-h-40 overflow-y-auto"
            role="list"
            aria-label="Available subjects"
          >
            {filteredSubjects.map((subject) => (
              <button
                key={subject.id}
                type="button"
                onClick={() => addSubject(subject)}
                className="flex items-center justify-between p-3 border border-border rounded-lg hover:bg-card hover:border-primary/30 transition-colors text-left"
                aria-label={`Add ${subject.name} (${subject.code}) - ${subject.category} subject`}
              >
                <div>
                  <p className="font-medium text-foreground">{subject.name}</p>
                  <p className="text-sm text-foreground">{subject.code} • {subject.category}</p>
                </div>
                <Plus className="h-4 w-4 text-foreground" aria-hidden="true" />
              </button>
            ))}
          </div>
          
          {filteredSubjects.length === 0 && (
            <p className="text-center text-foreground py-4" role="status">
              {searchTerm ? 'No subjects found matching your search.' : 'All available subjects have been added.'}
            </p>
          )}
        </div>
      )}

      {/* Selected subjects */}
      {selectedSubjects.length > 0 && (
        <div className="space-y-4">
          {/* Core subjects */}
          {coreSubjects.length > 0 && (
            <div>
              <h4 className="font-medium text-foreground mb-3">Core Subjects ({coreSubjects.length})</h4>
              <div className="space-y-2" role="list" aria-label="Selected core subjects">
                {coreSubjects.map((subject, index) => (
                  <SubjectCard
                    key={subject.id}
                    subject={subject}
                    index={selectedSubjects.indexOf(subject)}
                    onRemove={removeSubject}
                    onUpdate={updateSubject}
                    onDragStart={handleDragStart}
                    onDragOver={handleDragOver}
                    onDrop={handleDrop}
                  />
                ))}
              </div>
              {/* Add subject button after core subjects */}
              <AddSubjectButton 
                onClick={() => setShowAddForm(!showAddForm)}
                isOpen={showAddForm}
                disabled={selectedSubjects.length >= 10}
              />
            </div>
          )}

          {/* Elective subjects */}
          {electiveSubjects.length > 0 && (
            <div>
              <h4 className="font-medium text-foreground mb-3">Elective Subjects ({electiveSubjects.length})</h4>
              <div className="space-y-2" role="list" aria-label="Selected elective subjects">
                {electiveSubjects.map((subject, index) => (
                  <SubjectCard
                    key={subject.id}
                    subject={subject}
                    index={selectedSubjects.indexOf(subject)}
                    onRemove={removeSubject}
                    onUpdate={updateSubject}
                    onDragStart={handleDragStart}
                    onDragOver={handleDragOver}
                    onDrop={handleDrop}
                  />
                ))}
              </div>
              {/* Add subject button after elective subjects */}
              <AddSubjectButton 
                onClick={() => setShowAddForm(!showAddForm)}
                isOpen={showAddForm}
                disabled={selectedSubjects.length >= 10}
              />
            </div>
          )}
          
          {/* Show add button if no subjects selected */}
          {selectedSubjects.length === 0 && (
            <div className="text-center py-8">
              <p className="text-foreground mb-4">No subjects selected yet</p>
              <AddSubjectButton 
                onClick={() => setShowAddForm(!showAddForm)}
                isOpen={showAddForm}
                disabled={false}
                variant="primary"
              />
            </div>
          )}
        </div>
      )}

      {error && (
        <p className="text-sm text-destructive">{error}</p>
      )}
    </div>
  )
}

interface SubjectCardProps {
  subject: Subject
  index: number
  onRemove: (id: string) => void
  onUpdate: (id: string, field: 'grade' | 'score', value: string | number) => void
  onDragStart: (index: number) => void
  onDragOver: (e: React.DragEvent) => void
  onDrop: (e: React.DragEvent, index: number) => void
}

interface AddSubjectButtonProps {
  onClick: () => void
  isOpen: boolean
  disabled: boolean
  variant?: 'primary' | 'secondary'
}

function AddSubjectButton({ onClick, isOpen, disabled, variant = 'secondary' }: AddSubjectButtonProps) {
  const isPrimary = variant === 'primary'
  
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`w-full p-4 border-2 border-dashed rounded-lg transition-all duration-200 ${
        disabled 
          ? 'border-border text-foreground cursor-not-allowed'
          : isPrimary
          ? 'border-primary/30 text-primary hover:border-primary/50 hover:bg-primary/5'
          : 'border-input text-foreground hover:border-input hover:bg-muted'
      } ${isOpen ? 'bg-primary/5 border-primary/50' : ''}`}
    >
      <div className="flex items-center justify-center space-x-2">
        <Plus className={`h-5 w-5 ${isOpen ? 'rotate-45' : ''} transition-transform duration-200`} />
        <span className="font-medium">
          {isOpen ? 'Close Subject Selection' : 'Add Another Subject'}
        </span>
      </div>
      {!disabled && (
        <p className="text-sm mt-1 opacity-75">
          {isPrimary ? 'Start by adding your first subject' : 'Click to browse available subjects'}
        </p>
      )}
    </button>
  )
}

function SubjectCard({ 
  subject, 
  index, 
  onRemove, 
  onUpdate, 
  onDragStart, 
  onDragOver, 
  onDrop 
}: SubjectCardProps) {
  const gradeId = `grade-${subject.id}`
  const scoreId = `score-${subject.id}`
  
  return (
    <div
      draggable
      onDragStart={() => onDragStart(index)}
      onDragOver={onDragOver}
      onDrop={(e) => onDrop(e, index)}
      className="bg-card border border-border rounded-lg p-4 hover:border-input transition-colors cursor-move"
      role="listitem"
      aria-label={`${subject.name} subject card`}
    >
      <div className="flex items-center space-x-4">
        <GripVertical className="h-5 w-5 text-foreground" aria-label="Drag to reorder" />
        
        <div className="flex-1">
          <div className="flex items-center justify-between mb-2">
            <div>
              <p className="font-medium text-foreground">{subject.name}</p>
              <p className="text-sm text-foreground">{subject.code}</p>
            </div>
            <button
              type="button"
              onClick={() => onRemove(subject.id)}
              className="text-error hover:text-error transition-colors"
              aria-label={`Remove ${subject.name} from selection`}
            >
              <X className="h-4 w-4" aria-hidden="true" />
            </button>
          </div>
          
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor={gradeId} className="block text-xs font-medium text-foreground mb-1">
                Grade
              </label>
              <select
                id={gradeId}
                value={subject.grade || ''}
                onChange={(e) => onUpdate(subject.id, 'grade', e.target.value)}
                className="w-full px-2 py-1 text-sm border border-input rounded focus:outline-none focus:ring-1 focus:ring-ring"
                aria-label={`Grade for ${subject.name}`}
              >
                <option value="">Select grade</option>
                <option value="1">1 (A+ - Distinction)</option>
                <option value="2">2 (A - Distinction)</option>
                <option value="3">3 (B+ - Merit)</option>
                <option value="4">4 (B - Merit)</option>
                <option value="5">5 (C+ - Credit)</option>
                <option value="6">6 (C - Credit)</option>
                <option value="7">7 (D+ - Pass)</option>
                <option value="8">8 (D - Pass)</option>
                <option value="9">9 (F - Fail)</option>
              </select>
            </div>
            
            <div>
              <label htmlFor={scoreId} className="block text-xs font-medium text-foreground mb-1">
                Score (%)
              </label>
              <input
                id={scoreId}
                type="number"
                min="0"
                max="100"
                value={subject.score || ''}
                onChange={(e) => onUpdate(subject.id, 'score', parseInt(e.target.value) || 0)}
                className="w-full px-2 py-1 text-sm border border-input rounded focus:outline-none focus:ring-1 focus:ring-ring"
                placeholder="0-100"
                aria-label={`Score percentage for ${subject.name}`}
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}