// Core UI Components
export { Button } from './Button'
export { Input } from './input'
export { Textarea } from './textarea'
export { Select } from './select'
export { FormSelect } from './form-select'
export type { FormSelectProps, SelectOption } from './form-select'
export { Checkbox, CheckboxWithLabel } from './checkbox'
export { Radio, RadioGroup } from './Radio'
export { Switch } from './switch'
export { Label } from './label'

// Layout Components
export { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from './card'
export { Container } from './Container'
export { Grid } from './Grid'
export { Stack } from './Stack'
export { Section } from './Section'
export { SectionCard } from './SectionCard'
export { 
  ResponsiveContainer, 
  ResponsiveStack, 
  ResponsiveGrid,
  LandscapeCompact,
  HideOnLandscape,
  ShowOnLandscape,
  MobileOnly,
  DesktopOnly,
  SafeAreaSpacer,
  PageLayout as ResponsivePageLayout 
} from './ResponsiveLayout'
export { SafeAreaProvider, SafeAreaView, BottomNavigationWrapper, LandscapeAwareContainer, useSafeArea } from './SafeAreaProvider'

// Feedback Components
export { Alert } from './Alert'
export { useToastStore, useToast, ToastContainer } from './Toast'
export { Modal } from './Modal'
export { Dialog } from './Dialog'
export { 
  Dialog as RadixDialog,
  DialogTrigger,
  DialogContent,
  DialogHeader,
  DialogFooter,
  DialogTitle,
  DialogDescription,
  DialogClose,
  ModalDialog
} from './Dialog'
export type { DialogSize, ModalDialogProps } from './Dialog'
export { ConfirmDialog } from './ConfirmDialog'

// Navigation Components
export { Tabs } from './tabs'
export { Pagination } from './Pagination'
export { SkipLink } from './SkipLink'
export { SkipLinks, MainContent, NavigationLandmark, FooterLandmark } from './SkipLinks'
export { BottomNavigation, BottomNavigationSpacer, defaultStudentNavItems, defaultPublicNavItems } from './BottomNavigation'

// Deprecated - Use Breadcrumbs from '@/components/navigation/Breadcrumbs' instead
/** @deprecated Use Breadcrumbs from '@/components/navigation/Breadcrumbs' for full-featured breadcrumbs */
export { Breadcrumbs } from './Breadcrumbs'

// Data Display Components
export { Table } from './Table'
export { Badge } from './badge'
export { Accordion } from './accordion'
export { Separator } from './separator'
export { Tooltip, TooltipProvider, TooltipTrigger, TooltipContent } from './tooltip'
export { Progress } from './progress'
export { Skeleton, SkeletonText } from './skeleton'
export { SkeletonDashboard } from './skeletons'

// Loading Components
export { LoadingSpinner } from './LoadingSpinner'
export { LoadingButton } from './LoadingButton'
export { LoadingOverlay } from './LoadingOverlay'
export { SkeletonLoader, SkeletonCard, SkeletonTable, SkeletonAvatar } from './SkeletonLoader'
export { ProgressIndicator, CircularProgress, IndeterminateProgress } from './ProgressIndicator'

// Unified Loader System (Requirement 3.3)
export { 
  UnifiedLoader, 
  PageLoader, 
  InlineLoader, 
  SkeletonLoader as UnifiedSkeletonLoader, 
  OverlayLoader,
  UnifiedSpinner 
} from './UnifiedLoader'
export type { UnifiedLoaderProps } from './UnifiedLoader'

// Form Components
export { FileUpload } from './FileUpload'
export { EnhancedFileUpload } from './EnhancedFileUpload'
export { PasswordInput } from './PasswordInput'
export { FormError } from './FormError'
export { FormFeedback, InlineFormFeedback, FormSubmitButton } from './FormFeedback'

// Utility Components
export { ErrorBoundary } from './ErrorBoundary'
export { EmptyState } from './EmptyState'
export { PageHeader } from './PageHeader'
export { PageLayout } from './PageLayout'
export { StatusIcon } from './StatusIcon'

// Deprecated - Use OfflineIndicator from '@/components/pwa/OfflineIndicator' instead
/** @deprecated Use OfflineIndicator from '@/components/pwa/OfflineIndicator' instead */
export { OfflineIndicator } from './OfflineIndicator'

// Accessibility Components
export { 
  HeadingLevelProvider, 
  useHeadingLevel, 
  Heading, 
  Section as HeadingSection, 
  PageTitle, 
  SectionTitle, 
  HeadingCardTitle, 
  VisuallyHidden 
} from './HeadingHierarchy'

// Touch Components
export { TouchButton } from './TouchButton'
export { TouchOptimizedButton, TouchOptimizedIconButton } from './TouchOptimizedButton'
