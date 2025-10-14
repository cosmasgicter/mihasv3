import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { BrowserRouter } from 'react-router-dom'
import { EnhancedLoadingSpinner } from '@/components/ui/EnhancedLoadingSpinner'
import { EnhancedFileUpload } from '@/components/ui/EnhancedFileUpload'
import { MobileOptimizedButton } from '@/components/ui/MobileOptimizedButton'
import { SaveStatus } from '@/components/ui/SaveStatus'

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { retry: false },
    mutations: { retry: false }
  }
})

const TestWrapper = ({ children }: { children: React.ReactNode }) => (
  <QueryClientProvider client={queryClient}>
    <BrowserRouter>
      {children}
    </BrowserRouter>
  </QueryClientProvider>
)

describe('UI Components', () => {
  describe('EnhancedLoadingSpinner', () => {
    it('renders with default props', () => {
      render(
        <TestWrapper>
          <EnhancedLoadingSpinner />
        </TestWrapper>
      )
      
      expect(screen.getByRole('status')).toBeInTheDocument()
    })

    it('displays custom message', () => {
      render(
        <TestWrapper>
          <EnhancedLoadingSpinner message="Loading applications..." />
        </TestWrapper>
      )
      
      expect(screen.getByText('Loading applications...')).toBeInTheDocument()
    })

    it('renders different variants', () => {
      const { rerender } = render(
        <TestWrapper>
          <EnhancedLoadingSpinner variant="spinner" />
        </TestWrapper>
      )
      
      expect(screen.getByRole('status')).toHaveClass('animate-spin')
      
      rerender(
        <TestWrapper>
          <EnhancedLoadingSpinner variant="skeleton" />
        </TestWrapper>
      )
      
      expect(screen.getByRole('status')).toHaveClass('animate-pulse')
    })
  })

  describe('EnhancedFileUpload', () => {
    it('renders file input', () => {
      const mockOnFileSelect = vi.fn()
      
      render(
        <TestWrapper>
          <EnhancedFileUpload onFileSelect={mockOnFileSelect} />
        </TestWrapper>
      )
      
      expect(screen.getByRole('button')).toBeInTheDocument()
    })

    it('handles file selection', async () => {
      const mockOnFileSelect = vi.fn()
      
      render(
        <TestWrapper>
          <EnhancedFileUpload onFileSelect={mockOnFileSelect} />
        </TestWrapper>
      )
      
      const file = new File(['test'], 'test.pdf', { type: 'application/pdf' })
      const input = screen.getByRole('button')
      
      fireEvent.drop(input, {
        dataTransfer: {
          files: [file]
        }
      })
      
      await waitFor(() => {
        expect(mockOnFileSelect).toHaveBeenCalledWith([file])
      })
    })

    it('validates file types', () => {
      const mockOnFileSelect = vi.fn()
      
      render(
        <TestWrapper>
          <EnhancedFileUpload 
            onFileSelect={mockOnFileSelect}
            accept={['image/*']}
          />
        </TestWrapper>
      )
      
      const file = new File(['test'], 'test.txt', { type: 'text/plain' })
      const input = screen.getByRole('button')
      
      fireEvent.drop(input, {
        dataTransfer: {
          files: [file]
        }
      })
      
      expect(screen.getByText(/Invalid file type/)).toBeInTheDocument()
    })
  })

  describe('MobileOptimizedButton', () => {
    it('meets minimum touch target size', () => {
      render(
        <TestWrapper>
          <MobileOptimizedButton>Test Button</MobileOptimizedButton>
        </TestWrapper>
      )
      
      const button = screen.getByRole('button')
      const styles = window.getComputedStyle(button)
      
      expect(parseInt(styles.minHeight)).toBeGreaterThanOrEqual(44)
      expect(parseInt(styles.minWidth)).toBeGreaterThanOrEqual(44)
    })

    it('handles touch events', () => {
      const mockOnClick = vi.fn()
      
      render(
        <TestWrapper>
          <MobileOptimizedButton onClick={mockOnClick}>
            Test Button
          </MobileOptimizedButton>
        </TestWrapper>
      )
      
      const button = screen.getByRole('button')
      fireEvent.touchStart(button)
      fireEvent.touchEnd(button)
      
      expect(mockOnClick).toHaveBeenCalled()
    })
  })

  describe('SaveStatus', () => {
    it('displays saving state', () => {
      render(
        <TestWrapper>
          <SaveStatus isSaving={true} lastSaved={null} />
        </TestWrapper>
      )
      
      expect(screen.getByText('Saving...')).toBeInTheDocument()
    })

    it('displays last saved time', () => {
      const lastSaved = new Date()
      
      render(
        <TestWrapper>
          <SaveStatus isSaving={false} lastSaved={lastSaved} />
        </TestWrapper>
      )
      
      expect(screen.getByText(/Saved/)).toBeInTheDocument()
    })

    it('displays error state', () => {
      render(
        <TestWrapper>
          <SaveStatus 
            isSaving={false} 
            lastSaved={null} 
            error="Save failed" 
          />
        </TestWrapper>
      )
      
      expect(screen.getByText('Save failed')).toBeInTheDocument()
    })
  })
})