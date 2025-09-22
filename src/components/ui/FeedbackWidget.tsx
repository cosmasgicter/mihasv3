import React, { useState } from 'react'
import { useFeedback, FeedbackData } from '@/hooks/useFeedback'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { TextArea } from '@/components/ui/TextArea'
import { MessageSquare, X, Star } from 'lucide-react'

export function FeedbackWidget() {
  const [isOpen, setIsOpen] = useState(false)
  const [feedback, setFeedback] = useState<Partial<FeedbackData>>({
    type: 'general',
    rating: 5
  })
  const [submitted, setSubmitted] = useState(false)
  const { submitFeedback, loading } = useFeedback()

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    
    if (!feedback.message?.trim()) return

    const success = await submitFeedback({
      type: feedback.type as FeedbackData['type'],
      rating: feedback.rating || 5,
      message: feedback.message,
      page: window.location.pathname
    })

    if (success) {
      setSubmitted(true)
      setTimeout(() => {
        setIsOpen(false)
        setSubmitted(false)
        setFeedback({ type: 'general', rating: 5 })
      }, 2000)
    }
  }

  if (!isOpen) {
    return (
      <div className="fixed bottom-4 right-4 z-50">
        <Button
          onClick={() => setIsOpen(true)}
          className="rounded-full w-12 h-12 shadow-lg"
        >
          <MessageSquare className="h-5 w-5" />
        </Button>
      </div>
    )
  }

  return (
    <div className="fixed bottom-4 right-4 z-50 w-80 bg-white border rounded-lg shadow-xl">
      <div className="p-4">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-semibold">Feedback</h3>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setIsOpen(false)}
          >
            <X className="h-4 w-4" />
          </Button>
        </div>

        {submitted ? (
          <div className="text-center py-4">
            <p className="text-green-600">Thank you for your feedback!</p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium mb-1">Type</label>
              <select
                value={feedback.type}
                onChange={(e) => setFeedback(prev => ({ ...prev, type: e.target.value as FeedbackData['type'] }))}
                className="w-full p-2 border rounded"
              >
                <option value="general">General</option>
                <option value="bug">Bug Report</option>
                <option value="feature">Feature Request</option>
                <option value="improvement">Improvement</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium mb-1">Rating</label>
              <div className="flex space-x-1">
                {[1, 2, 3, 4, 5].map((star) => (
                  <button
                    key={star}
                    type="button"
                    onClick={() => setFeedback(prev => ({ ...prev, rating: star }))}
                    className={`p-1 ${star <= (feedback.rating || 0) ? 'text-yellow-400' : 'text-gray-300'}`}
                  >
                    <Star className="h-4 w-4 fill-current" />
                  </button>
                ))}
              </div>
            </div>

            <TextArea
              placeholder="Your feedback..."
              value={feedback.message || ''}
              onChange={(e) => setFeedback(prev => ({ ...prev, message: e.target.value }))}
              rows={3}
              required
            />

            <Button type="submit" disabled={loading} className="w-full">
              {loading ? 'Submitting...' : 'Submit Feedback'}
            </Button>
          </form>
        )}
      </div>
    </div>
  )
}