# MIHAS - Application System

## 🎯 Project Overview

MIHAS (Mukuba Institute of Health and Allied Sciences) Application System V3 - A complete TypeScript/React application system for student admissions with enterprise-grade eligibility checking.

## 📁 Project Structure

```
mihasv3/
├── src/                          # React frontend source code
├── api/                          # Vercel Serverless Functions (8 consolidated endpoints)
│   ├── _lib/                     # Shared utilities (cors, auth, db)
│   ├── admin.ts                  # Admin dashboard & user management
│   ├── applications.ts           # Application CRUD operations
│   ├── auth.ts                   # Authentication endpoints
│   ├── catalog.ts                # Programs, intakes, subjects
│   ├── documents.ts              # Document upload & OCR
│   ├── notifications.ts          # Email notifications
│   ├── payments.ts               # Payment processing
│   └── sessions.ts               # Session tracking
├── tests/                        # Test files (unit, property, integration)
├── docs/                         # Documentation
│   ├── reports/                  # Analysis and audit reports
│   ├── guides/                   # User guides and manuals
│   └── analysis/                 # Technical analysis
├── scripts/                      # Utility scripts
├── supabase/                     # Database migrations and functions
├── public/                       # Static assets, PWA files
├── package.json                  # Dependencies (Bun)
├── vercel.json                   # Vercel deployment config
└── README.md                     # This file
```

## 🚀 Quick Start

### Development
```bash
bun install
bun run dev
```

### Production Build
```bash
bunx --bun vite build
```

### Testing
```bash
bun run test
bun run test:property  # Property-based tests
```

## 📖 Documentation

### For Developers
- **Developer Onboarding**: `docs/DEVELOPER_ONBOARDING.md` ⭐ **START HERE**
- **API Structure Guide**: `API_STRUCTURE_GUIDE.md`
- **API Reference**: `docs/API_REFERENCE.md`
- **Troubleshooting**: `docs/TROUBLESHOOTING.md`
- **Changelog**: `docs/CHANGELOG.md`

### For Users
- **Student Guide**: `docs/guides/STUDENT_GUIDE.md`
- **Admin Guide**: `docs/guides/ADMIN_GUIDE.md`

### For DevOps
- **Deployment Guide**: `docs/DEPLOYMENT_GUIDE.md` ⭐ **DEPLOY HERE**
- **Performance Plan**: `docs/PERFORMANCE_OPTIMIZATION_PLAN.md`
- **Documentation Plan**: `docs/DOCUMENTATION_IMPROVEMENT_PLAN.md`

### Technical Reports
- **System Status**: `docs/reports/SYSTEM_STATUS_SUMMARY.md`
- **Security Audit**: `SECURITY_AUDIT_REPORT.md`
- **Production Readiness**: `PRODUCTION_READINESS_REPORT.md`
- **Unified Templates**: `docs/UNIFIED_TEMPLATES_SYSTEM.md`
- **Complete Source Code**: `COMPLETE_SOURCE_CODE_FINAL.md` (2.6MB, 457 files)
- **Realtime Sync Fix**: `REALTIME_FIX_INDEX.md` ⭐ **START HERE** | [Summary](REALTIME_SYNC_FIX_SUMMARY.md) | [Deploy](DEPLOYMENT_INSTRUCTIONS.md)

## 🔧 Technology Stack

- **Frontend**: React 18 + TypeScript + Vite
- **Backend**: Supabase (PostgreSQL + Auth + Storage)
- **Deployment**: Vercel (Static + Serverless Functions)
- **Runtime**: Bun (all dev and prod commands)
- **State**: Zustand + React Query (polling for real-time)
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
- **API Endpoints**: 8 consolidated (Vercel Hobby plan)
- **React Components**: 120+
- **Custom Hooks**: 38
- **Property Tests**: 62 (8 test files)

## 🔐 Security

- 300+ security vulnerabilities fixed
- Zero critical issues
- Enterprise-grade security framework
- Input sanitization and validation
- Rate limiting and CSRF protection

## ⚡ Kiro Powers

This workspace has the following Kiro powers installed for enhanced development capabilities:

| Power | Description | Keywords | MCP Server |
|-------|-------------|----------|------------|
| **supabase-hosted** | Build applications with Supabase's Postgres database, authentication, storage, and real-time subscriptions | database, postgres, auth, storage, realtime, backend, supabase, rls | supabase |
| **strands** | Build AI agents with Strands Agent SDK using Bedrock, Anthropic, OpenAI, Gemini, or Llama models | agents, ai, llm, bedrock, anthropic, openai, gemini, strands, tools | strands-agents |
| **aws-agentcore** | Amazon Bedrock AgentCore is an agentic platform for building, deploying, and operating effective agents | agentcore, bedrock, aws, agents, ai, development, agent | agentcore-mcp-server |

### Using Powers

Powers provide specialized tools through MCP servers. To use them:

1. **Activate**: Use `action="activate"` with the power name to discover available tools and documentation
2. **Use**: Use `action="use"` with powerName, serverName, toolName, and arguments
3. **Read Guides**: Use `action="readSteering"` for detailed workflow guides

## 📞 Support

- **Technical**: ***REMOVED***
- **Admissions**: ***REMOVED***

---

**Version**: 3.0 (Enterprise Eligibility System)  
**Status**: Production Ready  
**Hosting**: Vercel (migrated from Cloudflare)  
**Last Updated**: 2026-01-30  
**Documentation**: 100% Complete ✅
