# MASTER FORENSIC ROOT-CAUSE ANALYSIS

## Context
- **Date**: February 1, 2026 (CAT)
- **Platform**: Vercel Serverless
- **Runtime**: Bun build, Node runtime execution
- **API count**: 12 functions (Vercel free tier limit)
- **Auth**: Bun-native JWT (jose + bcryptjs)
- **DB**: Neon Postgres (via abstraction layer)
- **Security**: Arcjet enabled
- **Realtime**: Bun-native SSE

## Observed Symptoms
- ✅ `/api/ping` returns success
- ✅ `/api/health` returns success  
- ❌ ALL other API functions crash with `FUNCTION_INVOCATION_FAILED` (500)
- ✅ Environment variables ARE PRESENT (confirmed in ping response)

## Critical Constraints
1. DO NOT assume missing env vars (confirmed present)
2. DO NOT assume auth logic failure
3. DO NOT propose fixes until root cause is proven
4. DO NOT refactor — only isolate and explain failure
5. Every conclusion must cite concrete execution evidence

## User Stories

### US-1: Root Cause Identification
AS A systems engineer
I WANT to identify the exact root cause of API failures
SO THAT I can understand why ping works but other endpoints crash

**Acceptance Criteria:**
- Execution timeline reconstructed for all phases
- Differential analysis between working and failing endpoints
- Import chain forensics completed
- Middleware chain traced
- Runtime mismatch identified if present
- Single root cause statement produced

### US-2: Evidence Chain
AS A systems engineer  
I WANT documented evidence for every conclusion
SO THAT fixes can be targeted precisely

**Acceptance Criteria:**
- Each phase produces concrete file/line references
- No speculation or assumptions
- Verification steps provided
