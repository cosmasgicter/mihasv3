#!/bin/bash

# MIHAS Netlify Deployment Setup Script
# Sets up environment variables and prepares for deployment

echo "=========================================="
echo "MIHAS Netlify Deployment Setup"
echo "=========================================="
echo ""

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
RED='\033[0;31m'
NC='\033[0m'

# Check if logged in
echo -e "${BLUE}Checking Netlify authentication...${NC}"
if ! netlify status &>/dev/null; then
    echo -e "${YELLOW}Not logged in to Netlify${NC}"
    echo "Please run: netlify login"
    exit 1
fi
echo -e "${GREEN}✓ Logged in to Netlify${NC}"
echo ""

# Link site or create new one
echo -e "${BLUE}Linking to Netlify site...${NC}"
if [ ! -f ".netlify/state.json" ]; then
    echo "Site not linked. Options:"
    echo "  1. Link to existing site: netlify link"
    echo "  2. Create new site: netlify init"
    echo ""
    read -p "Do you want to link to an existing site? (y/n): " -n 1 -r
    echo
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        netlify link
    else
        echo "Please run 'netlify init' to create a new site"
        exit 1
    fi
fi
echo ""

# Read environment variables from .env.production
echo -e "${BLUE}Reading environment variables from .env.production...${NC}"
if [ ! -f ".env.production" ]; then
    echo -e "${RED}✗ .env.production not found${NC}"
    exit 1
fi

# Function to set environment variable in Netlify
set_netlify_env() {
    local key=$1
    local value=$2
    
    if [ -n "$value" ]; then
        echo "Setting $key..."
        netlify env:set "$key" "$value" --context production --silent 2>/dev/null
        if [ $? -eq 0 ]; then
            echo -e "${GREEN}✓ $key set${NC}"
        else
            echo -e "${RED}✗ Failed to set $key${NC}"
        fi
    fi
}

# Extract and set critical environment variables
echo ""
echo -e "${BLUE}Setting environment variables in Netlify...${NC}"

# Supabase variables
VITE_SUPABASE_URL=$(grep "^VITE_SUPABASE_URL=" .env.production | cut -d'=' -f2)
VITE_SUPABASE_ANON_KEY=$(grep "^VITE_SUPABASE_ANON_KEY=" .env.production | cut -d'=' -f2)
SUPABASE_SERVICE_ROLE_KEY=$(grep "^SUPABASE_SERVICE_ROLE_KEY=" .env.production | cut -d'=' -f2)
SUPABASE_URL=$(grep "^SUPABASE_URL=" .env.production | cut -d'=' -f2)

set_netlify_env "VITE_SUPABASE_URL" "$VITE_SUPABASE_URL"
set_netlify_env "VITE_SUPABASE_ANON_KEY" "$VITE_SUPABASE_ANON_KEY"
set_netlify_env "SUPABASE_SERVICE_ROLE_KEY" "$SUPABASE_SERVICE_ROLE_KEY"
set_netlify_env "SUPABASE_URL" "$SUPABASE_URL"

# API Configuration
VITE_API_BASE_URL=$(grep "^VITE_API_BASE_URL=" .env.production | cut -d'=' -f2)
VITE_APP_BASE_URL=$(grep "^VITE_APP_BASE_URL=" .env.production | cut -d'=' -f2)

set_netlify_env "VITE_API_BASE_URL" "$VITE_API_BASE_URL"
set_netlify_env "VITE_APP_BASE_URL" "$VITE_APP_BASE_URL"

# Email Configuration
EMAIL_PROVIDER=$(grep "^EMAIL_PROVIDER=" .env.production | cut -d'=' -f2)
EMAIL_FROM=$(grep "^EMAIL_FROM=" .env.production | cut -d'=' -f2)
RESEND_API_KEY=$(grep "^RESEND_API_KEY=" .env.production | cut -d'=' -f2)
RESEND_FROM_EMAIL=$(grep "^RESEND_FROM_EMAIL=" .env.production | cut -d'=' -f2)

set_netlify_env "EMAIL_PROVIDER" "$EMAIL_PROVIDER"
set_netlify_env "EMAIL_FROM" "$EMAIL_FROM"
set_netlify_env "RESEND_API_KEY" "$RESEND_API_KEY"
set_netlify_env "RESEND_FROM_EMAIL" "$RESEND_FROM_EMAIL"

# SMTP Configuration
SMTP_HOST=$(grep "^SMTP_HOST=" .env.production | cut -d'=' -f2)
SMTP_PORT=$(grep "^SMTP_PORT=" .env.production | cut -d'=' -f2)
SMTP_USERNAME=$(grep "^SMTP_USERNAME=" .env.production | cut -d'=' -f2)
SMTP_PASSWORD=$(grep "^SMTP_PASSWORD=" .env.production | cut -d'=' -f2)
SMTP_SECURE=$(grep "^SMTP_SECURE=" .env.production | cut -d'=' -f2)
SMTP_FROM_EMAIL=$(grep "^SMTP_FROM_EMAIL=" .env.production | cut -d'=' -f2)

set_netlify_env "SMTP_HOST" "$SMTP_HOST"
set_netlify_env "SMTP_PORT" "$SMTP_PORT"
set_netlify_env "SMTP_USERNAME" "$SMTP_USERNAME"
set_netlify_env "SMTP_PASSWORD" "$SMTP_PASSWORD"
set_netlify_env "SMTP_SECURE" "$SMTP_SECURE"
set_netlify_env "SMTP_FROM_EMAIL" "$SMTP_FROM_EMAIL"

# Analytics
VITE_ANALYTICS_BASE_URL=$(grep "^VITE_ANALYTICS_BASE_URL=" .env.production | cut -d'=' -f2)
VITE_ANALYTICS_SITE_ID=$(grep "^VITE_ANALYTICS_SITE_ID=" .env.production | cut -d'=' -f2)

set_netlify_env "VITE_ANALYTICS_BASE_URL" "$VITE_ANALYTICS_BASE_URL"
set_netlify_env "VITE_ANALYTICS_SITE_ID" "$VITE_ANALYTICS_SITE_ID"

# Other important variables
VITE_NODE_ENV=$(grep "^VITE_NODE_ENV=" .env.production | cut -d'=' -f2)
TURNSTILE_SECRET_KEY=$(grep "^TURNSTILE_SECRET_KEY=" .env.production | cut -d'=' -f2)
VITE_TURNSTILE_SITE_KEY=$(grep "^VITE_TURNSTILE_SITE_KEY=" .env.production | cut -d'=' -f2)

set_netlify_env "VITE_NODE_ENV" "$VITE_NODE_ENV"
set_netlify_env "TURNSTILE_SECRET_KEY" "$TURNSTILE_SECRET_KEY"
set_netlify_env "VITE_TURNSTILE_SITE_KEY" "$VITE_TURNSTILE_SITE_KEY"

# Rate limiting
RATE_LIMIT_TABLE=$(grep "^RATE_LIMIT_TABLE=" .env.production | cut -d'=' -f2)
set_netlify_env "RATE_LIMIT_TABLE" "$RATE_LIMIT_TABLE"

echo ""
echo -e "${GREEN}Environment variables setup complete!${NC}"
echo ""

# Verify environment variables
echo -e "${BLUE}Verifying environment variables...${NC}"
netlify env:list --context production | head -30

echo ""
echo -e "${BLUE}=========================================="
echo "Next Steps"
echo "==========================================${NC}"
echo ""
echo "1. Build the application:"
echo "   npm run build:prod"
echo ""
echo "2. Test the build locally:"
echo "   netlify dev"
echo ""
echo "3. Deploy to production:"
echo "   netlify deploy --prod"
echo ""
echo "4. Test the health endpoint:"
echo "   curl https://your-site.netlify.app/api/health"
echo ""
