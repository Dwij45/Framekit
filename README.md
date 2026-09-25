# Framekit

**Framekit** is a programmable video API with a dashboard for developers who need upload → encode → HLS playback (and edit jobs) without running FFmpeg in the web process.

## Overview

1. A signed-in user or `Authorization: Bearer fk_test_…` caller asks Next.js for a **presigned PUT**.
2. The browser (or client) uploads bytes **directly to object storage** (MinIO locally, R2 intended in production).
3. `POST …/uploads/:assetId/complete` creates a Job, enqueues **BullMQ**, and returns `{ jobId, assetId }` immediately.
4. The **worker** probes, transcodes a ladder (never upscales), packages HLS, then optional sprites/captions; status moves `queued → probing → encoding → packaging → ready|failed`.
5. Clients poll `GET /api/v1/jobs/:jobId` and play via `/api/v1/playback/…` (signed paths through the API).

**It is not** a public multi-tenant SaaS yet (no production deploy — see Step 12 in the complete guide), not CapCut/Zoom/YouTube Live, and **not** “encode inside Next.js.” Postgres holds metadata only; video bytes never go in the DB.

## Quick start (Windows / PowerShell)

**Prerequisites:** Node ≥ 20, npm workspaces. Prefer Docker Compose when stable (`npm run infra:up`, Postgres on **5433**). If Docker Desktop hangs this machine, use native infra: PostgreSQL **18** binaries at `C:\Program Files\PostgreSQL\18\bin` (host **5432** is left alone; Framekit uses **5434**).

```powershell
cd "D:\OneDrive\projects\parking assistance"
npm install
Copy-Item .env.example .env
# Same values into apps/web/.env.local and packages/db/.env
# Set NEXTAUTH_SECRET and AUTH_SECRET to long random strings (see docs/BUILD_LOG.md)

npm run infra:local          # Postgres 5434 + Redis + MinIO + migrate + demo seed
npm run dev                  # Next.js (default http://localhost:3000)
npm run dev:worker           # FFmpeg worker (separate terminal)
```

**Smoke check** (infra + web up):

```powershell
Invoke-RestMethod http://localhost:3000/api/health
```

Success looks like `{ ok: true, db: true, redis: true, storage: true }` (HTTP 200). HTTP 503 means at least one dependency is down.

**Dashboard:** open http://localhost:3000 — after `infra:local`, sign in with `demo@framekit.dev` / `password123`. In-app guide: **Guide** (`/docs`).

Stop native infra: `npm run infra:local:stop`. Compose: `npm run infra:up` / `infra:down` (set `DATABASE_URL` port **5433**).

## Configuration

Template: [`.env.example`](.env.example). **Never commit** real `.env` / `.env.local`.

| Variable | Default / example | Secret? | Notes |
| --- | --- | --- | --- |
| `DATABASE_URL` | `postgresql://framekit:framekit@127.0.0.1:5434/framekit` | yes | Native local = **5434**; Compose = **5433** |
| `REDIS_URL` | `redis://localhost:6379` | yes in prod | BullMQ + health |
| `S3_ENDPOINT` | `http://localhost:9000` | — | MinIO locally |
| `S3_REGION` | `us-east-1` | — | |
| `S3_BUCKET` | `framekit` | — | |
| `S3_ACCESS_KEY` / `S3_SECRET_KEY` | `framekit` / `framekitsecret` | yes | MinIO root user locally |
| `S3_FORCE_PATH_STYLE` | `true` | — | Required for MinIO |
| `NEXTAUTH_URL` | `http://localhost:3000` | — | Auth.js base URL |
| `NEXTAUTH_SECRET` / `AUTH_SECRET` | (empty in example) | **yes** | Session signing |
| `FFMPEG_PATH` | `ffmpeg` | — | Placeholder; worker uses `ffmpeg-static` when this is `ffmpeg` |
| `PROBE_MAX_DURATION_SEC` | `600` | — | Reject longer sources |
| `PROBE_MAX_BYTES` | `524288000` (~500 MB) | — | Upload + probe size cap |
| `USAGE_CAP_MINUTES` | `120` | — | Monthly encoded-minute cap; `≤0` disables |
| `FRAMEKIT_LIVE` | unset | — | Set `1` to mint `fk_live_…` keys instead of `fk_test_…` |

Who reads what: root `.env` → worker; `apps/web/.env.local` → Next (does **not** load root `.env`); `packages/db/.env` → Prisma CLI.

## How to use

**Auth:** dashboard session cookie, or `Authorization: Bearer fk_test_…` (create keys under `/api-keys`; plaintext shown once).

**Ingest sketch:**

```
POST /api/v1/uploads          → { assetId, uploadUrl, objectKey }
PUT  uploadUrl                → bytes to storage
POST /api/v1/uploads/:assetId/complete   → { jobId, assetId, replayed }
GET  /api/v1/jobs/:jobId      → status, progress, playback URLs
```

Job-creating POSTs accept `Idempotency-Key` (same key + same body → same job).

Example poll (PowerShell; paste a real key and job id):

```powershell
$headers = @{ Authorization = "Bearer fk_test_…" }
Invoke-RestMethod -Headers $headers http://localhost:3000/api/v1/jobs/<jobId>
```

Interesting fields when ready: `status`, `progressPct`, `progressStage`, `assetId`, `playback.hls`, `playback.mp4`, `playback.captions`, `canRetry`.

Other routes (same auth): `POST /api/v1/assets/:id/transforms`, `POST /api/v1/renders` (timeline), `POST /api/v1/assets/:id/captions`, `DELETE /api/v1/assets/:id`, webhooks + usage under `/api/v1/…`.

## Architecture

| Path | Why it exists |
| --- | --- |
| `apps/web` | Control plane: Auth.js, dashboard, `app/api/v1/**` Route Handlers. No FFmpeg. |
| `apps/worker` | Work plane: BullMQ consumers; `spawn(ffmpeg, argv)` for probe/encode/HLS/transforms/compose/sprites/captions; webhook delivery. |
| `packages/db` | Prisma schema + client (users, assets, jobs, keys, webhooks, usage). |
| `packages/shared` | Zod specs + FFmpeg argv compilers + API-key/webhook helpers (unit-tested). |
| `packages/storage` | Presign / get / put / delete against S3-compatible storage. |
| `infra/docker-compose.yml` | Postgres, Redis, MinIO. |
| `infra/local/` | Native Windows stand-in (`start.ps1`, seed, bucket). |

## Limits and threat model

**Who may call it:** account owners via session or their own API keys. Queries are scoped by `userId` (no cross-tenant asset access by id alone).

**Isolation:** encoding runs in a separate Node process; clients never send raw FFmpeg commands — only JSON specs compiled to argv arrays. Webhook URLs are checked against private/link-local targets (loopback HTTP allowed only when `NODE_ENV !== "production"`). Keys are stored hashed; webhook bodies are HMAC-signed (`X-Framekit-Signature`).

**Defaults that bound abuse:** ~500 MB / 10 min sources (`PROBE_*`), monthly encoded-minute cap (`USAGE_CAP_MINUTES`, default 120), ≤5 active API keys per user, ladder never upscales.

**What this does not protect against (today):** it is a **local / single-operator** app until public deploy; there is **no** implemented HTTP rate limiter in the web app; secrets in `.env` are only as safe as the host; a compromised API key can use that user’s quota. Production hardening (managed DB/Redis/R2, private buckets, non-root worker containers) is **not implemented** — see Step 12 in the complete guide.

## Verify

```powershell
npm run test:shared    # Zod compilers / platform helpers
npm run build          # Next.js production build
npm run lint -w web    # ESLint in apps/web
```

Worker smoke scripts under `apps/worker/scripts/` exist for phased checks; they are not wired as a root npm script.
