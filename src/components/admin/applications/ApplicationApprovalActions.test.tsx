import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import '@testing-library/jest-dom/vitest'
import { ApplicationApprovalActions } from './ApplicationApprovalActions'

// Mock the hooks and components
vi.mock('@/hooks/useConfirmDialog', () => ({
  useConfirmDialog: () => ({
    isOpen: false,
    options: {
      title: '',
      message: '',
      confirmText: 'Confirm',
      cancelText: 'Cancel',
      variant: 'info',
      showCancel: true
    },
    confirm: vi.fn().mockResolvedValue(true),
    handleConfirm: vi.fn(),
    handleCancel: vi.fn()
  })
}))

vi.mock('@/components/ui/LoadingSpinner', () => ({
  LoadingSpinner: () => <div data-testid="loading-spinner">Loading...</div>
}))

vi.mock('@/components/ui/ConfirmDialog', () => ({
  ConfirmDialog: () => <div data-testid="confirm-dialog">Confirm Dialog</div>
}))

describe('ApplicationApprovalActions - Payment Review', () => {
  const mockOnStatusUpdate = vi.fn()
  const mockOnPaymentStatusUpdate = vi.fn()
  const applicationId = 'test-app-123'

  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('Payment Status Updates', () => {
    it('should render payment verification buttons when status is pending_review', () => {
      render(
        <ApplicationApprovalActions
          applicationId={applicationId}
          currentStatus="submitted"
          currentPaymentStatus="pending_review"
          onStatusUpdate={mockOnStatusUpdate}
          onPaymentStatusUpdate={mockOnPaymentStatusUpdate}
        />
      )

      expect(screen.getByText('Verify')).toBeInTheDocument()
      expect(screen.getByText('Reject')).toBeInTheDocument()
    })

    it('should call onPaymentStatusUpdate with "verified" when verify button is clicked', async () => {
      mockOnPaymentStatusUpdate.mockResolvedValue(undefined)

      render(
        <ApplicationApprovalActions
          applicationId={applicationId}
          currentStatus="submitted"
          currentPaymentStatus="pending_review"
          onStatusUpdate={mockOnStatusUpdate}
          onPaymentStatusUpdate={mockOnPaymentStatusUpdate}
        />
      )

      const verifyButton = screen.getByText('Verify')
      fireEvent.click(verifyButton)

      await waitFor(() => {
        expect(mockOnPaymentStatusUpdate).toHaveBeenCalledWith(applicationId, 'verified')
      })
    })

    it('should call onPaymentStatusUpdate with "rejected" when reject button is clicked', async () => {
      mockOnPaymentStatusUpdate.mockResolvedValue(undefined)

      render(
        <ApplicationApprovalActions
          applicationId={applicationId}
          currentStatus="submitted"
          currentPaymentStatus="pending_review"
          onStatusUpdate={mockOnStatusUpdate}
          onPaymentStatusUpdate={mockOnPaymentStatusUpdate}
        />
      )

      const rejectButton = screen.getAllByText('Reject')[0] // Get payment reject button
      fireEvent.click(rejectButton)

      await waitFor(() => {
        expect(mockOnPaymentStatusUpdate).toHaveBeenCalledWith(applicationId, 'rejected')
      })
    })

    it('should handle payment update errors gracefully', async () => {
      const error = new Error('Network error')
      mockOnPaymentStatusUpdate.mockRejectedValue(error)

      render(
        <ApplicationApprovalActions
          applicationId={applicationId}
          currentStatus="submitted"
          currentPaymentStatus="pending_review"
          onStatusUpdate={mockOnStatusUpdate}
          onPaymentStatusUpdate={mockOnPaymentStatusUpdate}
        />
      )

      const verifyButton = screen.getByText('Verify')
      fireEvent.click(verifyButton)

      await waitFor(() => {
        expect(mockOnPaymentStatusUpdate).toHaveBeenCalled()
      })

      // Component should not crash and should reset loading state
      expect(verifyButton).not.toBeDisabled()
    })

    it('should display verified status when payment is verified', () => {
      render(
        <ApplicationApprovalActions
          applicationId={applicationId}
          currentStatus="submitted"
          currentPaymentStatus="verified"
          onStatusUpdate={mockOnStatusUpdate}
          onPaymentStatusUpdate={mockOnPaymentStatusUpdate}
        />
      )

      expect(screen.getByText('Verified')).toBeInTheDocument()
    })

    it('should display rejected status when payment is rejected', () => {
      render(
        <ApplicationApprovalActions
          applicationId={applicationId}
          currentStatus="submitted"
          currentPaymentStatus="rejected"
          onStatusUpdate={mockOnStatusUpdate}
          onPaymentStatusUpdate={mockOnPaymentStatusUpdate}
        />
      )

      expect(screen.getByText('Rejected')).toBeInTheDocument()
    })
  })

  describe('Application Status Updates', () => {
    it('should prevent approval when payment is not verified', async () => {
      render(
        <ApplicationApprovalActions
          applicationId={applicationId}
          currentStatus="under_review"
          currentPaymentStatus="pending_review"
          onStatusUpdate={mockOnStatusUpdate}
          onPaymentStatusUpdate={mockOnPaymentStatusUpdate}
        />
      )

      const approveButton = screen.getByText('Approve')
      expect(approveButton).toBeDisabled()
      expect(approveButton).toHaveAttribute('title', 'Payment must be verified first')
    })

    it('should allow approval when payment is verified', async () => {
      mockOnStatusUpdate.mockResolvedValue(undefined)

      render(
        <ApplicationApprovalActions
          applicationId={applicationId}
          currentStatus="under_review"
          currentPaymentStatus="verified"
          onStatusUpdate={mockOnStatusUpdate}
          onPaymentStatusUpdate={mockOnPaymentStatusUpdate}
        />
      )

      const approveButton = screen.getByText('Approve')
      expect(approveButton).not.toBeDisabled()

      fireEvent.click(approveButton)

      await waitFor(() => {
        expect(mockOnStatusUpdate).toHaveBeenCalledWith(applicationId, 'approved')
      })
    })

    it('should handle status update errors gracefully', async () => {
      const error = new Error('Update failed')
      mockOnStatusUpdate.mockRejectedValue(error)

      render(
        <ApplicationApprovalActions
          applicationId={applicationId}
          currentStatus="under_review"
          currentPaymentStatus="verified"
          onStatusUpdate={mockOnStatusUpdate}
          onPaymentStatusUpdate={mockOnPaymentStatusUpdate}
        />
      )

      const approveButton = screen.getByText('Approve')
      fireEvent.click(approveButton)

      await waitFor(() => {
        expect(mockOnStatusUpdate).toHaveBeenCalled()
      })

      // Component should not crash and should reset loading state
      expect(approveButton).not.toBeDisabled()
    })
  })

  describe('Loading States', () => {
    it('should show loading spinner during payment update', async () => {
      mockOnPaymentStatusUpdate.mockImplementation(() => new Promise(resolve => setTimeout(resolve, 100)))

      render(
        <ApplicationApprovalActions
          applicationId={applicationId}
          currentStatus="submitted"
          currentPaymentStatus="pending_review"
          onStatusUpdate={mockOnStatusUpdate}
          onPaymentStatusUpdate={mockOnPaymentStatusUpdate}
        />
      )

      const verifyButton = screen.getByText('Verify')
      fireEvent.click(verifyButton)

      // Should show loading spinner
      await waitFor(() => {
        expect(screen.getByTestId('loading-spinner')).toBeInTheDocument()
      })
    })

    it('should disable buttons when disabled prop is true', () => {
      render(
        <ApplicationApprovalActions
          applicationId={applicationId}
          currentStatus="under_review"
          currentPaymentStatus="pending_review"
          onStatusUpdate={mockOnStatusUpdate}
          onPaymentStatusUpdate={mockOnPaymentStatusUpdate}
          disabled={true}
        />
      )

      const buttons = screen.getAllByRole('button')
      buttons.forEach(button => {
        expect(button).toBeDisabled()
      })
    })
  })

  describe('No React Errors', () => {
    it('should not cause hydration mismatch errors', () => {
      // This test verifies that the component renders consistently
      const { container } = render(
        <ApplicationApprovalActions
          applicationId={applicationId}
          currentStatus="under_review"
          currentPaymentStatus="verified"
          onStatusUpdate={mockOnStatusUpdate}
          onPaymentStatusUpdate={mockOnPaymentStatusUpdate}
        />
      )

      // Re-render with same props should produce identical output
      const { container: container2 } = render(
        <ApplicationApprovalActions
          applicationId={applicationId}
          currentStatus="under_review"
          currentPaymentStatus="verified"
          onStatusUpdate={mockOnStatusUpdate}
          onPaymentStatusUpdate={mockOnPaymentStatusUpdate}
        />
      )

      expect(container.innerHTML).toBe(container2.innerHTML)
    })
  })
})
