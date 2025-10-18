#!/bin/bash

# MIHAS Netlify Configuration Verification Script
# Checks deployment configuration, environment variables, and function settings

echo "=========================================="
echo "MIHAS Netlify Configuration Verification"
echo "=========================================="
echo ""

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Check if netlify CLI is installed
echo -e "${BLUE}1. Checking Netlify CLI...${NC}"
if command -v netlify &> /dev/null; then
    echo -e "${GREEN}✓ Netlify CLI installed${NC}"
    netlify --version
else
    echo -e "${RED}✗ Netlify CLI not installed${NC}"
    echo "Install with: npm install -g netlify-cli"
fi
echo ""

# Check netlify.toml configuration
echo -e "${BLUE}2. Checking netlify.toml configuration...${NC}"
if [ -f "netlify.toml" ]; then
    echo -e "${GREEN}✓ netlify.toml exists${NC}"
    
    # Check build command
    BUILD_CMD=$(grep -A 2 '^\[build\]' netlify.toml | grep 'command' | cut -d'"' -f2)
    echo "  Build command: $BUILD_CMD"
    
    # Check publish directory
    PUBLISH_DIR=$(grep -A 2 '^\[build\]' netlify.toml | grep 'publish' | cut -d'"' -f2)
    echo "  Publish directory: $PUBLISH_DIR"
    
    # Check Node version
    NODE_VERSION=$(grep -A 2 '^\[build\]' netlify.toml | grep 'NODE_VERSION' | cut -d'"' -f2)
    echo "  Node version: $NODE_VERSION"
    
    # Check functions directory
    FUNC_DIR=$(grep -A 2 '^\[functions\]' netlify.toml | grep 'directory' | cut -d'"' -f2)
    echo "  Functions directory: $FUNC_DIR"
    
    # Check node bundler
    BUNDLER=$(grep -A 2 '^\[functions\]' netlify.toml | grep 'node_bundler' | cut -d'"' -f2)
    echo "  Node bundler: $BUNDLER"
else
    echo -e "${RED}✗ netlify.toml not found${NC}"
fi
echo ""

# Check functions directory
echo -e "${BLUE}3. Checking functions directory...${NC}"
if [ -d "api-functions" ]; then
    echo -e "${GREEN}✓ api-functions directory exists${NC}"
    FUNC_COUNT=$(find api-functions -name "*.js" -type f | wc -l)
    echo "  Total functions: $FUNC_COUNT"
    
    # Check if health function exists
    if [ -f "api-functions/health.js" ]; then
        echo -e "${GREEN}  ✓ health.js exists${NC}"
    else
        echo -e "${RED}  ✗ health.js missing${NC}"
    fi
else
    echo -e "${RED}✗ api-functions directory not found${NC}"
fi
echo ""

# Check api directory (source files)
echo -e "${BLUE}4. Checking API source directory...${NC}"
if [ -d "api" ]; then
    echo -e "${GREEN}✓ api directory exists${NC}"
    
    # Check _lib directory
    if [ -d "api/_lib" ]; then
        echo -e "${GREEN}  ✓ api/_lib directory exists${NC}"
        LIB_COUNT=$(find api/_lib -name "*.js" -type f | wc -l)
        echo "    Library files: $LIB_COUNT"
    else
        echo -e "${RED}  ✗ api/_lib directory missing${NC}"
    fi
    
    # Check health endpoint
    if [ -f "api/health/index.js" ]; then
        echo -e "${GREEN}  ✓ api/health/index.js exists${NC}"
    else
        echo -e "${RED}  ✗ api/health/index.js missing${NC}"
    fi
else
    echo -e "${RED}✗ api directory not found${NC}"
fi
echo ""

# Check environment files
echo -e "${BLUE}5. Checking environment files...${NC}"
for env_file in .env .env.production .env.local; do
    if [ -f "$env_file" ]; then
        echo -e "${GREEN}✓ $env_file exists${NC}"
        
        # Check critical variables
        if grep -q "VITE_SUPABASE_URL" "$env_file"; then
            SUPABASE_URL=$(grep "VITE_SUPABASE_URL" "$env_file" | cut -d'=' -f2)
            echo "  VITE_SUPABASE_URL: ${SUPABASE_URL:0:40}..."
        fi
        
        if grep -q "SUPABASE_SERVICE_ROLE_KEY" "$env_file"; then
            echo "  SUPABASE_SERVICE_ROLE_KEY: [SET]"
        fi
        
        if grep -q "VITE_API_BASE_URL" "$env_file"; then
            API_BASE=$(grep "VITE_API_BASE_URL" "$env_file" | cut -d'=' -f2)
            echo "  VITE_API_BASE_URL: $API_BASE"
        fi
    else
        echo -e "${YELLOW}⚠ $env_file not found${NC}"
    fi
done
echo ""

# Check package.json scripts
echo -e "${BLUE}6. Checking package.json build scripts...${NC}"
if [ -f "package.json" ]; then
    echo -e "${GREEN}✓ package.json exists${NC}"
    
    # Check build:prod script
    if grep -q '"build:prod"' package.json; then
        BUILD_SCRIPT=$(grep '"build:prod"' package.json | cut -d':' -f2 | tr -d ',"')
        echo "  build:prod: $BUILD_SCRIPT"
    fi
    
    # Check Node engine requirement
    if grep -q '"node":' package.json; then
        NODE_REQ=$(grep '"node":' package.json | cut -d':' -f2 | tr -d ',"')
        echo "  Node requirement: $NODE_REQ"
    fi
else
    echo -e "${RED}✗ package.json not found${NC}"
fi
echo ""

# Check if site is linked to Netlify
echo -e "${BLUE}7. Checking Netlify site linkage...${NC}"
if [ -f ".netlify/state.json" ]; then
    echo -e "${GREEN}✓ Site is linked to Netlify${NC}"
    SITE_ID=$(grep -o '"siteId":"[^"]*"' .netlify/state.json | cut -d'"' -f4)
    echo "  Site ID: $SITE_ID"
else
    echo -e "${YELLOW}⚠ Site not linked to Netlify (run: netlify link)${NC}"
fi
echo ""

# Check Netlify environment variables (if logged in)
echo -e "${BLUE}8. Checking Netlify environment variables...${NC}"
if command -v netlify &> /dev/null && [ -f ".netlify/state.json" ]; then
    echo "Attempting to fetch environment variables from Netlify..."
    
    # Try to get env vars (requires authentication)
    netlify env:list 2>/dev/null | head -20
    
    if [ $? -ne 0 ]; then
        echo -e "${YELLOW}⚠ Unable to fetch environment variables${NC}"
        echo "  Run: netlify login"
        echo "  Then: netlify env:list"
    fi
else
    echo -e "${YELLOW}⚠ Cannot check Netlify environment variables${NC}"
fi
echo ""

# Check build output directory
echo -e "${BLUE}9. Checking build output...${NC}"
if [ -d "dist" ]; then
    echo -e "${GREEN}✓ dist directory exists${NC}"
    
    # Check if index.html exists
    if [ -f "dist/index.html" ]; then
        echo -e "${GREEN}  ✓ dist/index.html exists${NC}"
    else
        echo -e "${RED}  ✗ dist/index.html missing${NC}"
    fi
    
    # Check assets
    if [ -d "dist/assets" ]; then
        ASSET_COUNT=$(find dist/assets -type f | wc -l)
        echo "  Assets: $ASSET_COUNT files"
    fi
else
    echo -e "${YELLOW}⚠ dist directory not found (run: npm run build:prod)${NC}"
fi
echo ""

# Summary and recommendations
echo -e "${BLUE}=========================================="
echo "Summary & Recommendations"
echo "==========================================${NC}"
echo ""

echo "Critical Environment Variables Required:"
echo "  - VITE_SUPABASE_URL"
echo "  - VITE_SUPABASE_ANON_KEY"
echo "  - SUPABASE_SERVICE_ROLE_KEY"
echo "  - SUPABASE_URL"
echo ""

echo "Netlify Deployment Checklist:"
echo "  1. Ensure all environment variables are set in Netlify dashboard"
echo "  2. Build command: npm run build:prod"
echo "  3. Publish directory: dist"
echo "  4. Functions directory: api-functions"
echo "  5. Node version: 20.18.0 or higher"
echo ""

echo "To set environment variables in Netlify:"
echo "  netlify env:set VARIABLE_NAME value"
echo ""

echo "To deploy:"
echo "  netlify deploy --prod"
echo ""

echo -e "${GREEN}Verification complete!${NC}"
