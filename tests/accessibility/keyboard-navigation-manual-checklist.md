# Keyboard Navigation Manual Testing Checklist

**Task**: 11.5.4 Verify keyboard navigation and focus management  
**Requirements**: 7.4  
**Date**: January 15, 2026

## Overview

This checklist provides a comprehensive manual testing guide for keyboard navigation and focus management across all admin pages. Use this to verify that the application meets WCAG AA accessibility standards for keyboard interaction.

## General Testing Instructions

1. **Close all mouse/trackpad input** - Test using keyboard only
2. **Use Tab key** to move forward through interactive elements
3. **Use Shift+Tab** to move backward
4. **Use Enter/Space** to activate buttons and links
5. **Use Arrow keys** for dropdowns, radio groups, and custom controls
6. **Use Escape** to close modals and menus

## Skip Link Testing

### Test 1: Skip Link Presence
- [ ] Load any admin page
- [ ] Press Tab once
- [ ] **Expected**: Skip link appears at top-left with text "Skip to main content"
- [ ] **Expected**: Skip link has visible focus indicator (blue ring)

### Test 2: Skip Link Functionality
- [ ] Focus skip link (Tab once)
- [ ] Press Enter
- [ ] **Expected**: Focus moves to main content area
- [ ] **Expected**: Next Tab moves to first interactive element in main content

### Test 3: Skip Link Styling
- [ ] Focus skip link
- [ ] **Expected**: Blue background, white text, clearly visible
- [ ] **Expected**: Positioned at top-left, not obscured by other elements
- [ ] **Expected**: Has adequate padding and readable text

## Admin Dashboard Testing

### Dashboard - Tab Order
- [ ] Navigate to `/admin/dashboard`
- [ ] Tab through all interactive elements
- [ ] **Expected**: Tab order follows visual layout (left-to-right, top-to-bottom)
- [ ] **Expected**: No unexpected focus jumps
- [ ] **Expected**: All interactive elements are reachable

### Dashboard - Focus Indicators
- [ ] Tab to each card/widget
- [ ] **Expected**: Each focused element has visible blue ring/outline
- [ ] **Expected**: Focus indicator is at least 2px wide
- [ ] **Expected**: Focus indicator has sufficient contrast (3:1 minimum)

### Dashboard - Statistics Cards
- [ ] Tab to statistics cards
- [ ] **Expected**: If cards are clickable, they receive focus
- [ ] **Expected**: Focus indicator visible on card
- [ ] Press Enter on focused card
- [ ] **Expected**: Card action activates (navigation or expansion)

## Applications Page Testing

### Applications - Search and Filters
- [ ] Navigate to `/admin/applications`
- [ ] Tab to search input
- [ ] **Expected**: Search input receives focus with visible indicator
- [ ] Type search query
- [ ] **Expected**: Can type without issues
- [ ] Tab to filter buttons
- [ ] **Expected**: Each filter button receives focus
- [ ] Press Enter on filter button
- [ ] **Expected**: Filter activates

### Applications - Table Navigation
- [ ] Tab through application table
- [ ] **Expected**: Can reach all action buttons in table
- [ ] **Expected**: Tab order goes row by row
- [ ] Focus on "View" button
- [ ] Press Enter
- [ ] **Expected**: Application details modal opens

### Applications - Modal Focus Trap
- [ ] Open application details modal
- [ ] Tab through modal elements
- [ ] **Expected**: Focus stays within modal
- [ ] Tab past last element
- [ ] **Expected**: Focus returns to first modal element
- [ ] Press Escape
- [ ] **Expected**: Modal closes, focus returns to trigger button

## Programs Page Testing

### Programs - Add/Edit Forms
- [ ] Navigate to `/admin/programs`
- [ ] Tab to "Add Program" button
- [ ] Press Enter
- [ ] **Expected**: Form modal opens
- [ ] Tab through form fields
- [ ] **Expected**: Logical order (top to bottom)
- [ ] **Expected**: All inputs receive focus with visible indicator

### Programs - Form Validation
- [ ] Focus on required field
- [ ] Tab away without filling
- [ ] **Expected**: Error message appears
- [ ] **Expected**: Can tab back to field to fix
- [ ] Tab to submit button
- [ ] Press Enter
- [ ] **Expected**: Form validates, shows errors if any

### Programs - Textarea Fields
- [ ] Tab to textarea (description field)
- [ ] **Expected**: Textarea receives focus
- [ ] **Expected**: Can type multi-line text
- [ ] **Expected**: Focus indicator visible

## Users Page Testing

### Users - Table Actions
- [ ] Navigate to `/admin/users`
- [ ] Tab through user table
- [ ] **Expected**: Can reach edit/delete buttons
- [ ] Focus on edit button
- [ ] Press Enter
- [ ] **Expected**: Edit modal opens

### Users - Role Selection
- [ ] In edit user modal, tab to role dropdown
- [ ] Press Space or Enter to open
- [ ] Use Arrow keys to navigate options
- [ ] Press Enter to select
- [ ] **Expected**: Dropdown works with keyboard
- [ ] **Expected**: Selected value updates

## Settings Page Testing

### Settings - Form Navigation
- [ ] Navigate to `/admin/settings`
- [ ] Tab through all form fields
- [ ] **Expected**: Logical tab order
- [ ] **Expected**: All inputs reachable
- [ ] **Expected**: Focus indicators visible

### Settings - Toggle Switches
- [ ] Tab to toggle switch
- [ ] Press Space to toggle
- [ ] **Expected**: Toggle switches state
- [ ] **Expected**: Visual feedback provided

### Settings - Save Button
- [ ] Tab to Save button
- [ ] **Expected**: Button receives focus
- [ ] Press Enter
- [ ] **Expected**: Settings save
- [ ] **Expected**: Success message appears

## Analytics Page Testing

### Analytics - Date Pickers
- [ ] Navigate to `/admin/analytics`
- [ ] Tab to date picker
- [ ] **Expected**: Date input receives focus
- [ ] Press Enter or Space
- [ ] **Expected**: Calendar opens
- [ ] Use Arrow keys to navigate dates
- [ ] Press Enter to select
- [ ] **Expected**: Date selected, calendar closes

### Analytics - Chart Controls
- [ ] Tab to chart export buttons
- [ ] **Expected**: Buttons receive focus
- [ ] Press Enter
- [ ] **Expected**: Export action triggers

## Intakes Page Testing

### Intakes - CRUD Operations
- [ ] Navigate to `/admin/intakes`
- [ ] Tab to "Add Intake" button
- [ ] Press Enter
- [ ] **Expected**: Form opens
- [ ] Complete form using keyboard only
- [ ] **Expected**: Can complete entire form
- [ ] Tab to submit
- [ ] Press Enter
- [ ] **Expected**: Intake created

## Audit Trail Page Testing

### Audit Trail - Filters and Search
- [ ] Navigate to `/admin/audit-trail`
- [ ] Tab through filter controls
- [ ] **Expected**: All filters keyboard accessible
- [ ] Tab to search
- [ ] Type search query
- [ ] **Expected**: Results filter

### Audit Trail - Table Pagination
- [ ] Tab to pagination controls
- [ ] **Expected**: Page numbers receive focus
- [ ] Press Enter on page number
- [ ] **Expected**: Page changes
- [ ] Use Arrow keys if pagination has arrow buttons
- [ ] **Expected**: Can navigate pages

## Navigation Menu Testing

### Desktop Navigation
- [ ] Tab to navigation menu
- [ ] **Expected**: Menu items receive focus in order
- [ ] Press Enter on menu item
- [ ] **Expected**: Navigate to page
- [ ] **Expected**: Active page indicator visible

### Mobile Navigation
- [ ] Resize to mobile viewport (< 768px)
- [ ] Tab to hamburger menu button
- [ ] Press Enter
- [ ] **Expected**: Mobile menu opens
- [ ] Tab through menu items
- [ ] **Expected**: Focus stays in menu
- [ ] Press Escape
- [ ] **Expected**: Menu closes

## Common Components Testing

### Modals
- [ ] Open any modal
- [ ] **Expected**: Focus moves to modal
- [ ] Tab through modal
- [ ] **Expected**: Focus trapped in modal
- [ ] Press Escape
- [ ] **Expected**: Modal closes, focus returns

### Dropdowns
- [ ] Tab to dropdown
- [ ] Press Space or Enter
- [ ] **Expected**: Dropdown opens
- [ ] Use Arrow keys
- [ ] **Expected**: Can navigate options
- [ ] Press Enter
- [ ] **Expected**: Option selected

### Buttons
- [ ] Tab to any button
- [ ] **Expected**: Visible focus indicator
- [ ] Press Enter or Space
- [ ] **Expected**: Button activates

### Links
- [ ] Tab to any link
- [ ] **Expected**: Visible focus indicator
- [ ] Press Enter
- [ ] **Expected**: Navigation occurs

## Accessibility Standards Verification

### WCAG 2.1 AA Compliance

#### 2.1.1 Keyboard (Level A)
- [ ] All functionality available via keyboard
- [ ] No keyboard-only operations require specific timings

#### 2.1.2 No Keyboard Trap (Level A)
- [ ] Can navigate to and from all components
- [ ] No unintentional focus traps
- [ ] Escape key works to exit modals/menus

#### 2.4.1 Bypass Blocks (Level A)
- [ ] Skip link present on all pages
- [ ] Skip link functional
- [ ] Skip link visible on focus

#### 2.4.3 Focus Order (Level A)
- [ ] Focus order is logical
- [ ] Focus order preserves meaning
- [ ] Focus order follows visual layout

#### 2.4.7 Focus Visible (Level AA)
- [ ] Focus indicator visible on all interactive elements
- [ ] Focus indicator has sufficient contrast (3:1 minimum)
- [ ] Focus indicator is at least 2px wide

#### 3.2.1 On Focus (Level A)
- [ ] Focusing an element doesn't trigger unexpected changes
- [ ] No automatic navigation on focus

## Issues Found

### Critical Issues
_List any critical keyboard navigation issues that prevent task completion_

1. 
2. 
3. 

### Medium Issues
_List issues that make navigation difficult but not impossible_

1. 
2. 
3. 

### Minor Issues
_List minor usability issues_

1. 
2. 
3. 

## Test Results Summary

- **Total Tests**: ___
- **Passed**: ___
- **Failed**: ___
- **Blocked**: ___

### Overall Assessment
- [ ] All admin pages are fully keyboard accessible
- [ ] All focus indicators are visible and meet WCAG AA standards
- [ ] Tab order is logical across all pages
- [ ] Skip links are present and functional
- [ ] No keyboard traps exist
- [ ] Modals properly trap and release focus

### Recommendations
_List any recommendations for improvements_

1. 
2. 
3. 

## Sign-off

**Tester Name**: _______________  
**Date**: _______________  
**Status**: [ ] Approved [ ] Needs Work  
**Notes**: 

