// Core UI Components
export { Button } from './Button'
export { Input } from './input'
export { Textarea } from './textarea'
export { Select } from './select'
export { CanonicalSelect } from './CanonicalSelect'
export type { CanonicalSelectProps, CanonicalSelectOption } from './CanonicalSelect'
export { FormSelect } from './form-select'
export type { FormSelectProps, SelectOption } from './form-select'
export { Checkbox, CheckboxWithLabel } from './checkbox'
export { RadioGroup, RadioGroupItem } from './radio-group'
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

// Banner (canonical)
export { Banner } from './Banner'
export type { BannerProps } from './Banner'

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
export { BottomNavigation, BottomNavigationSpacer, defaultStudentNavItems, defaultPublicNavItems } from './BottomNavigation'

// Data Display Components
export { Table } from './Table'
export { ResponsiveTable } from './ResponsiveTable'
export type { ResponsiveTableProps } from './ResponsiveTable'
export { Badge } from './badge'
export { Accordion } from './accordion'
export { Separator } from './separator'
export { Tooltip, TooltipProvider, TooltipTrigger, TooltipContent } from './tooltip'
export { Progress } from './progress'
export { Skeleton, SkeletonText, SkeletonCard, SkeletonTable, SkeletonAvatar } from './skeleton'
export { SkeletonDashboard } from './skeletons'

// Loading Components (canonical)
export { UnifiedLoader, UnifiedSpinner } from './UnifiedLoader'
export type { UnifiedLoaderProps } from './UnifiedLoader'

// Form Components
export { FileUpload } from './FileUpload'
export type { FileUploadProps } from './FileUpload'
export { PasswordInput } from './PasswordInput'

// Error Components (canonical)
export { ErrorDisplay } from './ErrorDisplay'
export type { ErrorDisplayProps } from './ErrorDisplay'

// Auto-Save
export { AutoSaveIndicator } from './AutoSaveIndicator'
export type { AutoSaveIndicatorProps } from './AutoSaveIndicator'

// Page Shell (canonical layout wrapper)
export { PageShell } from './PageShell'
export type { PageShellProps } from './PageShell'

// Mobile Page Header (canonical mobile page header)
export { MobilePageHeader } from './MobilePageHeader'
export type { MobilePageHeaderProps } from './MobilePageHeader'

// Utility Components
export { ErrorBoundary } from './ErrorBoundary'
export { EmptyState } from './EmptyState'
export { InfoCallout } from './InfoCallout'
export { PageHeader } from './PageHeader'
export { StatusIcon } from './StatusIcon'

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


