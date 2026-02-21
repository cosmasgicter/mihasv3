# Requirements Document

## Introduction

The Vercel production build for the MIHAS admissions platform is failing because the UI component barrel file (`src/components/ui/index.ts`) references modules that are missing, deleted, or have case-sensitivity mismatches. Since Vercel runs on Linux (case-sensitive filesystem), any filename casing discrepancy that works on macOS/Windows will break the build. This spec covers auditing all barrel exports against actual files on disk, fixing any mismatches, and verifying the build passes.

## Glossary

- **Barrel_File**: The `src/components/ui/index.ts` file that re-exports all UI component modules from a single entry point
- **Build_System**: The Vite production build invoked via `bunx --bun vite build`
- **UI_Component_Directory**: The `src/components/ui/` directory containing all UI component source files
- **Case_Sensitive_Filesystem**: The Linux filesystem used by Vercel where `Button.tsx` and `button.tsx` are distinct files

## Requirements

### Requirement 1: Barrel File Export Audit

**User Story:** As a developer, I want every export in the barrel file to resolve to an existing module on disk, so that the Vite production build does not fail with "Could not resolve" errors.

#### Acceptance Criteria

1. THE Build_System SHALL resolve every import path listed in the Barrel_File to an existing file in the UI_Component_Directory
2. WHEN the Barrel_File references a module that does not exist on disk, THEN THE Build_System SHALL fail with a clear resolution error
3. WHEN a missing module is identified, THEN THE Barrel_File SHALL either have the export removed or a corresponding component file created

### Requirement 2: Case-Sensitivity Compliance

**User Story:** As a developer deploying to Vercel (Linux), I want all import paths to match the exact casing of filenames on disk, so that the build succeeds on case-sensitive filesystems.

#### Acceptance Criteria

1. THE Barrel_File SHALL use import paths that match the exact casing of the corresponding filenames on disk
2. WHEN an import path differs in casing from the actual filename, THEN THE import path SHALL be corrected to match the filename exactly
3. THE Build_System SHALL treat `./Button` and `./button` as distinct paths on the Case_Sensitive_Filesystem

### Requirement 3: Component File Completeness

**User Story:** As a developer, I want every referenced UI component file to export the symbols that the barrel file expects, so that named imports resolve correctly.

#### Acceptance Criteria

1. WHEN the Barrel_File imports a named export from a module, THEN that module SHALL export a symbol with that exact name
2. IF a component file exists but does not export the expected symbol, THEN THE component file SHALL be updated to include the missing export
3. WHEN a new component file is created to satisfy a missing module, THEN THE component file SHALL follow existing project conventions (React functional component, Tailwind styling, Radix UI primitives where applicable)

### Requirement 4: Build Verification

**User Story:** As a developer, I want to verify the production build passes locally before pushing to Vercel, so that deployment failures are caught early.

#### Acceptance Criteria

1. WHEN `bunx --bun vite build` is executed, THEN THE Build_System SHALL complete without module resolution errors
2. WHEN `bunx --bun vite build` is executed, THEN THE Build_System SHALL complete without TypeScript type errors that prevent compilation
3. IF the build fails after fixes are applied, THEN THE developer SHALL investigate and resolve the remaining errors iteratively

### Requirement 5: Cross-File Import Consistency

**User Story:** As a developer, I want all files that import from the UI barrel file to receive valid exports, so that no downstream components break.

#### Acceptance Criteria

1. WHEN a file imports a symbol from `@/components/ui`, THEN THE Barrel_File SHALL export that symbol
2. WHEN a symbol is removed from the Barrel_File, THEN all files importing that symbol SHALL be updated to use an alternative or direct import
3. THE Barrel_File SHALL not export duplicate symbols that could cause ambiguous imports
