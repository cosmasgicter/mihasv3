# Self-Hosted Spring Boot Platform Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Move the MIHAS backend to a self-hosted Spring Boot platform on AWS Ubuntu while keeping the frontend on Vercel and the database on Neon, starting with a local Linux Mint build environment that mirrors production closely.

**Architecture:** Use a modular monolith Spring Boot backend with separate `api` and `worker` containers behind a reverse proxy on one Ubuntu host. Keep Neon Postgres, Cloudflare R2, and Resend as managed services, and use Docker Compose both locally and on the server so the local environment matches deployment as closely as possible.

**Tech Stack:** Java 21 LTS, Spring Boot 3.5.x baseline, Spring Modulith, Spring Security, Flyway, jOOQ or `JdbcClient`, Neon Postgres, Redis, RabbitMQ, Docker, Docker Compose, Caddy, Prometheus, Grafana, Loki, GitHub Actions, GHCR.

---

## What Existing Plans Already Decided

- [`docs/decision/2026-03-09-backend-decision-matrix.md`](docs/decision/2026-03-09-backend-decision-matrix.md) says Spring Boot is not the fastest migration, but it is the strongest choice if the goal is enterprise backend depth.
- [`docs/migration/2026-03-09-spring-boot-migration-guide.md`](docs/migration/2026-03-09-spring-boot-migration-guide.md) already recommends:
  - keep the React frontend
  - keep Neon Postgres
  - port the backend in phases
  - extract heavy work into jobs/workers early
- This plan changes the hosting direction only:
  - do not deploy the backend to Koyeb or Cloud Run
  - do self-host the backend on AWS Ubuntu with containers
  - do keep Vercel for the frontend
  - do keep Neon for Postgres

## Recommended Stack For This Project

### Core product stack

- Frontend: existing React/Vite SPA on Vercel
- Backend API: Spring Boot modular monolith
- Database: Neon Postgres with pooled connection string
- Object storage: Cloudflare R2
- Email: Resend
- Background jobs: RabbitMQ + Spring AMQP
- Cache and rate-limit primitives: Redis
- Reverse proxy and TLS: Caddy
- Observability: Spring Boot Actuator + Prometheus + Grafana + Loki

### Why this is the best fit here

- Spring Boot gives you the backend depth you said you want.
- A modular monolith is the right shape before microservices.
- Redis and RabbitMQ give you real operational learning without forcing a distributed-system rewrite.
- Caddy keeps HTTPS and reverse proxying simple on a single host.
- Docker Compose is enough for one Ubuntu server and teaches the right operational basics before Kubernetes.

### Specific backend recommendation

- Use Java `21` LTS.
- Start on Spring Boot `3.5.x` first.
  - Spring Boot `4.0.3` is already available, but starting on `3.5.x` is the safer baseline for a first serious self-hosted Spring project.
  - That is an implementation recommendation from the current stable release list, not an official Spring statement that `3.5.x` is "better".
- Use Spring Modulith so the codebase stays a modular monolith instead of turning into a giant package dump.
- Prefer `jOOQ` or Spring `JdbcClient` over heavy JPA-first design for this repo, because the current codebase is already SQL-explicit and the migration guide specifically warns against hiding behavior behind JPA.

### Target service layout on the Ubuntu host

- `caddy`: public HTTPS entrypoint
- `mihas-api`: Spring Boot API container
- `mihas-worker`: Spring Boot worker container
- `redis`: caching, throttling helpers, temporary token state
- `rabbitmq`: async jobs
- `prometheus`: metrics scraping
- `grafana`: dashboards
- `loki`: logs
- `promtail`: log shipping

Do **not** add Kubernetes, Keycloak, Elasticsearch, or separate microservices in phase 1.

---

### Task 1: Lock the production target and constraints

**Files:**
- Review: `docs/decision/2026-03-09-backend-decision-matrix.md`
- Review: `docs/migration/2026-03-09-spring-boot-migration-guide.md`
- Create: `docs/decision/2026-03-11-self-hosted-target.md`

**Step 1: Record what stays and what moves**

Write these decisions explicitly:

- frontend stays on Vercel
- database stays on Neon
- storage stays on R2
- email stays on Resend
- backend moves to AWS Ubuntu
- jobs/queue/cache run on the Ubuntu host

**Step 2: Record the exact OS target**

Write one of these:

- `Ubuntu 24.04 LTS` on AWS if you want the safest production target
- `Ubuntu 25.10` only if you intentionally want an interim release

Add a note:

- if the current AWS box is `Ubuntu 25.04`, replace or upgrade it before production use

**Step 3: Record the non-goals**

State:

- no microservices in phase 1
- no database vendor change
- no frontend rewrite
- no Kubernetes in phase 1

**Step 4: Commit**

```bash
git add docs/decision/2026-03-11-self-hosted-target.md
git commit -m "docs: lock self-hosted spring target"
```

### Task 2: Create a local parity environment on Linux Mint

**Files:**
- Create: `docs/runbooks/local-build-environment.md`
- Create: `backend-spring/.sdkmanrc`
- Create: `backend-spring/.env.example`

**Step 1: Decide how to mirror Ubuntu locally**

Preferred order:

1. run an Ubuntu `24.04` VM on Linux Mint for parity
2. if you want fewer layers, install the build tools directly on Mint
3. still run the platform services through Docker Compose either way

**Step 2: Install the local toolchain**

Install and verify:

- Java `21`
- Maven `3.9+` or Gradle `8.14+`
- Docker Engine
- Docker Compose plugin
- Git
- Make or just shell scripts

**Step 3: Verify the machine is ready**

Run:

```bash
java -version
mvn -version
docker version
docker compose version
```

Expected:

- Java 21 detected
- Maven or Gradle detected
- Docker daemon running
- Compose plugin available

**Step 4: Commit**

```bash
git add docs/runbooks/local-build-environment.md backend-spring/.sdkmanrc backend-spring/.env.example
git commit -m "docs: define local spring build environment"
```

### Task 3: Freeze the current API contract before rewriting anything

**Files:**
- Review: `api-src/*.ts`
- Create: `docs/api/current-contract.md`
- Create: `tests/integration/contract/README.md`

**Step 1: Inventory every current endpoint**

Document:

- route path
- supported `action` values
- auth requirement
- request body shape
- response envelope
- error envelope

**Step 2: Mark frontend-critical contracts**

Highlight these as phase-1 compatibility blockers:

- auth
- applications
- documents
- payments
- admin
- notifications
- sessions

**Step 3: Capture sample payloads**

For each critical endpoint, store one valid request and one valid response example.

**Step 4: Commit**

```bash
git add docs/api/current-contract.md tests/integration/contract/README.md
git commit -m "test: freeze existing backend contract"
```

### Task 4: Bootstrap the Spring backend as a modular monolith

**Files:**
- Create: `backend-spring/pom.xml`
- Create: `backend-spring/src/main/java/com/mihas/MihasApplication.java`
- Create: `backend-spring/src/main/resources/application.yml`
- Create: `backend-spring/src/main/resources/application-dev.yml`
- Create: `backend-spring/src/main/resources/application-prod.yml`
- Create: `backend-spring/README.md`

**Step 1: Generate the base app**

Include these starters and libraries:

- Spring Web
- Spring Security
- Validation
- Actuator
- Flyway
- PostgreSQL driver
- Testcontainers
- Spring AMQP
- Spring Data Redis
- springdoc-openapi

Optional but recommended:

- Spring Modulith
- jOOQ

**Step 2: Define the package layout**

Create this structure:

- `com.mihas.common`
- `com.mihas.auth`
- `com.mihas.users`
- `com.mihas.catalog`
- `com.mihas.applications`
- `com.mihas.documents`
- `com.mihas.payments`
- `com.mihas.notifications`
- `com.mihas.sessions`
- `com.mihas.audit`
- `com.mihas.jobs`

**Step 3: Add the first health endpoint**

Implement:

- `/api/health?action=ping`
- standard JSON envelope
- Neon connectivity check disabled in `ping`, enabled in deeper health checks

**Step 4: Verify the app runs**

Run:

```bash
cd backend-spring
./mvnw spring-boot:run
curl -i http://127.0.0.1:8080/api/health?action=ping
```

Expected:

- app starts
- endpoint returns `200`
- response matches the contract doc

**Step 5: Commit**

```bash
git add backend-spring
git commit -m "chore: bootstrap spring backend"
```

### Task 5: Build the local container platform first

**Files:**
- Create: `deploy/local/docker-compose.yml`
- Create: `deploy/local/.env.example`
- Create: `deploy/local/caddy/Caddyfile`
- Create: `deploy/local/prometheus/prometheus.yml`
- Create: `deploy/local/grafana/provisioning/`

**Step 1: Define the local services**

Start these containers locally:

- `mihas-api`
- `mihas-worker`
- `redis`
- `rabbitmq`
- `mailpit`
- `caddy`
- `prometheus`
- `grafana`
- `loki`
- `promtail`

**Step 2: Wire only one public route first**

Expose:

- `https://api.local.mihas.test` -> `mihas-api`
- `https://monitor.local.mihas.test` -> `grafana`

**Step 3: Verify the local platform**

Run:

```bash
docker compose -f deploy/local/docker-compose.yml up -d
docker compose -f deploy/local/docker-compose.yml ps
```

Expected:

- all containers are healthy
- API responds through Caddy
- Grafana opens
- RabbitMQ management UI opens

**Step 4: Commit**

```bash
git add deploy/local
git commit -m "chore: add local self-hosted platform compose stack"
```

### Task 6: Port the foundation before domain features

**Files:**
- Modify: `backend-spring/src/main/resources/application*.yml`
- Create: `backend-spring/src/main/java/com/mihas/common/api/`
- Create: `backend-spring/src/main/java/com/mihas/auth/`
- Create: `backend-spring/src/main/java/com/mihas/audit/`
- Create: `backend-spring/src/main/java/com/mihas/infrastructure/storage/`
- Create: `backend-spring/src/main/java/com/mihas/infrastructure/email/`

**Step 1: Implement config and environment loading**

Support:

- local
- staging
- production

Define secrets for:

- Neon
- Redis
- RabbitMQ
- R2
- Resend
- JWT
- CORS origins

**Step 2: Implement platform concerns**

Add:

- standard API response envelope
- exception mapping
- request correlation ID
- structured JSON logging
- JWT access token flow
- refresh token persistence
- role checks
- CSRF for state-changing cookie-authenticated requests
- audit log service

**Step 3: Add integration adapters**

Add:

- Neon pooled connection config
- R2 adapter
- Resend adapter
- Redis cache adapter
- RabbitMQ publishers and consumers

**Step 4: Commit**

```bash
git add backend-spring
git commit -m "feat: add spring platform foundation"
```

### Task 7: Port low-risk domains first

**Files:**
- Create: `backend-spring/src/main/java/com/mihas/catalog/`
- Create: `backend-spring/src/main/java/com/mihas/sessions/`
- Create: `backend-spring/src/main/java/com/mihas/notifications/preferences/`
- Test: `backend-spring/src/test/java/com/mihas/catalog/`

**Step 1: Port read-mostly endpoints**

Port in this order:

1. `health`
2. `catalog`
3. session listing and revoke
4. notification preference reads

**Step 2: Point the frontend dev environment to Spring**

Create local env mapping so the Vite frontend hits the new backend in development.

**Step 3: Run smoke tests**

Verify:

- sign-in page loads
- catalog populates
- session management works

**Step 4: Commit**

```bash
git add backend-spring
git commit -m "feat: port low-risk spring endpoints"
```

### Task 8: Port critical admissions workflows

**Files:**
- Create: `backend-spring/src/main/java/com/mihas/applications/`
- Create: `backend-spring/src/main/java/com/mihas/documents/`
- Create: `backend-spring/src/main/java/com/mihas/payments/`
- Create: `backend-spring/src/main/java/com/mihas/admin/`
- Create: `backend-spring/src/main/java/com/mihas/notifications/`

**Step 1: Port authentication**

Include:

- login
- logout
- refresh
- password reset
- profile
- role resolution

**Step 2: Port applications and admin review**

Include:

- draft save
- submit
- status transitions
- admin decision flows
- audit trail

**Step 3: Port documents and payments**

Include:

- upload strategy
- signed URL or proxy download strategy
- receipt generation
- payment verification hooks

**Step 4: Move slow tasks to the worker**

Move:

- OCR
- email sending
- report generation
- cleanup jobs

**Step 5: Commit**

```bash
git add backend-spring
git commit -m "feat: port critical admissions workflows"
```

### Task 9: Prepare the AWS Ubuntu host the right way

**Files:**
- Create: `docs/runbooks/aws-ubuntu-bootstrap.md`
- Create: `deploy/prod/docker-compose.yml`
- Create: `deploy/prod/.env.example`
- Create: `deploy/prod/caddy/Caddyfile`

**Step 1: Rebuild the server baseline**

On the server:

- create a non-root deploy user
- disable password SSH auth
- configure UFW
- install Docker Engine and Compose plugin
- create persistent volumes under `/srv/mihas/`
- enable automatic security updates

**Step 2: Create the production directory layout**

Use:

- `/srv/mihas/compose`
- `/srv/mihas/data/caddy`
- `/srv/mihas/data/grafana`
- `/srv/mihas/data/prometheus`
- `/srv/mihas/data/loki`
- `/srv/mihas/backups`
- `/srv/mihas/env`

**Step 3: Verify the box before deployment**

Run:

```bash
docker version
docker compose version
ufw status
df -h
free -h
```

Expected:

- Docker healthy
- disk and memory acceptable
- firewall active

**Step 4: Commit**

```bash
git add docs/runbooks/aws-ubuntu-bootstrap.md deploy/prod
git commit -m "docs: add aws ubuntu bootstrap and prod compose"
```

### Task 10: Deploy with images, not by copying source code manually

**Files:**
- Create: `backend-spring/Dockerfile`
- Create: `.github/workflows/backend-image.yml`
- Create: `docs/runbooks/deployment.md`

**Step 1: Build a production image**

Use:

- multi-stage Docker build
- non-root runtime user
- healthcheck
- separate `api` and `worker` entrypoints

**Step 2: Push images to a registry**

Preferred:

- GitHub Container Registry

Tags:

- `main`
- git SHA
- release tag

**Step 3: Deploy from the server**

On the server:

```bash
docker compose -f /srv/mihas/compose/docker-compose.yml pull
docker compose -f /srv/mihas/compose/docker-compose.yml up -d
docker compose -f /srv/mihas/compose/docker-compose.yml ps
```

Expected:

- new images pulled
- containers recreated
- zero manual JAR copying

**Step 4: Commit**

```bash
git add backend-spring/Dockerfile .github/workflows/backend-image.yml docs/runbooks/deployment.md
git commit -m "chore: add image build and deploy workflow"
```

### Task 11: Add observability before real traffic

**Files:**
- Modify: `deploy/local/docker-compose.yml`
- Modify: `deploy/prod/docker-compose.yml`
- Create: `docs/runbooks/monitoring.md`

**Step 1: Expose the right signals**

Add:

- Actuator health
- Actuator metrics
- JVM metrics
- request latency metrics
- RabbitMQ and Redis metrics if practical

**Step 2: Add dashboards and alerts**

Monitor:

- API latency
- 4xx/5xx rate
- queue depth
- JVM heap
- container restarts
- disk usage
- Neon connection usage

**Step 3: Verify logging**

Confirm:

- request logs reach Loki
- app exceptions are searchable
- worker failures are visible

**Step 4: Commit**

```bash
git add deploy/local deploy/prod docs/runbooks/monitoring.md
git commit -m "chore: add monitoring and logging stack"
```

### Task 12: Harden the platform and prepare for growth

**Files:**
- Create: `docs/runbooks/backup-and-restore.md`
- Create: `docs/runbooks/incident-checklist.md`
- Create: `docs/runbooks/scaling-path.md`

**Step 1: Define backup responsibilities**

Document:

- Neon backups and restore path
- RabbitMQ durable queue policy
- Redis data persistence choice
- Grafana/Loki retention
- Caddy config backup

**Step 2: Define the first scaling path**

When load grows, move in this order:

1. move `rabbitmq` and `redis` to dedicated managed services or dedicated hosts
2. move `worker` to a second VM
3. move observability off the main app host
4. only then evaluate Kubernetes

**Step 3: Define cutover and rollback**

Document:

- how to switch the frontend API base URL
- how to validate auth flows
- how to roll back to the previous backend

**Step 4: Commit**

```bash
git add docs/runbooks/backup-and-restore.md docs/runbooks/incident-checklist.md docs/runbooks/scaling-path.md
git commit -m "docs: add hardening, backup, and scaling runbooks"
```

---

## Step-By-Step Order You Should Personally Follow

1. Confirm whether your AWS server is `24.04 LTS`, `25.10`, or unsupported `25.04`.
2. If it is `25.04`, rebuild on `24.04 LTS`.
3. Set up Java 21, Maven, Docker, and Compose locally.
4. Prefer running an Ubuntu `24.04` VM locally on Linux Mint for parity.
5. Freeze the current API contract from `api-src/`.
6. Bootstrap `backend-spring/` and get the health endpoint running.
7. Build the local Compose stack with `api`, `worker`, `redis`, `rabbitmq`, and `caddy`.
8. Point the frontend locally to the Spring backend and port low-risk endpoints first.
9. Port auth, applications, documents, payments, and admin flows.
10. Prepare the AWS Ubuntu host with Docker, firewalling, persistent volumes, and secrets.
11. Build container images and deploy from a registry, not by copying random build folders.
12. Add monitoring, backups, and rollback before real users hit the system.

## Recommended Version 1 Scope

Ship this first:

- Spring API
- Spring worker
- Redis
- RabbitMQ
- Caddy
- Prometheus
- Grafana
- Loki

Wait until later for:

- Kubernetes
- service mesh
- microservices
- Keycloak
- Elasticsearch
- event streaming platforms like Kafka

## External Source Notes

- Docker lists Ubuntu `25.10`, `24.04 LTS`, and `22.04 LTS` as supported targets and says Linux Mint is not officially supported: https://docs.docker.com/engine/install/ubuntu/
- Ubuntu says interim releases are supported for `9 months`, so `24.04 LTS` is the safer production target than Ubuntu `25.x`: https://ubuntu.com/about/release-cycle
- Spring Boot current stable line includes `4.0.3`, and the system requirements page also lists `3.5.11` as stable: https://docs.spring.io/spring-boot/system-requirements.html
- Spring Modulith is intended for well-structured Spring Boot modular applications: https://spring.io/projects/spring-modulith/
- Neon recommends pooled connection strings by adding `-pooler` to the hostname: https://neon.com/docs/connect/connection-pooling

Plan complete and saved to `docs/plans/2026-03-11-self-hosted-spring-boot-platform-plan.md`.
