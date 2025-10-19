# MIHAS - Application System

## 🎯 Project Overview

MIHAS (Medical Institute of Health and Allied Sciences) Application System V3 - A complete TypeScript/React application system for student admissions with enterprise-grade eligibility checking.

## 📁 Project Structure

```
mihasv3/
├── src/                          # Source code
├── api/                          # API source (organized by feature)
├── api-functions/                # Serverless functions (flat, deployment-ready)
├── docs/                         # Documentation
│   ├── reports/                  # Analysis and audit reports
│   ├── guides/                   # User guides and manuals
│   └── analysis/                 # Technical analysis
├── scripts/                      # Utility scripts
│   ├── tests/                    # Test scripts
│   ├── setup/                    # Setup and deployment scripts
│   └── deployment/               # Deployment utilities
├── archive/                      # Archived files
├── API_STRUCTURE_GUIDE.md        # API development standards ⭐
├── COMPLETE_SOURCE_CODE_FINAL.md # Complete source code (2.6MB)
├── package.json                  # Dependencies
├── netlify.toml                  # Netlify configuration
└── README.md                     # This file
```

## 🚀 Quick Start

### Development
```bash
npm install
npm run dev
```

### Production Build
```bash
npm run build:prod
```

### Testingg
```bash
npm run test
npm run test:unit
```

## 📖 Documentation

- **API Structure Guide**: `API_STRUCTURE_GUIDE.md` ⭐ **READ THIS FIRST**
- **Unified Templates System**: `docs/UNIFIED_TEMPLATES_SYSTEM.md` ⭐ **NEW**
- **Template Migration Guide**: `docs/TEMPLATE_MIGRATION_GUIDE.md`
- **Complete Source Code**: `COMPLETE_SOURCE_CODE_FINAL.md` (2.6MB, 457 files)
- **User Guides**: `docs/guides/`
- **Technical Reports**: `docs/reports/`
- **Deployment Guide**: `docs/DEPLOYMENT_GUIDE.md`

## 🔧 Technology Stack

- **Frontend**: React 18 + TypeScript + Vite
- **Backend**: Supabase (PostgreSQL + Auth + Storage)
- **Deployment**: Netlify with serverless functions
- **State**: Zustand + React Query
- **Forms**: React Hook Form + Zod
- **Styling**: Tailwind CSS + Radix UI

## ✨ Key Features

- 4-step application wizard
- Enterprise eligibility checking (HPCZ, GNC/NMCZ, ECZ)
- Auto-save every 8 seconds
- Real-time eligibility assessment
- Non-blocking design (students can always proceed)
- Mobile-responsive
- Offline capability (PWA)

## 📊 System Statistics

- **Database Tables**: 86
- **Source Files**: 457
- **Lines of Code**: ~56,000
- **API Functions**: 47 (all in `api-functions/`)
- **React Components**: 120+
- **Custom Hooks**: 38

## 🔐 Security

- 300+ security vulnerabilities fixed
- Zero critical issues
- Enterprise-grade security framework
- Input sanitization and validation
- Rate limiting and CSRF protection

## 📞 Support

- **Technical**: admin@mihas.edu.zm
- **Admissions**: admissions@mihas.edu.zm

---

**Version**: 3.0 (Enterprise Eligibility System)  
**Status**: Production Ready  
**Last Updated**: 2025-01-23
