# Product Overview

MIHAS (Mukuba Institute of Health and Allied Sciences) Application System V3 is an enterprise-grade student admissions platform built for a Zambian medical institute.

## Core Features

- **4-step Application Wizard**: Streamlined application process with auto-save every 8 seconds
- **Enterprise Eligibility Checking**: Real-time validation against HPCZ, GNC/NMCZ, and ECZ systems
- **Non-blocking Design**: Students can always proceed even if eligibility checks fail
- **Mobile-responsive PWA**: Works offline with service worker caching
- **Multi-role System**: Student, Admin, and Super Admin dashboards
- **Document Management**: PDF generation, file uploads, and document verification
- **Real-time Notifications**: Email, SMS, and WhatsApp integration

## Key Statistics

- **Database**: 86 tables in PostgreSQL via Supabase
- **Codebase**: ~56,000 lines across 457 files
- **API Endpoints**: 47 Cloudflare Pages Functions
- **Components**: 120+ React components
- **Security**: Enterprise-grade with 300+ vulnerabilities fixed

## Target Users

- **Students**: Applying for medical programs
- **Admissions Staff**: Managing applications and eligibility
- **Administrators**: System configuration and reporting

## Business Context

This is a production system serving real students applying to a medical institute in Zambia. All code changes must maintain data integrity and system reliability.