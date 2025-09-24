#!/bin/bash
# MIHAS Application System V2 - Deployment Script

set -euo pipefail

log() {
  echo "[$(date -Iseconds)] $1"
}

ensure_command() {
  if ! command -v "$1" >/dev/null 2>&1; then
    echo "❌ Required command '$1' is not installed or not available in PATH" >&2
    exit 1
  fi
}

require_env() {
  local name="$1"
  if [[ -z "${!name:-}" ]]; then
    echo "❌ Environment variable '$name' must be set" >&2
    exit 1
  fi
}

log "🚀 Starting MIHAS Application System V2 deployment..."

log "📦 Installing dependencies..."
npm install

log "📦 Ensuring V2 UI dependency is installed..."
npm install react-dropzone

log "🔍 Running type check..."
npm run type-check

log "🏗️  Building for production..."
npm run build:prod

log "✅ Build completed! Contents:"
ls -la dist/

publish_to_cdn() {
  log "☁️  Publishing build artifacts to CloudFront origin..."
  ensure_command aws
  require_env CDN_BUCKET_NAME
  require_env CDN_DISTRIBUTION_ID

  local default_cache_control="${CDN_DEFAULT_CACHE_CONTROL:-public,max-age=31536000,immutable}"
  local html_cache_control="${CDN_HTML_CACHE_CONTROL:-public,max-age=300,must-revalidate}"

  log "  • Syncing static assets to s3://${CDN_BUCKET_NAME} (cache-control: ${default_cache_control})"
  aws s3 sync dist/ "s3://${CDN_BUCKET_NAME}" \
    --delete \
    --cache-control "${default_cache_control}" \
    --exclude "index.html" \
    --exclude "404.html"

  if [[ -f dist/index.html ]]; then
    log "  • Uploading index.html with HTML cache-control override (${html_cache_control})"
    aws s3 cp dist/index.html "s3://${CDN_BUCKET_NAME}/index.html" \
      --cache-control "${html_cache_control}" \
      --content-type "text/html; charset=utf-8"
  fi

  if [[ -f dist/404.html ]]; then
    log "  • Uploading 404.html with HTML cache-control override (${html_cache_control})"
    aws s3 cp dist/404.html "s3://${CDN_BUCKET_NAME}/404.html" \
      --cache-control "${html_cache_control}" \
      --content-type "text/html; charset=utf-8"
  fi

  local invalidation_paths=("${CDN_INVALIDATION_PATHS:-/*}")

  if [[ "${#invalidation_paths[@]}" -eq 1 && "${invalidation_paths[0]}" == *" "* ]]; then
    # Support space-delimited lists in a single string
    read -r -a invalidation_paths <<< "${CDN_INVALIDATION_PATHS}"
  fi

  log "🧹 Creating CloudFront invalidation for paths: ${invalidation_paths[*]}"
  aws cloudfront create-invalidation \
    --distribution-id "${CDN_DISTRIBUTION_ID}" \
    --paths "${invalidation_paths[@]}"

  log "✅ CDN publish complete"
}

if [[ "${PUBLISH_TO_CDN:-true}" == "true" ]]; then
  if [[ -n "${CDN_BUCKET_NAME:-}" && -n "${CDN_DISTRIBUTION_ID:-}" ]]; then
    publish_to_cdn
  else
    log "⚠️  CDN publish skipped: set CDN_BUCKET_NAME and CDN_DISTRIBUTION_ID to enable automatic uploads."
  fi
else
  log "ℹ️  CDN publish disabled via PUBLISH_TO_CDN=false"
fi

log "🎉 Deployment preparation complete!"
log ""
log "📋 Next steps:"
log "1. Upload this directory to Netlify or deploy the CDN infrastructure (see DEPLOYMENT_GUIDE.md)"
log "2. Set environment variables in Netlify dashboard"
log "3. Deploy to production"
log ""
log "🔗 Environment variables to set in Netlify:"
log "- VITE_SUPABASE_URL"
log "- VITE_SUPABASE_ANON_KEY"
log "- VITE_API_BASE_URL"
log "- VITE_TURNSTILE_SITE_KEY"
log "- VITE_ANALYTICS_SITE_ID"
log "- All other variables from .env.production"
