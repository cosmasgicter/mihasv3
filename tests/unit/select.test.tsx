import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  SelectGroup,
  SelectLabel,
  SelectSeparator
} from '@/components/ui/select'

describe('Select Component', () => {
  describe('Rendering', () => {
    it('should render without errors', () => {
      render(
        <Select>
          <SelectTrigger data-testid="trigger">
            <SelectValue placeholder="Select an option" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="option1">Option 1</SelectItem>
          </SelectContent>
        </Select>
      )
      
      expect(screen.getByTestId('trigger')).toBeInTheDocument()
    })

    it('should render with placeholder', () => {
      render(
        <Select>
          <SelectTrigger>
            <SelectValue placeholder="Choose something" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="option1">Option 1</SelectItem>
          </SelectContent>
        </Select>
      )
      
      expect(screen.getByText('Choose something')).toBeInTheDocument()
    })

    it('should render with selected value', () => {
      render(
        <Select value="option1">
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="option1">Option 1</SelectItem>
            <SelectItem value="option2">Option 2</SelectItem>
          </SelectContent>
        </Select>
      )
      
      expect(screen.getByText('Option 1')).toBeInTheDocument()
    })

    it('should render with custom className', () => {
      render(
        <Select>
          <SelectTrigger className="custom-class" data-testid="trigger">
            <SelectValue placeholder="Select" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="option1">Option 1</SelectItem>
          </SelectContent>
        </Select>
      )
      
      expect(screen.getByTestId('trigger')).toHaveClass('custom-class')
    })
  })

  describe('Error State', () => {
    it('should have error styling when error prop is true', () => {
      render(
        <Select>
          <SelectTrigger error={true} data-testid="trigger">
            <SelectValue placeholder="Select" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="option1">Option 1</SelectItem>
          </SelectContent>
        </Select>
      )
      
      const trigger = screen.getByTestId('trigger')
      expect(trigger).toHaveClass('border-destructive')
    })

    it('should set aria-invalid to true when error exists', () => {
      render(
        <Select>
          <SelectTrigger error={true} data-testid="trigger">
            <SelectValue placeholder="Select" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="option1">Option 1</SelectItem>
          </SelectContent>
        </Select>
      )
      
      expect(screen.getByTestId('trigger')).toHaveAttribute('aria-invalid', 'true')
    })

    it('should set aria-invalid to false when no error', () => {
      render(
        <Select>
          <SelectTrigger error={false} data-testid="trigger">
            <SelectValue placeholder="Select" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="option1">Option 1</SelectItem>
          </SelectContent>
        </Select>
      )
      
      expect(screen.getByTestId('trigger')).toHaveAttribute('aria-invalid', 'false')
    })

    it('should have error focus ring when error is true', () => {
      render(
        <Select>
          <SelectTrigger error={true} data-testid="trigger">
            <SelectValue placeholder="Select" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="option1">Option 1</SelectItem>
          </SelectContent>
        </Select>
      )
      
      expect(screen.getByTestId('trigger')).toHaveClass('focus:ring-destructive')
    })
  })

  describe('Accessibility', () => {
    it('should have combobox role', () => {
      render(
        <Select>
          <SelectTrigger data-testid="trigger">
            <SelectValue placeholder="Select" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="option1">Option 1</SelectItem>
          </SelectContent>
        </Select>
      )
      
      expect(screen.getByTestId('trigger')).toHaveAttribute('role', 'combobox')
    })

    it('should have aria-expanded attribute', () => {
      render(
        <Select>
          <SelectTrigger data-testid="trigger">
            <SelectValue placeholder="Select" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="option1">Option 1</SelectItem>
          </SelectContent>
        </Select>
      )
      
      expect(screen.getByTestId('trigger')).toHaveAttribute('aria-expanded', 'false')
    })

    it('should support disabled state', () => {
      render(
        <Select disabled>
          <SelectTrigger data-testid="trigger">
            <SelectValue placeholder="Select" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="option1">Option 1</SelectItem>
          </SelectContent>
        </Select>
      )
      
      expect(screen.getByTestId('trigger')).toBeDisabled()
    })

    it('should have touch-manipulation class for mobile optimization', () => {
      render(
        <Select>
          <SelectTrigger data-testid="trigger">
            <SelectValue placeholder="Select" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="option1">Option 1</SelectItem>
          </SelectContent>
        </Select>
      )
      
      expect(screen.getByTestId('trigger')).toHaveClass('touch-manipulation')
    })

    it('should have aria-hidden on chevron icon', () => {
      render(
        <Select>
          <SelectTrigger data-testid="trigger">
            <SelectValue placeholder="Select" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="option1">Option 1</SelectItem>
          </SelectContent>
        </Select>
      )
      
      const trigger = screen.getByTestId('trigger')
      const icon = trigger.querySelector('svg')
      expect(icon).toHaveAttribute('aria-hidden', 'true')
    })
  })

  describe('User Interactions', () => {
    it('should open dropdown on click', async () => {
      const user = userEvent.setup()
      
      render(
        <Select>
          <SelectTrigger data-testid="trigger">
            <SelectValue placeholder="Select" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="option1">Option 1</SelectItem>
          </SelectContent>
        </Select>
      )
      
      const trigger = screen.getByTestId('trigger')
      await user.click(trigger)
      
      expect(await screen.findByText('Option 1')).toBeInTheDocument()
    })

    it('should call onValueChange when option selected', async () => {
      const user = userEvent.setup()
      const onValueChange = vi.fn()
      
      render(
        <Select onValueChange={onValueChange}>
          <SelectTrigger data-testid="trigger">
            <SelectValue placeholder="Select" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="option1">Option 1</SelectItem>
            <SelectItem value="option2">Option 2</SelectItem>
          </SelectContent>
        </Select>
      )
      
      const trigger = screen.getByTestId('trigger')
      await user.click(trigger)
      
      const option = await screen.findByText('Option 2')
      await user.click(option)
      
      expect(onValueChange).toHaveBeenCalledWith('option2')
    })

    it('should not open when disabled', async () => {
      const user = userEvent.setup()
      
      render(
        <Select disabled>
          <SelectTrigger data-testid="trigger">
            <SelectValue placeholder="Select" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="option1">Option 1</SelectItem>
          </SelectContent>
        </Select>
      )
      
      const trigger = screen.getByTestId('trigger')
      await user.click(trigger)
      
      // Option should not be visible
      expect(screen.queryByRole('option')).not.toBeInTheDocument()
    })
  })

  describe('Styling', () => {
    it('should have proper base styling classes', () => {
      render(
        <Select>
          <SelectTrigger data-testid="trigger">
            <SelectValue placeholder="Select" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="option1">Option 1</SelectItem>
          </SelectContent>
        </Select>
      )
      
      const trigger = screen.getByTestId('trigger')
      
      expect(trigger).toHaveClass('flex')
      expect(trigger).toHaveClass('w-full')
      expect(trigger).toHaveClass('rounded-lg')
      expect(trigger).toHaveClass('border')
      expect(trigger).toHaveClass('bg-background')
    })

    it('should have focus ring styling', () => {
      render(
        <Select>
          <SelectTrigger data-testid="trigger">
            <SelectValue placeholder="Select" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="option1">Option 1</SelectItem>
          </SelectContent>
        </Select>
      )
      
      const trigger = screen.getByTestId('trigger')
      expect(trigger).toHaveClass('focus:ring-2')
      expect(trigger).toHaveClass('focus:ring-ring')
    })

    it('should have minimum height for touch targets', () => {
      render(
        <Select>
          <SelectTrigger data-testid="trigger">
            <SelectValue placeholder="Select" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="option1">Option 1</SelectItem>
          </SelectContent>
        </Select>
      )
      
      expect(screen.getByTestId('trigger')).toHaveClass('min-h-[44px]')
    })

    it('should have motion-reduce classes for reduced motion compliance', () => {
      render(
        <Select>
          <SelectTrigger data-testid="trigger">
            <SelectValue placeholder="Select" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="option1">Option 1</SelectItem>
          </SelectContent>
        </Select>
      )
      
      expect(screen.getByTestId('trigger')).toHaveClass('motion-reduce:transition-none')
    })
  })

  describe('SelectItem', () => {
    it('should have minimum height for touch targets', async () => {
      const user = userEvent.setup()
      
      render(
        <Select>
          <SelectTrigger data-testid="trigger">
            <SelectValue placeholder="Select" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="option1" data-testid="item">Option 1</SelectItem>
          </SelectContent>
        </Select>
      )
      
      await user.click(screen.getByTestId('trigger'))
      
      const item = await screen.findByTestId('item')
      expect(item).toHaveClass('min-h-[44px]')
    })

    it('should have touch-manipulation class', async () => {
      const user = userEvent.setup()
      
      render(
        <Select>
          <SelectTrigger data-testid="trigger">
            <SelectValue placeholder="Select" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="option1" data-testid="item">Option 1</SelectItem>
          </SelectContent>
        </Select>
      )
      
      await user.click(screen.getByTestId('trigger'))
      
      const item = await screen.findByTestId('item')
      expect(item).toHaveClass('touch-manipulation')
    })

    it('should support disabled items', async () => {
      const user = userEvent.setup()
      
      render(
        <Select>
          <SelectTrigger data-testid="trigger">
            <SelectValue placeholder="Select" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="option1" disabled data-testid="item">
              Disabled Option
            </SelectItem>
          </SelectContent>
        </Select>
      )
      
      await user.click(screen.getByTestId('trigger'))
      
      const item = await screen.findByTestId('item')
      expect(item).toHaveAttribute('data-disabled')
    })
  })

  describe('SelectGroup and SelectLabel', () => {
    it('should render groups with labels', async () => {
      const user = userEvent.setup()
      
      render(
        <Select>
          <SelectTrigger data-testid="trigger">
            <SelectValue placeholder="Select" />
          </SelectTrigger>
          <SelectContent>
            <SelectGroup>
              <SelectLabel>Fruits</SelectLabel>
              <SelectItem value="apple">Apple</SelectItem>
              <SelectItem value="banana">Banana</SelectItem>
            </SelectGroup>
            <SelectSeparator />
            <SelectGroup>
              <SelectLabel>Vegetables</SelectLabel>
              <SelectItem value="carrot">Carrot</SelectItem>
            </SelectGroup>
          </SelectContent>
        </Select>
      )
      
      await user.click(screen.getByTestId('trigger'))
      
      expect(await screen.findByText('Fruits')).toBeInTheDocument()
      expect(await screen.findByText('Vegetables')).toBeInTheDocument()
      expect(await screen.findByText('Apple')).toBeInTheDocument()
      expect(await screen.findByText('Carrot')).toBeInTheDocument()
    })
  })

  describe('WCAG AA Compliance', () => {
    it('should have sufficient color contrast for text', () => {
      render(
        <Select>
          <SelectTrigger data-testid="trigger">
            <SelectValue placeholder="Select" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="option1">Option 1</SelectItem>
          </SelectContent>
        </Select>
      )
      
      const trigger = screen.getByTestId('trigger')
      expect(trigger).toHaveClass('text-foreground')
      expect(trigger).toHaveClass('bg-background')
    })

    it('should have visible focus indicator', () => {
      render(
        <Select>
          <SelectTrigger data-testid="trigger">
            <SelectValue placeholder="Select" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="option1">Option 1</SelectItem>
          </SelectContent>
        </Select>
      )
      
      const trigger = screen.getByTestId('trigger')
      expect(trigger).toHaveClass('focus:ring-2')
      expect(trigger).toHaveClass('focus:ring-ring')
    })
  })
})
