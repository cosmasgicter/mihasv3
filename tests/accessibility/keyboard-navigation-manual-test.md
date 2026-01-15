# Keyboard Navigation Manual Testing Checklist

## Purpose
This checklist verifies keyboard navigation and focus management across all admin pages.
**Requirements: 7.4**

## Testing Instructions

### Prerequisites
- Use only keyboard (no mouse)
- Test in Chrome, Firefox, and Safari
- Use Tab, Shift+Tab, Enter, Space, Escape, and Arrow keys
- Verify focus indicators are visible at all times

---

## 1. Skip Link Testing

### Test: Skip Link Visibility
- [ ] Load any admin page
- [ ] Press Tab once
- [ ] **Expected**: Skip link appears at top of page with text "Skip to main content"
- [ ] **Expected**: Skip link has visible focus indicator (blue outline or ring)

### Test: Skip Link Functionality
- [ ] Press Tab to focus skip link
- [ ] Press Enter
- [ ] **Expected**: Focus moves to main content area
- [ ] **Expected**: Next Tab press focuses first interactive element in main content

---

## 2. Tab Order Testing

Test each admin page for logical tab order:

### Dashboard (`/admin/dashboard`)
- [ ] Tab through all interactive elements
- [ ] **Expected**: Tab order follows visual layout (top to bottom, left to right)
- [ ] **Expected**: No focus traps (can tab through entire page)
- [ ] **Expected**: All interactive elements are reachable

### Applications (`/admin/applications`)
- [ ] Tab through search, filters, and table
- [ ] **Expected**: Search input is reachable
- [ ] **Expected**: Filter controls are reachable
- [ ] **Expected**: Table action buttons are reachable
- [ ] **Expected**: Pagination controls are reachable

### Users (`/admin/users`)
- [ ] Tab through user list and controls
- [ ] **Expected**: Add user button is reachable
- [ ] **Expected**: User table rows are navigable
- [ ] **Expected**: Edit/delete buttons are reachable

### Programs (`/admin/programs`)
- [ ] Tab through program list
- [ ] **Expected**: Add program button is reachable
- [ ] **Expected**: Program cards/rows are navigable
- [ ] **Expected**: Edit controls are reachable

### Eligibility Management (`/admin/eligibility`)
- [ ] Tab through eligibility controls
- [ ] **Expected**: All form fields are reachable
- [ ] **Expected**: Submit buttons are reachable
- [ ] **Expected**: Table controls are reachable

### Audit Trail (`/admin/audit-trail`)
- [ ] Tab through audit log table
- [ ] **Expected**: Filter controls are reachable
- [ ] **Expected**: Table is navigable
- [ ] **Expected**: Export buttons are reachable

### Settings (`/admin/settings`)
- [ ] Tab through settings form
- [ ] **Expected**: All form fields are reachable
- [ ] **Expected**: Save button is reachable
- [ ] **Expected**: Toggle switches are keyboard-accessible

---

## 3. Focus Indicator Testing

### Test: Visible Focus Indicators
For each page, verify:
- [ ] Buttons have visible focus indicator (ring, outline, or shadow)
- [ ] Links have visible focus indicator
- [ ] Form inputs have visible focus indicator
- [ ] Select dropdowns have visible focus indicator
- [ ] Checkboxes/radios have visible focus indicator
- [ ] Custom components have visible focus indicator

### Test: Focus Indicator Contrast
- [ ] Focus indicators are clearly visible against background
- [ ] Focus indicators meet 3:1 contrast ratio minimum
- [ ] Focus indicators are not obscured by other elements

---

## 4. Form Control Testing

### Test: Input Navigation
- [ ] Tab into text input
- [ ] Type text
- [ ] Tab to next field
- [ ] **Expected**: Focus moves to next form field
- [ ] **Expected**: Typed text is preserved

### Test: Select Dropdown
- [ ] Tab to select dropdown
- [ ] Press Space or Enter to open
- [ ] Use Arrow keys to navigate options
- [ ] Press Enter to select
- [ ] Press Escape to close without selecting
- [ ] **Expected**: All keyboard interactions work

### Test: Checkbox/Radio
- [ ] Tab to checkbox
- [ ] Press Space to toggle
- [ ] **Expected**: Checkbox toggles state
- [ ] Tab to radio button
- [ ] Use Arrow keys to select different option
- [ ] **Expected**: Radio selection changes

### Test: Textarea
- [ ] Tab to textarea
- [ ] Type multi-line text
- [ ] Tab to next field
- [ ] **Expected**: Focus moves correctly
- [ ] **Expected**: Text is preserved

---

## 5. Modal Dialog Testing

### Test: Modal Focus Trap
- [ ] Open a modal (e.g., view application details)
- [ ] Tab through modal elements
- [ ] **Expected**: Focus stays within modal
- [ ] **Expected**: Tab cycles through modal elements
- [ ] **Expected**: Shift+Tab works in reverse

### Test: Modal Close
- [ ] Open a modal
- [ ] Press Escape
- [ ] **Expected**: Modal closes
- [ ] **Expected**: Focus returns to trigger button

### Test: Modal Buttons
- [ ] Open a modal
- [ ] Tab to action buttons
- [ ] Press Enter on button
- [ ] **Expected**: Button action executes
- [ ] **Expected**: Modal closes if appropriate

---

## 6. Data Table Testing

### Test: Table Navigation
- [ ] Tab to first table row
- [ ] Tab through row actions
- [ ] **Expected**: Each action button is reachable
- [ ] Tab to next row
- [ ] **Expected**: Focus moves to next row's first action

### Test: Table Sorting
- [ ] Tab to column header
- [ ] Press Enter or Space
- [ ] **Expected**: Table sorts by that column
- [ ] **Expected**: Sort indicator updates

### Test: Table Pagination
- [ ] Tab to pagination controls
- [ ] Press Enter on "Next" button
- [ ] **Expected**: Next page loads
- [ ] **Expected**: Focus remains on pagination

---

## 7. Navigation Menu Testing

### Test: Menu Navigation
- [ ] Tab to first menu item
- [ ] Tab through all menu items
- [ ] **Expected**: All menu items are reachable
- [ ] **Expected**: Active page is indicated

### Test: Menu Activation
- [ ] Tab to menu item
- [ ] Press Enter
- [ ] **Expected**: Page navigates
- [ ] **Expected**: New page loads correctly

### Test: Submenu (if applicable)
- [ ] Tab to menu item with submenu
- [ ] Press Enter or Arrow Right
- [ ] **Expected**: Submenu opens
- [ ] Tab through submenu items
- [ ] Press Escape
- [ ] **Expected**: Submenu closes

---

## 8. Search and Filter Testing

### Test: Search Input
- [ ] Tab to search input
- [ ] Type search query
- [ ] Press Enter
- [ ] **Expected**: Search executes
- [ ] **Expected**: Results update

### Test: Filter Controls
- [ ] Tab to filter dropdown
- [ ] Open dropdown with Space/Enter
- [ ] Navigate with Arrow keys
- [ ] Select option with Enter
- [ ] **Expected**: Filters apply
- [ ] **Expected**: Results update

---

## 9. Keyboard Shortcuts Testing

### Test: Common Shortcuts
- [ ] Press Escape (should close modals/menus)
- [ ] Press Tab (should move focus forward)
- [ ] Press Shift+Tab (should move focus backward)
- [ ] **Expected**: All shortcuts work consistently

---

## 10. Focus Management Edge Cases

### Test: Dynamic Content
- [ ] Trigger content that loads dynamically
- [ ] **Expected**: Focus is managed appropriately
- [ ] **Expected**: New content is keyboard-accessible

### Test: Error Messages
- [ ] Submit form with errors
- [ ] **Expected**: Focus moves to first error
- [ ] **Expected**: Error messages are announced

### Test: Loading States
- [ ] Trigger loading state
- [ ] **Expected**: Loading indicator is announced
- [ ] **Expected**: Focus is managed during loading

---

## Issues Found

Document any issues discovered during testing:

| Page | Issue | Severity | Notes |
|------|-------|----------|-------|
|      |       |          |       |

---

## Test Results Summary

- **Total Tests**: 50+
- **Passed**: ___
- **Failed**: ___
- **Blocked**: ___

## Sign-off

- **Tester**: _______________
- **Date**: _______________
- **Browser**: _______________
- **Result**: ☐ Pass ☐ Fail ☐ Pass with Issues

