# MIHAS Application System - Complete Tech Stack

**Version**: 3.0  
**Last Updated**: 2025-01-23

## 🎯 Core Framework

### Frontend Framework
- **React** 18.3.1 - UI library
- **TypeScript** 5.7.2 - Type safety
- **Vite** 6.0.3 - Build tool & dev server

### Routing
- **React Router DOM** 6.29.0 - Client-side routing

## 🎨 UI & Styling

### CSS Framework
- **Tailwind CSS** 3.4.17 - Utility-first CSS
- **Tailwind Animate** 1.0.7 - Animation utilities
- **@tailwindcss/forms** 0.5.10 - Form styling
- **Tailwind Merge** 2.5.5 - Class merging
- **PostCSS** 8.5.1 - CSS processing
- **Autoprefixer** 10.4.20 - Vendor prefixes

### Component Library
- **Radix UI** - Headless accessible components
  - react-accordion 1.2.12
  - react-alert-dialog 1.1.15
  - react-checkbox 1.3.3
  - react-dialog 1.1.15
  - react-dropdown-menu 2.1.16
  - react-label 2.1.7
  - react-navigation-menu 1.2.14
  - react-progress 1.1.7
  - react-select 2.2.6
  - react-separator 1.1.7
  - react-slot 1.2.3
  - react-switch 1.2.6
  - react-tabs 1.1.13
  - react-toast 1.2.15
  - react-tooltip 1.2.8

### Icons & Graphics
- **Lucide React** 0.468.0 - Icon library
- **QRCode** 1.5.4 - QR code generation

### Animations
- **Framer Motion** 11.15.0 - Animation library
- **@tsparticles/react** 3.0.0 - Particle effects
- **@tsparticles/slim** 3.9.1 - Lightweight particles

## 📝 Forms & Validation

### Form Management
- **React Hook Form** 7.54.0 - Form state management
- **@hookform/resolvers** 3.10.0 - Validation resolvers
- **Zod** 3.24.1 - Schema validation

### File Upload
- **React Dropzone** 14.3.8 - Drag & drop file upload

## 🗄️ Backend & Database

### Backend as a Service
- **Neon Postgres** - Serverless PostgreSQL database
  - PostgreSQL database
  - Serverless driver (@neondatabase/serverless)
  - Connection pooling
  - Branching for development

### Authentication
- **Custom JWT (jose)** - HS256 token signing
  - HTTP-only cookies
  - Access tokens (15min) + Refresh tokens (7d)
  - bcrypt password hashing (12 rounds)
  - Role-based access control (embedded in JWT)

### Security
- **Arcjet** - Security perimeter
  - Shield rules
  - Bot detection
  - Rate limiting

### API & Serverless
- **Vercel Functions** - Serverless API endpoints
- **Express** 4.21.2 - Local API server (dev)
- **CORS** 2.8.5 - Cross-origin requests

## 📊 State Management

### Global State
- **Zustand** 5.0.2 - Lightweight state management

### Server State
- **@tanstack/react-query** 5.62.7 - Data fetching & caching
- **@tanstack/react-virtual** 3.13.12 - Virtual scrolling

## 📄 Document Generation

### PDF Generation
- **jsPDF** 3.0.3 - PDF creation
- **jsPDF AutoTable** 5.0.2 - PDF tables
- **pdf-lib** 1.17.1 - PDF manipulation

### Excel Generation
- **ExcelJS** 4.4.0 - Excel file creation
- **XLSX** 0.18.5 - Excel parsing

## 🔐 Security & Validation

### Input Sanitization
- **DOMPurify** 3.2.3 - XSS protection

### Authentication
- Custom JWT auth (jose + bcrypt)
- HTTP-only cookies
- Role-based access control (deterministic, no DB lookup)

## 📈 Analytics & Monitoring

### Performance
- **Web Vitals** 4.2.4 - Core Web Vitals tracking

### Error Tracking
- Vercel function logs for API errors
- Browser console for frontend errors

## 🧪 Testing

### E2E Testing
- **Playwright** 1.49.1 - End-to-end testing
- **@playwright/test** - Test runner

### Unit Testing
- **Vitest** 3.2.4 - Unit test framework
- **@vitest/coverage-v8** 3.2.4 - Code coverage
- **@testing-library/react** 16.1.0 - React testing utilities
- **jsdom** 25.0.1 - DOM simulation

### Test Reporting
- **@testmonitor/playwright-reporter** 1.0.0
- **@testmonitor/testmonitor-cli** 1.0.0

## 🚀 Build & Deployment

### Build Tools
- **Vite** 6.0.3 - Fast build tool
- **@vitejs/plugin-react** 4.3.4 - React plugin
- **Terser** 5.37.0 - JS minification
- **Sharp** 0.34.4 - Image optimization

### PWA
- **vite-plugin-pwa** 0.21.1 - Progressive Web App
- **Web Push** 3.6.7 - Push notifications

### Deployment
- **Vercel** - Hosting (static + serverless functions)
- **Bun** - Runtime and package manager

## 🛠️ Development Tools

### Linting & Formatting
- **ESLint** 9.17.0 - Code linting
- **@typescript-eslint/eslint-plugin** 8.18.1
- **@typescript-eslint/parser** 8.18.1
- **eslint-plugin-react-hooks** 5.0.0
- **eslint-plugin-react-refresh** 0.4.16
- **typescript-eslint** 8.18.1
- **globals** 15.12.0

### Utilities
- **date-fns** 4.1.0 - Date manipulation
- **clsx** 2.1.1 - Conditional classes
- **class-variance-authority** 0.7.1 - Component variants
- **dotenv** 16.6.1 - Environment variables
- **concurrently** 9.1.0 - Run multiple commands

### OCR & Image Processing
- **Tesseract.js** 5.1.1 - OCR text extraction

### Intersection Observer
- **react-intersection-observer** 9.14.0 - Scroll animations

### Virtual Scrolling
- **react-window** 1.8.10 - Large list rendering

### Charts
- **Recharts** 3.2.1 - Data visualization

## 📦 Additional Services

### Email
- **Resend** - Transactional emails
- **Zoho SMTP** - Email delivery

### Queue
- **@aws-sdk/client-sqs** 3.895.0 - AWS SQS (optional)

### HTTP Client
- **node-fetch** 3.3.2 - Fetch polyfill
- **form-data** 4.0.1 - Multipart forms

## 🏗️ Architecture

### Design Pattern
- **Component-based** - Reusable UI components
- **Hooks-based** - Custom React hooks
- **Context API** - Auth & global state
- **Server State** - React Query for API data
- **Client State** - Zustand for UI state

### Code Splitting
- Route-based lazy loading
- Component lazy loading
- Vendor chunking (23 chunks)

### Performance Optimizations
- React.memo - Component memoization
- useMemo - Value memoization
- useCallback - Function memoization
- Lazy loading - Code splitting
- PWA caching - Offline support
- Image optimization - WebP, lazy load

## 📊 Bundle Analysis

### Total Size
- **Total**: 5.9 MB (includes assets)
- **JS**: 2.88 MB (optimized)
- **CSS**: ~100 KB

### Chunk Breakdown
- React vendor: 225 KB
- Forms: 54 KB
- Excel: 1.3 MB (lazy)
- PDF: 892 KB (lazy)
- Charts: Separate chunk
- Admin pages: Lazy loaded
- Student pages: Lazy loaded

## 🔧 Configuration Files

- `vercel.json` - Vercel deployment config
- `bunfig.toml` - Bun runtime configuration
- `vite.config.ts` - Vite build settings
- `tailwind.config.js` - Tailwind CSS
- `postcss.config.js` - PostCSS
- `playwright.config.ts` - E2E tests
- `vitest.config.ts` - Unit tests

## 🌐 Browser Support

- Chrome/Edge: Latest 2 versions
- Firefox: Latest 2 versions
- Safari: Latest 2 versions
- Mobile Safari: iOS 14+
- Chrome Mobile: Latest

## 📱 PWA Features

- Offline support
- Install prompt
- Service worker
- Cache-first strategy
- Background sync
- Push notifications (ready)

## 🔒 Security Features

- XSS protection (DOMPurify)
- CSRF protection
- Rate limiting (Arcjet)
- Input validation (Zod)
- SQL injection prevention (parameterized queries)
- Secure headers (Vercel)
- HTTPS only
- Bot detection (Arcjet)

## 📈 Performance Metrics

- **Lighthouse Score**: 85-90
- **First Contentful Paint**: < 1.8s
- **Largest Contentful Paint**: < 2.5s
- **Time to Interactive**: < 3.5s
- **Cumulative Layout Shift**: < 0.1

## 🎯 Key Features Enabled

1. **Authentication** - Custom JWT (jose + bcrypt + HTTP-only cookies)
2. **File Upload** - R2 Storage + Dropzone
3. **Real-time** - SSE + polling
4. **Animations** - Framer Motion + Particles
5. **Forms** - React Hook Form + Zod
6. **PDF Generation** - jsPDF
7. **Excel Export** - ExcelJS
8. **Charts** - Recharts
9. **OCR** - Tesseract.js
10. **PWA** - Vite PWA Plugin
11. **Testing** - Playwright + Vitest
12. **Performance** - Web Vitals tracking
13. **Security** - Arcjet (shield, bot detection, rate limiting)

---

**Total Dependencies**: 80+  
**Production Dependencies**: 60+  
**Dev Dependencies**: 20+  
**Bundle Size**: 2.88 MB (optimized)  
**Build Time**: ~2 minutes
