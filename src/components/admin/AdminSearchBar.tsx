import React, { useState, useRef, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Search, FileText, Users, GraduationCap, Calendar, ArrowRight } from 'lucide-react'
import { useNavigate } from 'react-router-dom'

interface SearchResult {
  id: string
  type: 'application' | 'user' | 'program' | 'intake'
  title: string
  subtitle: string
  url: string
}

export function AdminSearchBar() {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<SearchResult[]>([])
  const [isOpen, setIsOpen] = useState(false)
  const [selectedIndex, setSelectedIndex] = useState(-1)
  const inputRef = useRef<HTMLInputElement>(null)
  const navigate = useNavigate()

  // Mock search results
  const mockResults: SearchResult[] = [
    {
      id: '1',
      type: 'application',
      title: 'John Doe Application',
      subtitle: 'Clinical Medicine - Submitted',
      url: '/admin/applications/1'
    },
    {
      id: '2',
      type: 'user',
      title: 'Jane Smith',
      subtitle: 'Student - jane@example.com',
      url: '/admin/users/2'
    },
    {
      id: '3',
      type: 'program',
      title: 'Clinical Medicine',
      subtitle: 'Active Program - 45 applications',
      url: '/admin/programs/3'
    },
    {
      id: '4',
      type: 'intake',
      title: 'January 2024 Intake',
      subtitle: 'Active - Deadline: Dec 31, 2023',
      url: '/admin/intakes/4'
    }
  ]

  useEffect(() => {
    if (query.length > 2) {
      // Simulate search
      const filtered = mockResults.filter(result =>
        result.title.toLowerCase().includes(query.toLowerCase()) ||
        result.subtitle.toLowerCase().includes(query.toLowerCase())
      )
      setResults(filtered)
      setIsOpen(true)
    } else {
      setResults([])
      setIsOpen(false)
    }
    setSelectedIndex(-1)
  }, [query])

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!isOpen) return

    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault()
        setSelectedIndex(prev => (prev < results.length - 1 ? prev + 1 : prev))
        break
      case 'ArrowUp':
        e.preventDefault()
        setSelectedIndex(prev => (prev > 0 ? prev - 1 : -1))
        break
      case 'Enter':
        e.preventDefault()
        if (selectedIndex >= 0 && results[selectedIndex]) {
          navigate(results[selectedIndex].url)
          setIsOpen(false)
          setQuery('')
        }
        break
      case 'Escape':
        setIsOpen(false)
        inputRef.current?.blur()
        break
    }
  }

  const getIcon = (type: string) => {
    switch (type) {
      case 'application':
        return <FileText className="h-4 w-4 text-blue-500" />
      case 'user':
        return <Users className="h-4 w-4 text-green-500" />
      case 'program':
        return <GraduationCap className="h-4 w-4 text-purple-500" />
      case 'intake':
        return <Calendar className="h-4 w-4 text-orange-500" />
      default:
        return <Search className="h-4 w-4 text-gray-500" />
    }
  }

  const handleResultClick = (result: SearchResult) => {
    navigate(result.url)
    setIsOpen(false)
    setQuery('')
  }

  return (
    <div className="relative w-full max-w-md">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
        <input
          ref={inputRef}
          type="text"
          placeholder="Search applications, users, programs..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={handleKeyDown}
          onFocus={() => query.length > 2 && setIsOpen(true)}
          onBlur={() => setTimeout(() => setIsOpen(false), 200)}
          className="w-full pl-10 pr-4 py-2 bg-white border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-primary transition-all duration-200"
        />
      </div>

      <AnimatePresence>
        {isOpen && results.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 10 }}
            className="absolute top-full left-0 right-0 mt-2 bg-white rounded-lg shadow-xl border border-gray-200 z-50 max-h-80 overflow-y-auto"
          >
            <div className="p-2">
              {results.map((result, index) => (
                <motion.div
                  key={result.id}
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: index * 0.05 }}
                  onClick={() => handleResultClick(result)}
                  className={`flex items-center space-x-3 p-3 rounded-lg cursor-pointer transition-colors ${
                    selectedIndex === index
                      ? 'bg-primary text-white'
                      : 'hover:bg-gray-50'
                  }`}
                >
                  {getIcon(result.type)}
                  <div className="flex-1 min-w-0">
                    <p className={`font-medium text-sm ${
                      selectedIndex === index ? 'text-white' : 'text-gray-900'
                    }`}>
                      {result.title}
                    </p>
                    <p className={`text-xs ${
                      selectedIndex === index ? 'text-white/80' : 'text-gray-500'
                    }`}>
                      {result.subtitle}
                    </p>
                  </div>
                  <ArrowRight className={`h-4 w-4 ${
                    selectedIndex === index ? 'text-white' : 'text-gray-400'
                  }`} />
                </motion.div>
              ))}
            </div>
            
            {results.length === 0 && query.length > 2 && (
              <div className="p-6 text-center text-gray-500">
                <Search className="h-8 w-8 mx-auto mb-2 opacity-50" />
                <p className="text-sm">No results found for "{query}"</p>
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}