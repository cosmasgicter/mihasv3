#!/bin/bash

# MIHAS V3 - Production Build and Deploy Script
# This script ensures all navigation and UI fixes are properly built and deployed

set -e

echo "🚀 Starting MIHAS V3 Production Build and Deploy..."

# Clean previous builds
echo "🧹 Cleaning previous builds..."
rm -rf dist/
rm -rf .netlify/functions/
rm -rf node_modules/.vite/

# Install dependencies
echo "📦 Installing dependencies..."
npm ci --production=false

# Type checking
echo "🔍 Running type checks..."
npm run type-check

# Build the application with all fixes
echo "🏗️ Building application with navigation fixes..."
npm run build:prod

# Build Netlify functions
echo "⚡ Building Netlify functions..."
npx netlify-cli functions:build --src api --functions .netlify/functions

# Verify critical files exist
echo "✅ Verifying build artifacts..."
if [ ! -f "dist/index.html" ]; then
    echo "❌ Error: dist/index.html not found"
    exit 1
fi

if [ ! -d ".netlify/functions" ]; then
    echo "❌ Error: .netlify/functions directory not found"
    exit 1
fi

if [ ! -f "dist/sitemap.xml" ]; then
    echo "❌ Error: dist/sitemap.xml not found"
    exit 1
fi

if [ ! -f "dist/robots.txt" ]; then
    echo "❌ Error: dist/robots.txt not found"
    exit 1
fi

echo "📊 Build statistics:"
echo "- HTML files: $(find dist -name "*.html" | wc -l)"
echo "- JS files: $(find dist -name "*.js" | wc -l)"
echo "- CSS files: $(find dist -name "*.css" | wc -l)"
echo "- Functions: $(find .netlify/functions -name "*.js" | wc -l)"

# Deploy to production
echo "🚀 Deploying to production..."
npx netlify-cli deploy --prod --dir=dist --functions=.netlify/functions

echo "✅ Deployment complete!"
echo "🔗 Your application should now be live with all navigation fixes applied."
echo ""
echo "🧪 To test the fixes:"
echo "1. Open your deployed application"
echo "2. Test mobile navigation toggle"
echo "3. Test notification bell visibility"
echo "4. Test user menu functionality"
echo "5. Verify all elements are visible and clickable"