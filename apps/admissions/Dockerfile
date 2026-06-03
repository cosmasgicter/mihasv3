# Multi-stage: build the admissions SPA with Bun, then serve it with Caddy.
#
# Build context is the REPO ROOT (monorepo workspace). Built in CI:
#   docker build -f apps/admissions/Dockerfile \
#     --build-arg VITE_API_BASE_URL=https://api.mihas.edu.zm \
#     --build-arg VITE_APP_BASE_URL=https://apply.mihas.edu.zm \
#     --build-arg VITE_APP_VERSION=$GIT_SHA \
#     --build-arg VITE_GLITCHTIP_DSN=... \
#     -t ghcr.io/<owner>/mihas-frontend:<sha> .
#
# VITE_* values are baked at build time (Vite inlines them). They are public
# by design (DSN, public keys) — no secrets belong here.

# ---- build stage ----
FROM oven/bun:1.3-alpine AS build
WORKDIR /repo

# Workspace install: copy root manifests + ALL workspace member manifests so
# bun's frozen lockfile resolves (root package.json globs apps/* + shared).
COPY package.json bun.lock ./
COPY apps/admissions/package.json apps/admissions/package.json
COPY apps/jobs-ops/package.json apps/jobs-ops/package.json
COPY apps/student-portal/package.json apps/student-portal/package.json
COPY apps/website/package.json apps/website/package.json
COPY shared/package.json shared/package.json
RUN bun install --frozen-lockfile

# App source (+ shared scaffold, referenced by the workspace).
COPY apps/admissions apps/admissions
COPY apps/jobs-ops apps/jobs-ops
COPY shared shared

ARG VITE_API_BASE_URL
ARG VITE_APP_BASE_URL
ARG VITE_SITE_URL
ARG VITE_APP_VERSION
ARG VITE_GLITCHTIP_DSN
ARG VITE_LENCO_PUBLIC_KEY
ARG VITE_LENCO_WIDGET_URL
ARG VITE_SIGN_IN_URL
ENV VITE_API_BASE_URL=$VITE_API_BASE_URL \
    VITE_APP_BASE_URL=$VITE_APP_BASE_URL \
    VITE_SITE_URL=$VITE_SITE_URL \
    VITE_APP_VERSION=$VITE_APP_VERSION \
    VITE_GLITCHTIP_DSN=$VITE_GLITCHTIP_DSN \
    VITE_LENCO_PUBLIC_KEY=$VITE_LENCO_PUBLIC_KEY \
    VITE_LENCO_WIDGET_URL=$VITE_LENCO_WIDGET_URL \
    VITE_SIGN_IN_URL=$VITE_SIGN_IN_URL

WORKDIR /repo/apps/admissions
RUN bun run build

# jobs-ops operator dashboard — same image, served by Caddy at jobs.<domain>.
WORKDIR /repo/apps/jobs-ops
RUN bun run build

# ---- serve stage ----
FROM caddy:2-alpine
COPY apps/admissions/Caddyfile /etc/caddy/Caddyfile
COPY --from=build /repo/apps/admissions/dist /srv/www
COPY --from=build /repo/apps/jobs-ops/dist /srv/jobs
