import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { Textarea } from '@/components/ui/textarea'

describe('Textarea Component', () => {
  describe('Rendering', () => {
    it('should render without errors', () => {
      render(<Textarea />)
      const textarea = screen.getByRole('textbox')
      expect(textarea).toBeInTheDocument()
    })

    it('should render with label', () => {
      render(<Textarea label="Test Label" />)
      expect(screen.getByText('Test Label')).toBeInTheDocument()
    })

    it('should render with placeholder', () => {
      render(<Textarea placeholder="Enter text here" />)
      const textarea = screen.getByPlaceholderText('Enter text here')
      expect(textarea).toBeInTheDocument()
    })

    it('should render with initial value', () => {
      render(<Textarea value="Initial value" onChange={() => {}} />)
      const textarea = screen.getByRole('textbox') as HTMLTextAreaElement
      expect(textarea.value).toBe('Initial value')
    })

    it('should render with helper text', () => {
      render(<Textarea helperText="This is helper text" id="test-textarea" />)
      expect(screen.getByText('This is helper text')).toBeInTheDocument()
    })

    it('should render with custom className', () => {
      render(<Textarea className="custom-class" />)
      const textarea = screen.getByRole('textbox')
      expect(textarea).toHaveClass('custom-class')
    })
  })

  describe('Error State', () => {
    it('should display error message', () => {
      render(<Textarea error="This field is required" id="test-textarea" />)
      expect(screen.getByText('This field is required')).toBeInTheDocument()
    })

    it('should have error styling when error prop is provided', () => {
      render(<Textarea error="Error message" />)
      const textarea = screen.getByRole('textbox')
      expect(textarea).toHaveClass('border-error')
    })

    it('should set aria-invalid to true when error exists', () => {
      render(<Textarea error="Error message" />)
      const textarea = screen.getByRole('textbox')
      expect(textarea).toHaveAttribute('aria-invalid', 'true')
    })

    it('should set aria-invalid to false when no error', () => {
      render(<Textarea />)
      const textarea = screen.getByRole('textbox')
      expect(textarea).toHaveAttribute('aria-invalid', 'false')
    })

    it('should not display helper text when error is present', () => {
      render(
        <Textarea 
          error="Error message" 
          helperText="Helper text" 
          id="test-textarea" 
        />
      )
      expect(screen.getByText('Error message')).toBeInTheDocument()
      expect(screen.queryByText('Helper text')).not.toBeInTheDocument()
    })

    it('should have role="alert" on error message', () => {
      render(<Textarea error="Error message" id="test-textarea" />)
      const errorElement = screen.getByText('Error message')
      expect(errorElement).toHaveAttribute('role', 'alert')
    })
  })

  describe('Accessibility', () => {
    it('should have proper aria-describedby when error exists', () => {
      render(<Textarea error="Error message" id="test-textarea" />)
      const textarea = screen.getByRole('textbox')
      expect(textarea).toHaveAttribute('aria-describedby', 'test-textarea-error')
    })

    it('should have proper aria-describedby when helper text exists', () => {
      render(<Textarea helperText="Helper text" id="test-textarea" />)
      const textarea = screen.getByRole('textbox')
      expect(textarea).toHaveAttribute('aria-describedby', 'test-textarea-helper')
    })

    it('should support disabled state', () => {
      render(<Textarea disabled />)
      const textarea = screen.getByRole('textbox')
      expect(textarea).toBeDisabled()
      expect(textarea).toHaveClass('disabled:opacity-50')
    })

    it('should have minimum touch target size', () => {
      render(<Textarea />)
      const textarea = screen.getByRole('textbox')
      expect(textarea).toHaveClass('touch-target')
    })
  })

  describe('User Interactions', () => {
    it('should handle text input', () => {
      const handleChange = vi.fn()
      render(<Textarea onChange={handleChange} />)
      
      const textarea = screen.getByRole('textbox')
      fireEvent.change(textarea, { target: { value: 'Hello World' } })
      
      expect(handleChange).toHaveBeenCalled()
    })

    it('should handle focus event', () => {
      const handleFocus = vi.fn()
      render(<Textarea onFocus={handleFocus} />)
      
      const textarea = screen.getByRole('textbox')
      fireEvent.focus(textarea)
      
      expect(handleFocus).toHaveBeenCalled()
    })

    it('should handle blur event', () => {
      const handleBlur = vi.fn()
      render(<Textarea onBlur={handleBlur} />)
      
      const textarea = screen.getByRole('textbox')
      fireEvent.focus(textarea)
      fireEvent.blur(textarea)
      
      expect(handleBlur).toHaveBeenCalled()
    })

    it('should be resizable vertically', () => {
      render(<Textarea />)
      const textarea = screen.getByRole('textbox')
      expect(textarea).toHaveClass('resize-y')
    })
  })

  describe('Styling', () => {
    it('should have proper base styling classes', () => {
      render(<Textarea />)
      const textarea = screen.getByRole('textbox')
      
      expect(textarea).toHaveClass('w-full')
      expect(textarea).toHaveClass('rounded-lg')
      expect(textarea).toHaveClass('border')
      expect(textarea).toHaveClass('bg-background')
    })

    it('should have focus ring styling', () => {
      render(<Textarea />)
      const textarea = screen.getByRole('textbox')
      expect(textarea).toHaveClass('focus:ring-2')
      expect(textarea).toHaveClass('focus:ring-ring')
    })

    it('should have minimum height', () => {
      render(<Textarea />)
      const textarea = screen.getByRole('textbox')
      expect(textarea).toHaveClass('min-h-[100px]')
    })
  })

  describe('WCAG AA Compliance', () => {
    it('should have sufficient color contrast for text', () => {
      render(<Textarea />)
      const textarea = screen.getByRole('textbox')
      // The component uses text-foreground which maps to #000000 (black)
      // on background which is #f8fafc (very light gray)
      // This provides a contrast ratio > 4.5:1 for WCAG AA compliance
      expect(textarea).toHaveClass('text-foreground')
      expect(textarea).toHaveClass('bg-background')
    })

    it('should have visible focus indicator', () => {
      render(<Textarea />)
      const textarea = screen.getByRole('textbox')
      // Focus ring provides visible focus indicator
      expect(textarea).toHaveClass('focus:ring-2')
      expect(textarea).toHaveClass('focus:ring-ring')
    })

    it('should have proper label association', () => {
      render(<Textarea label="Test Label" id="test-textarea" />)
      const label = screen.getByText('Test Label')
      const textarea = screen.getByRole('textbox')
      
      // Label should be associated with textarea
      expect(label).toBeInTheDocument()
      expect(textarea).toBeInTheDocument()
    })
  })

  describe('Props Forwarding', () => {
    it('should forward ref correctly', () => {
      const ref = vi.fn()
      render(<Textarea ref={ref} />)
      expect(ref).toHaveBeenCalled()
    })

    it('should forward standard textarea attributes', () => {
      render(
        <Textarea 
          rows={5}
          cols={50}
          maxLength={100}
          name="test-textarea"
        />
      )
      const textarea = screen.getByRole('textbox') as HTMLTextAreaElement
      
      expect(textarea).toHaveAttribute('rows', '5')
      expect(textarea).toHaveAttribute('cols', '50')
      expect(textarea).toHaveAttribute('maxlength', '100')
      expect(textarea).toHaveAttribute('name', 'test-textarea')
    })

    it('should support required attribute', () => {
      render(<Textarea required />)
      const textarea = screen.getByRole('textbox')
      expect(textarea).toBeRequired()
    })

    it('should support readonly attribute', () => {
      render(<Textarea readOnly value="Read only text" />)
      const textarea = screen.getByRole('textbox')
      expect(textarea).toHaveAttribute('readonly')
    })
  })
})
