# Requirements Document

## Introduction

This feature extracts the ApplicationCard component from ApplicationsTable.tsx into a separate, optimized component. The goal is to improve code organization, enable better performance through React.memo, and fix the empty virtualized grid issue in the Applications page. This refactoring will improve maintainability and enable proper integration with VirtualizedApplicationsGrid for large application lists.

## Glossary

- **ApplicationCard**: A React component that displays a single application's summary information in a card format
- **ApplicationSummary**: TypeScript interface defining the shape of application data displayed in cards
- **VirtualizedApplicationsGrid**: A component using @tanstack/react-virtual for efficient rendering of large application lists
- **React.memo**: A React higher-order component that memoizes components to prevent unnecessary re-renders
- **INSTITUTION_NAMES**: A mapping object that converts institution codes to human-readable names

## Requirements

### Requirement 1: Extract ApplicationCard Component

**User Story:** As a developer, I want the ApplicationCard component extracted into its own file, so that the code is more maintainable and reusable.

#### Acceptance Criteria

1. THE System SHALL create a new file `src/components/admin/applications/ApplicationCard.tsx`
2. THE ApplicationCard component SHALL be moved from ApplicationsTable.tsx to the new file
3. THE ApplicationCard component SHALL be wrapped with React.memo for performance optimization
4. THE ApplicationCard component SHALL export the ApplicationSummary interface for external use
5. THE ApplicationCard component SHALL export the INSTITUTION_NAMES mapping for external use
6. WHEN the ApplicationCard component is imported, THE System SHALL provide named exports for ApplicationCard, ApplicationSummary, and INSTITUTION_NAMES

### Requirement 2: Internalize Badge Rendering Logic

**User Story:** As a developer, I want badge rendering logic moved inside ApplicationCard, so that prop drilling is reduced and the component is more self-contained.

#### Acceptance Criteria

1. THE ApplicationCard component SHALL contain its own getStatusBadge function internally
2. THE ApplicationCard component SHALL contain its own getPaymentBadge function internally
3. THE ApplicationCard component SHALL NOT receive getStatusBadge or getPaymentBadge as props
4. WHEN rendering status badges, THE ApplicationCard SHALL use the internal badge functions
5. THE badge functions SHALL be memoized using useCallback to prevent unnecessary re-renders

### Requirement 3: Update ApplicationsTable to Use New Component

**User Story:** As a developer, I want ApplicationsTable to import and use the extracted ApplicationCard, so that the refactoring is complete and functional.

#### Acceptance Criteria

1. THE ApplicationsTable component SHALL import ApplicationCard from the new file
2. THE ApplicationsTable component SHALL remove the local ApplicationCard definition
3. THE ApplicationsTable component SHALL remove the local getStatusBadge and getPaymentBadge functions
4. WHEN rendering the applications grid, THE ApplicationsTable SHALL use the imported ApplicationCard component
5. THE ApplicationsTable component SHALL pass only necessary props to ApplicationCard (application, handlers, loading states, selection state)

### Requirement 4: Fix VirtualizedApplicationsGrid Integration

**User Story:** As an admin user, I want the virtualized grid to display application cards correctly, so that I can efficiently browse large numbers of applications.

#### Acceptance Criteria

1. THE Applications.tsx page SHALL import ApplicationCard directly
2. WHEN applications.length exceeds 100, THE System SHALL render VirtualizedApplicationsGrid with ApplicationCard
3. THE VirtualizedApplicationsGrid renderCard prop SHALL receive a function that renders ApplicationCard with all required props
4. THE VirtualizedApplicationsGrid SHALL correctly pass handlers (onStatusUpdate, onPaymentStatusUpdate, onViewDetails) to each card
5. THE VirtualizedApplicationsGrid SHALL correctly pass loading states to each card
6. WHEN the virtualized grid renders, THE System SHALL display application cards with full functionality

### Requirement 5: Optimize VirtualizedApplicationsGrid Performance

**User Story:** As an admin user, I want the virtualized grid to perform smoothly when scrolling through many applications, so that the interface remains responsive.

#### Acceptance Criteria

1. THE VirtualizedApplicationsGrid SHALL use an appropriate estimateSize value based on actual card heights
2. THE VirtualizedApplicationsGrid SHALL use responsive column counts (1 on mobile, 2 on tablet, 3 on desktop)
3. THE VirtualizedApplicationsGrid SHALL maintain proper overscan value for smooth scrolling
4. WHEN the viewport resizes, THE VirtualizedApplicationsGrid SHALL recalculate layout appropriately
5. THE VirtualizedApplicationsGrid SHALL accept typed props for applications instead of `any[]`

### Requirement 6: Maintain Type Safety

**User Story:** As a developer, I want all components to maintain proper TypeScript types, so that the codebase remains type-safe and maintainable.

#### Acceptance Criteria

1. THE ApplicationCard component SHALL export the ApplicationSummary interface
2. THE ApplicationCardProps interface SHALL be properly typed with all required and optional props
3. THE VirtualizedApplicationsGrid SHALL use ApplicationSummary type for applications prop
4. WHEN importing types, THE System SHALL use the @/ path alias consistently
5. THE System SHALL NOT introduce any new TypeScript errors after refactoring
