#!/bin/bash
# MIHAS Application System V2 - Deployment Script

echo "🚀 Starting MIHAS Application System V2 deployment..."

# Install dependencies
echo "📦 Installing dependencies..."
npm install

# Install react-dropzone specifically for V2 features
echo "📦 Installing V2 dependencies..."
npm install react-dropzone

# Run type checking
echo "🔍 Running type check..."
npm run type-check

# Build for production
echo "🏗️  Building for production..."
npm run build:prod

# Check build output
echo "✅ Build completed! Contents:"
ls -la dist/

echo "🎉 Deployment preparation complete!"
echo ""
echo "📋 Next steps:"
echo "1. Upload this directory to Netlify"
echo "2. Set environment variables in Netlify dashboard"
echo "3. Deploy to production"
echo ""
echo "🔗 Environment variables to set in Netlify:"
echo "- VITE_SUPABASE_URL"
echo "- VITE_SUPABASE_ANON_KEY" 
echo "- VITE_API_BASE_URL"
echo "- VITE_TURNSTILE_SITE_KEY"
echo "- VITE_ANALYTICS_SITE_ID"
echo "- All other variables from .env.production"