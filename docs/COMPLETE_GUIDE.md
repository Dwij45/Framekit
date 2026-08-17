# Framekit — complete build guide

A production-shaped **video processing platform**: upload a video, queue a job, encode in the cloud, play HLS, then (later) batch-edit with a JSON timeline.

This document is the source of truth. If the agent and this guide disagree, **this guide wins**.

**What we actually ran** (commands, failures, ports): [`docs/BUILD_LOG.md`](./BUILD_LOG.md). Append that file every phase.

Phase 1 is split: [`docs/PHASE_1.md`](./PHASE_1.md) (1A probe → 1B 720p → 1C HLS → 1D polish).

---

## 0. Can we use Next.js and PostgreSQL?

**Yes.** That is the stack.


| You asked                                | Decision                                                     | Why                                                                                                             |
| ---------------------------------------- | ------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------- |
| Next.js instead of plain React + Express | **Yes.** Next.js App Router = React UI + HTTP API in one app | You still write React. Route Handlers replace Express routers. One deployable web app.                          |
| PostgreSQL instead of MongoDB            | **Yes.** Prisma + Postgres                                   | Jobs, assets, renditions, webhooks, and API keys are **relational**. SQL fits; Mongo was only for MERN comfort. |
| FastAPI / Python                         | **No**                                                       | Extra language, same FFmpeg. Stay on Node.                                                                      |
| FFmpeg inside a Next.js route            | **Never**                                                    | Routes must finish in seconds. Encoding takes minutes. That is a **worker**.                                    |


**What:** Next.js is the website + public API.  
**Why:** portfolio has a real UI *and* `curl`-able API; you already know React.  
**Where:** `apps/web`. The worker is `apps/worker` — a plain Node process, not a Next route.

---

## 1. What you are building (product)

**Framekit** is a small Mux + Shotstack: a **programmable video API** with a dashboard.

A user (or their code) can:

1. Upload a video (browser never sends the file through Next.js).
2. Get a **job id** immediately (`202`-style: “working on it”).
3. Watch status: `queued → probing → encoding → packaging → ready` (or `failed`).
4. Play an **HLS** stream (quality switches 360p / 720p / 1080p).
5. Download an MP4.
6. Run **transforms** on that asset (resize, quality, speed, mute, 9:16 crop, watermark).
7. (Phase 3) Submit a **timeline JSON** (cuts, concat, overlays) and get one rendered file.
8. Receive a **webhook** when a job finishes.
9. Use **API keys** (`fk_live_…`) so it looks like a real developer platform.

It is **not**: CapCut, Zoom, YouTube live, or “FFmpeg in the browser.”

---

## 2. Feature catalog (what exists, what it does)

Ship in phases. Do not skip ahead. A live 720p encode on a public URL beats twenty unfinished filters.

### 2.1 Phase 0 — Skeleton (week 1)


| Feature                             | What it does                                                     | Why it exists                                                   |
| ----------------------------------- | ---------------------------------------------------------------- | --------------------------------------------------------------- |
| Monorepo + Docker Compose           | One command starts Postgres, Redis, MinIO (fake S3), web, worker | Agent and you run the **same** stack. No “works on my machine.” |
| Health checks                       | `GET /api/health` → db + redis + storage                         | Proves wiring before any video.                                 |
| Auth (email/password or magic link) | Dashboard users                                                  | You need an owner for assets and API keys.                      |
| Empty dashboard shell               | Nav: Assets, Jobs, API keys, Docs                                | UI exists so every later feature has a home.                    |


### 2.2 Phase 1 — Ingest + transcode (the core)

This phase **is** the product. Everything else hangs off it.


| Feature              | What it does                                                                                                  | User-visible result                                                                              |
| -------------------- | ------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| **Presigned upload** | Next.js returns a short-lived PUT URL to object storage. Browser uploads the file **directly**.               | Progress bar is upload, not encode. A 2 GB file never enters Node.                               |
| **Complete upload**  | Client tells API “the object is there.” API creates `Asset` + `Job`, enqueues worker.                         | Job appears in the list as `queued`.                                                             |
| **Probe**            | Worker runs **ffprobe**: duration, width, height, codec, fps, rotation, size.                                 | Reject too-long / too-big / corrupt files **before** burning CPU. Store probe JSON on the asset. |
| **Limits**           | e.g. max 500 MB, max 10 minutes, max 4K on free tier                                                          | Stops one upload from melting your laptop/cloud bill.                                            |
| **Transcode ladder** | FFmpeg produces 360p, 720p, 1080p **only if the source is that tall or taller**. Never upscale 480p to 1080p. | Phones on 4G can play 360p; desktops get 1080p.                                                  |
| **MP4 download**     | One H.264 + AAC file with `+faststart` (moov atom at start).                                                  | “Download” button; file plays before it fully downloads.                                         |
| **HLS package**      | Split into short segments + `master.m3u8` listing all rungs.                                                  | Player switches quality automatically.                                                           |
| **Poster**           | JPEG around t=1s (or first decoded frame).                                                                    | Grid thumbnails in the dashboard.                                                                |
| **Sprite + VTT**     | Sheet of tiny frames + timestamp file.                                                                        | Hover-scrub on the seek bar (YouTube-like). Optional in 1.1; can wait until player is nice.      |
| **Job progress**     | Worker parses FFmpeg `time=` and writes percent to Redis; UI uses SSE or polling.                             | “Encoding 720p 41%” — this is the demo moment.                                                   |
| **Playback**         | `hls.js` in a client component, URL from CDN/MinIO.                                                           | Video plays. Network tab shows `.m3u8` / segments, not a giant blob from Next.                   |
| **Failure states**   | Probe fail, FFmpeg non-zero, timeout → `failed` + `error_code` + `error_message`. Retry button re-enqueues.   | You can explain retries in interviews.                                                           |


**Quality / compress / resize / speed in Phase 1 vs 2:**

- Phase 1 **always** resizes (ladder) and compresses (CRF 23, preset `medium` or `fast`).
- Phase 1 speed is `1.0x` only.
- Extra knobs (CRF 18/28, 1.25x speed, mute) are **Phase 2 transforms** so the first pipeline stays simple.

### 2.3 Phase 2 — Transform API (same asset, new job)

A **transform** is a new job that reads an existing asset (or its mezzanine MP4) and writes a new asset.


| Operation                                                   | What FFmpeg does                          | Product meaning            |
| ----------------------------------------------------------- | ----------------------------------------- | -------------------------- |
| `quality: high                                              | default                                   | small`                     |
| `fit: 1920x1080` etc.                                       | `scale` + pad, even dimensions, `yuv420p` | Resize without stretching. |
| `aspect: 16:9                                               | 9:16                                      | 1:1`                       |
| `speed: 0.5 … 2.0` (v1 max 2, later 4 via chained `atempo`) | `setpts` on video, `atempo` on audio      | Faster / slower playback.  |
| `mute: true`                                                | drop audio or silent AAC                  |                            |
| `extract_audio: mp3                                         | aac`                                      | `-vn`                      |
| `watermark`                                                 | `overlay` PNG at x,y                      | Logo on exports.           |


Each transform is **one FFmpeg command**, still on the worker.

### 2.4 Phase 3 — Composition / batch editing

Clients **never** send an FFmpeg command. They send **timeline JSON**. The worker **compiles** JSON → argument array → `spawn('ffmpeg', args)`.


| Operation          | What it does                                                                              |
| ------------------ | ----------------------------------------------------------------------------------------- |
| Trim / keep ranges | Keep 4.2s–18s of a clip (video + audio timestamps reset).                                 |
| Concat             | Intro + body + outro as one file.                                                         |
| Image overlay      | Logo / PNG for a time window.                                                             |
| Text               | Prefer a rendered PNG title; `drawtext` only with fonts **inside** the Docker image.      |
| Picture-in-picture | Small video on a corner.                                                                  |
| Audio mix          | Voice + background music with volumes.                                                    |
| **Batch**          | Parent job: “20 clips, same intro + watermark.” Fan-out 20 compose jobs. Progress `7/20`. |


Security: allow-list operations, numeric positions, **owned** asset IDs only. No shell strings.

### 2.5 Phase 4 — Platform polish (makes it “industry”)


| Feature              | What it does                                                                                      |
| -------------------- | ------------------------------------------------------------------------------------------------- |
| API keys             | `fk_test_` / `fk_live_` hashed in Postgres (store prefix + hash, show secret once).               |
| Idempotency-Key      | Same key + same body → same job, no double encode.                                                |
| Webhooks             | User registers `https://…`; we POST `job.completed` / `job.failed` with HMAC signature; retry 3×. |
| Usage meter          | Minutes encoded this month; cap free tier.                                                        |
| Signed playback URLs | Private bucket; links expire (e.g. 1 hour).                                                       |
| Audit log            | Who created which job (dashboard user vs API key).                                                |
| Admin-ish job replay | Re-queue from dashboard if worker died.                                                           |


### 2.6 Explicit non-goals (do not build)

- Collaborative timeline editor like Premiere.
- Live streaming / webcam.
- DRM, Dolby Vision, broadcast SCTE.
- Wrapping Mux/Cloudinary as the encoder (kills the learning project).
- Storing video bytes in Postgres or Mongo GridFS.
- Running FFmpeg in the browser (`ffmpeg.wasm`) as the pipeline.

---

## 3. Architecture

```
┌─────────────┐     presigned PUT      ┌──────────────────┐
│  Browser    │ ─────────────────────► │ Object storage   │
│  Next.js UI │                        │ MinIO local /    │
└──────┬──────┘                        │ Cloudflare R2    │
       │ REST (JSON only)              └────────▲─────────┘
       ▼                                        │ download / upload
┌─────────────┐     INSERT job           ┌──────┴───────┐
│ Next.js     │ ───────────────────────► │ PostgreSQL   │
│ Route       │     enqueue              └──────────────┘
│ Handlers    │ ──► Redis / BullMQ ───► ┌──────────────┐
└─────────────┘                         │ Worker Node  │
       ▲          SSE / GET status      │ + FFmpeg     │
       └────────────────────────────────└──────┬───────┘
                                               │ writes outputs
                                               ▼
                                        Object storage
                                               │
                                               ▼
                                        CDN (prod) / MinIO (dev)
                                               │
                                               ▼
                                        hls.js player
```

### 3.1 Four planes (memorize this)

1. **Control plane** — Next.js. Auth, create jobs, read status. Milliseconds. No FFmpeg.
2. **Data plane** — Object storage. The actual video files.
3. **Work plane** — Worker + FFmpeg + Redis queue. Minutes. CPU-heavy.
4. **Delivery plane** — HLS + CDN. Viewers. Next.js is **not** in this path.

If a feature mixes these (e.g. “upload through the Route Handler and encode there”), it is wrong.

### 3.2 Why this is “industry level” at student traffic

YouTube is this diagram with more machines. You scale by:

- more Next.js instances if the **website** is busy (rare at first);
- more **workers** if the **queue** is deep (the real knob);
- CDN if **watching** grows (Next.js should not stream files).

You do **not** scale by switching to FastAPI.

---

## 4. Tech stack — what, why, where


| Piece         | Pick                         | What it is                                                                                     | Why this, not the alternative                                                                                          | Where                                  |
| ------------- | ---------------------------- | ---------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- | -------------------------------------- |
| UI + HTTP API | **Next.js 15 App Router**    | React framework. Server Components by default. `app/api/**/route.ts` = Express-like endpoints. | One app for dashboard + public API. You already know React. Express is extra process with no benefit once Next exists. | `apps/web`                             |
| Worker        | **Node 20 + TypeScript**     | Second process, same language                                                                  | Same types as the API. Python FastAPI would duplicate models.                                                          | `apps/worker`                          |
| ORM / DB      | **Prisma + PostgreSQL 16**   | SQL database + type-safe client                                                                | Jobs/assets/renditions are relations. Migrations are reviewable. Mongo would become nested soup.                       | `packages/db`                          |
| Queue         | **Redis 7 + BullMQ**         | Job list with retries, delays, locks                                                           | In-memory arrays die when the process restarts. Postgres `LISTEN` is possible later; BullMQ is the Node standard.      | Redis container; worker consumes       |
| FFmpeg        | **FFmpeg 7 in Docker**       | C program that encodes video                                                                   | There is no serious JS encoder. `fluent-ffmpeg` only builds argv.                                                      | Installed **in the worker image only** |
| Local S3      | **MinIO**                    | S3-compatible storage                                                                          | Worker/API use the S3 SDK. In prod you change env to R2. **Same code.**                                                | Docker                                 |
| Prod storage  | **Cloudflare R2**            | S3 API, cheap egress                                                                           | AWS S3+CloudFront egress is expensive.                                                                                 | Env vars                               |
| Player        | **hls.js**                   | JS HLS player                                                                                  | Native Safari HLS exists; hls.js covers Chrome.                                                                        | Client component in Next               |
| Auth          | **Auth.js (NextAuth) v5**    | Sessions for dashboard                                                                         | Free, self-hosted. Clerk is easier but is a vendor. Auth.js teaches cookies/JWT.                                       | `apps/web`                             |
| Validation    | **Zod**                      | Schema for env, timeline JSON, API bodies                                                      | Fail before FFmpeg. Single schemas shared API ↔ worker.                                                                | `packages/shared`                      |
| CSS           | **Tailwind + simple tokens** | Utility CSS                                                                                    | Fast dashboard, not a design-system thesis.                                                                            | `apps/web`                             |
| Monorepo      | **npm workspaces** (as built) | `apps/*` + `packages/*`                                                                        | Corepack could not install pnpm into Program Files. npm workspaces are the same idea.                                  | repo root                              |
| Containers    | **Docker Compose**           | Postgres, Redis, MinIO, worker, web                                                            | Agent can `docker compose up`. You do not install Postgres/FFmpeg on Windows by hand.                                  | `infra/docker-compose.yml`             |


### 4.1 Next.js specifics you must understand

- **Server Components** (default): run on the server, can read Postgres via Prisma. No `'use client'`. Use for job list pages.
- `'use client'`: only for upload widget, player, progress (hooks, browser APIs).
- **Route Handlers** (`app/api/v1/jobs/route.ts`): the public API. Use these for upload/job/transform. **Not** Server Actions for the public API — Actions are for form posts from your own UI; they are awkward for `curl` and API keys.
- **Server Actions**: OK for dashboard-only things (create API key form) if you prefer. Still no FFmpeg.
- **Secrets**: `NEXTAUTH_SECRET`, database URL, S3 keys — server only. Never `NEXT_PUBLIC_` for secrets.

### 4.2 Why the worker is not a Next.js “background job”

Next.js on Vercel **serverless** dies after a short timeout and has no FFmpeg binary. Even self-hosted Next should not block a request on encode. A **long-running Node process** (or Cloud Run Job) is the correct primitive.

Local: `docker compose` runs `apps/worker` forever, polling Redis.  
Prod: same image on Cloud Run Jobs / Fly Machines / a small VM.

---

## 5. Data model (PostgreSQL)

Prisma schema lives in `packages/db/prisma/schema.prisma`. Both web and worker import `@framekit/db`.

```
User
  id, email, passwordHash (or Auth.js account tables), createdAt

ApiKey
  id, userId, name, prefix (fk_live_abc), secretHash, createdAt, lastUsedAt, revokedAt

Asset
  id, userId, status (uploading|ready|failed)
  originalKey          -- s3 key of the raw upload
  contentType, byteSize, checksum
  probeJson            -- jsonb: duration, width, height, codec, fps, rotate
  createdAt

Job
  id, userId, assetId (nullable for compose-from-many)
  type (ingest_transcode | transform | compose | batch_parent)
  status (queued | probing | encoding | packaging | ready | failed | canceled)
  progressPct, progressStage   -- "720p", "hls"
  specJson             -- requested ladder, transform, or timeline
  errorCode, errorMessage
  idempotencyKey       -- unique per user
  parentJobId          -- batch fan-out
  attempt, maxAttempts
  createdAt, startedAt, finishedAt

Rendition
  id, assetId, jobId
  kind (mp4 | hls_playlist | hls_segment | poster | sprite | audio)
  label (360p | 720p | 1080p | master)
  storageKey, mime, width, height, durationMs, byteSize

WebhookEndpoint
  id, userId, url, secret, disabledAt

WebhookDelivery
  id, endpointId, jobId, event, payloadJson, statusCode, attempts, nextRetryAt

UsageMonth
  userId, yyyymm, encodedMs, uploadBytes   -- for caps
```

**What:** metadata only.  
**Why:** Postgres is excellent at status queries (`WHERE user_id = ? AND status = 'queued'`).  
**Where:** never put MP4 bytes in `bytea`. Bytes go to MinIO/R2 keys stored as strings.

---

## 6. Public API (what the platform looks like)

Base: `/api/v1`  
Auth: `Authorization: Bearer fk_live_…` **or** dashboard session cookie.


| Method | Path                          | Does                                                                                  |
| ------ | ----------------------------- | ------------------------------------------------------------------------------------- |
| `POST` | `/uploads`                    | Creates Asset `uploading`, returns `{ assetId, uploadUrl, headers }`                  |
| `POST` | `/uploads/:assetId/complete`  | Verifies object exists, creates Job `ingest_transcode`, enqueues, returns `{ jobId }` |
| `GET`  | `/jobs/:jobId`                | Status, progress, errors, output URLs when ready                                      |
| `GET`  | `/jobs`                       | List (paginated)                                                                      |
| `GET`  | `/assets/:assetId`            | Probe + renditions                                                                    |
| `POST` | `/assets/:assetId/transforms` | New transform job                                                                     |
| `POST` | `/renders`                    | Timeline JSON → compose job                                                           |
| `GET`  | `/playback/:assetId`          | Short-lived signed playlist URL                                                       |
| `POST` | `/webhooks`                   | Register endpoint                                                                     |
| `GET`  | `/usage`                      | Encoded minutes this month                                                            |


**Idempotency:** header `Idempotency-Key`. Unique index `(userId, idempotencyKey)` on Job.

**Webhooks:** `POST` user URL with body `{ event, job_id, asset_id, status }` and header `X-Framekit-Signature`.

---

## 7. Worker pipeline (step by step inside one ingest job)

1. BullMQ delivers `{ jobId }`.
2. Load Job from Postgres; if not `queued`, ack and skip (idempotent).
3. Set `probing`, run ffprobe on the object (stream to temp file or probe via downloaded file).
4. Validate limits → maybe `failed` / `PROBE_REJECTED`.
5. Set `encoding`. For each rung `360, 720, 1080` where `sourceHeight >= rung`: spawn FFmpeg (can run rungs in parallel with a concurrency cap of 2 on a laptop).
6. Upload each MP4 to `assets/{id}/mp4/{rung}.mp4`.
7. Set `packaging`. Generate HLS (or generate HLS in the same FFmpeg pass as a later optimization). Upload `master.m3u8` + segments.
8. Extract poster; upload `poster.jpg`.
9. Insert Rendition rows; set Asset `ready`; Job `ready`, `progressPct=100`.
10. Enqueue webhook delivery (small follow-up job).
11. Delete temp files. Ack BullMQ.

**Progress:** parse FFmpeg stderr `time=00:01:02` / duration → percent; write Redis `job:{id}:progress`; Next.js `GET /api/v1/jobs/:id/events` SSE reads Redis.

**Retries:** BullMQ `attempts: 3`. FFmpeg crash is retryable. `PROBE_REJECTED` is **not** retryable (set `removeOnFail` after marking failed).

**spawn, never shell:**

```ts
import { spawn } from "node:child_process";
// CORRECT
spawn("ffmpeg", ["-i", inputPath, "-c:v", "libx264", "...", outputPath], { stdio: ["ignore", "pipe", "pipe"] });
// FORBIDDEN
exec(`ffmpeg -i ${userFilename} ...`); // command injection
```

---

## 8. FFmpeg defaults (Phase 1)

You do not need to memorize flags. The worker encodes this policy:

- Video: `libx264`, `yuv420p`, even width/height, `-movflags +faststart` on MP4.
- Audio: AAC 128 kbps (or drop if source has no audio).
- Rate control: **CRF 23**, preset `fast` locally / `medium` in prod.
- FPS: constant frame rate (`-vsync cfr` / `-fps_mode cfr`) because phone video is often VFR and HLS hates VFR.
- Rotation: apply display-matrix (phone vertical video) so it is not sideways.
- Ladder (example):


| Label | Max height | Video bitrate cap (HLS) |
| ----- | ---------- | ----------------------- |
| 360p  | 360        | ~800 kbps               |
| 720p  | 720        | ~2500 kbps              |
| 1080p | 1080       | ~4500 kbps              |


Skip a row if source is smaller.

---

## 9. Repository layout

```
framekit/
  apps/
    web/                 Next.js App Router
      app/
        (dashboard)/     session-only pages
        (auth)/          login
        api/
          health/route.ts
          v1/            public API
          auth/[...nextauth]/route.ts
      components/        client widgets: Uploader, Player, JobProgress
    worker/
      src/
        index.ts         BullMQ workers
        jobs/ingest.ts
        jobs/transform.ts
        jobs/compose.ts
        ffmpeg/          argv builders (no string concat)
        s3.ts
  packages/
    db/                  Prisma schema + client
    shared/              Zod schemas, job types, error codes
  infra/
    docker-compose.yml   postgres, redis, minio, web, worker
    docker/web.Dockerfile
    docker/worker.Dockerfile   FROM node + ffmpeg
  docs/
    COMPLETE_GUIDE.md    this file
  .env.example
  pnpm-workspace.yaml
  package.json
```

---

## 10. Docker Compose (local “production shape”)

Services:


| Service      | Image / build                | Ports      | Role                     |
| ------------ | ---------------------------- | ---------- | ------------------------ |
| `postgres`   | `postgres:16`                | **5433→5432** | Host 5433: Windows already had `postgres.exe` on 5432. |
| `redis`      | `redis:7`                    | 6379       | BullMQ                   |
| `minio`      | `minio/minio`                | 9000, 9001 | S3 + console             |
| `minio-init` | mc client once               | —          | Create bucket `framekit` |
| `web`        | build `apps/web`             | 3000       | Next.js                  |
| `worker`     | build worker **with ffmpeg** | —          | Encodes                  |


- Web and worker share env:
  ```
  DATABASE_URL=postgresql://framekit:framekit@127.0.0.1:5433/framekit
  # Inside Compose, services still use postgres:5432. The host uses 5433.
  REDIS_URL=redis://redis:6379
  S3_ENDPOINT=http://minio:9000
  S3_REGION=us-east-1
  S3_BUCKET=framekit
  S3_ACCESS_KEY=...
  S3_SECRET_KEY=...
  S3_FORCE_PATH_STYLE=true
  ```

**Windows:** Docker Desktop + WSL2 is the intended runtime. If Docker Desktop hangs the host, run the same three processes natively: `npm run infra:local` (Postgres **5434** using the already-installed PostgreSQL binaries, portable Redis, portable MinIO). Do **not** install FFmpeg — the worker uses `ffmpeg-static`. Compose stays; switch back with `npm run infra:up` and `DATABASE_URL` port **5433**. Your existing Postgres on **5432** is never used.

---

## 11. Environment the **human** and the **Cursor agent** need

This is the “add Docker to the agent” question.

### 11.1 You must install (once)


| Tool                                                 | Why                                                                     | How the agent uses it                                                                                                               |
| ---------------------------------------------------- | ----------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| **Docker Desktop**                                   | Postgres, Redis, MinIO in Compose (preferred)                   | `npm run infra:up`. If Docker hangs Windows, **do not start it** — use `npm run infra:local` instead. |
| **Node.js 20 LTS**                                   | pnpm, Next, Prisma generate on the host if we run `web` outside compose | Agent runs `pnpm install`, `pnpm exec prisma migrate`                                                                               |
| **pnpm**                                             | Workspaces                                                              | `corepack enable` then `pnpm install`                                                                                               |
| **Git**                                              | Repo                                                                    | Commits only when you ask                                                                                                           |
| **Cursor** with **agent terminal + network** allowed | npm, Docker Hub pulls                                                   | If sandbox blocks Docker, you must approve those commands                                                                           |


You do **not** need: a local Postgres installer, a local Redis installer, a local FFmpeg installer, Python, FastAPI, MongoDB.

### 11.2 Cursor project extras (this repo)

Already intended to live in the repo (agent should keep them updated):


| Item                     | Purpose                                                     |
| ------------------------ | ----------------------------------------------------------- |
| `docs/COMPLETE_GUIDE.md` | This file — architecture + features + steps                 |
| `.cursor/rules/*.mdc`    | Short rules: no FFmpeg in Next, Prisma in packages/db, etc. |
| `AGENTS.md`              | One-page “how to work in this repo” for the agent           |
| `.env.example`           | Keys without secrets; never commit `.env`                   |


### 11.3 Optional MCP / connections (nice, not required)


| Add if you want               | What it gives the agent                            |
| ----------------------------- | -------------------------------------------------- |
| Docker running (required)     | Not an MCP — just Desktop in the system tray       |
| **PostgreSQL MCP** (optional) | Agent can `SELECT` jobs without `docker exec psql` |
| **GitHub MCP** (optional)     | PRs later                                          |
| Browser MCP (optional)        | Click the dashboard to verify upload               |


There is no special “FFmpeg MCP.” The worker container **is** FFmpeg.

### 11.4 What to tell the agent every time you start a session

> Follow `docs/COMPLETE_GUIDE.md`. Use Next.js + Postgres + a separate FFmpeg worker. Never encode in a Route Handler. Docker Compose is the runtime.

### 11.5 Permissions the agent will need from you

When it runs compose, pulls images, or binds ports 3000/5432/6379/9000, **approve**. Encoding a test clip can take minutes — do not kill the worker.

---

## 12. Step-by-step build (do in order)

Each step should end with something **runnable**. Do not write Phase 3 code in Phase 0.

### Step 0 — Repo and tools

1. Confirm Docker Desktop is running (whale icon).
2. `node -v` → 20+.
3. `corepack enable && corepack prepare pnpm@latest --activate`
4. Create pnpm workspace, `.gitignore` (`node_modules`, `.env`, `.next`, `dist`).
5. Copy `.env.example` → `.env`.

**Done when:** empty repo + compose file that starts **only** postgres, redis, minio, and `docker compose ps` is healthy.

### Step 1 — Database package

1. `packages/db` with Prisma.
2. Models: User (minimal), Asset, Job, Rendition (skip webhooks until Phase 4).
3. `prisma migrate dev --name init`
4. Export Prisma client for web + worker.

**Done when:** you can `psql` (or Prisma Studio) and see empty tables.

### Step 2 — Next.js app (no video yet)

1. `apps/web` Next.js App Router, TypeScript, Tailwind.
2. Auth.js credentials or GitHub OAuth (pick one; credentials is simpler to demo offline).
3. Pages: `/login`, `/` dashboard placeholder, `/jobs`.
4. `GET /api/health` — `SELECT 1` from Postgres, `PING` Redis.

**What:** Route Handler for health.  
**Why:** proves Next talks to Docker networks.  
**Where:** `app/api/health/route.ts`

**Done when:** browser opens `http://localhost:3000`, login works, health returns `{ db: true, redis: true }`.

### Step 3 — S3 helper and presigned PUT

1. `@aws-sdk/client-s3` + `@aws-sdk/s3-request-presigner` in a small module used by **web** (sign) and **worker** (get/put).
2. `POST /api/v1/uploads` (session or later API key): create Asset `uploading`, return presigned PUT.
3. React **client** Uploader: `fetch(uploadUrl, { method: 'PUT', body: file })` then `POST .../complete`.

**Done when:** you can upload a **tiny** `test.mp4` in MinIO console and see the object. Job not required yet.

### Step 4 — Worker hello-world

1. Worker Dockerfile: `node:20` + install ffmpeg (`apt` or `mwader/static-ffmpeg` copy).
2. BullMQ worker on queue `ingest`.
3. For now, job handler only: download object, run `ffprobe -print_format json`, save `probeJson`, mark job `ready` **without** encoding.

**Done when:** complete-upload creates a job, worker logs probe JSON, dashboard shows duration/width.

### Step 5 — Real transcode (one rung)

1. Encode **720p only** (or 360p if source is small).
2. Upload MP4 to MinIO.
3. Create Rendition row.
4. Dashboard: `<video src={signedUrl}>` (progressive MP4 is OK before HLS).

**Done when:** you upload a 10–20 second clip and can play the output. This is the first “it works” moment.

### Step 6 — Ladder + HLS + player

1. 360 / 720 / 1080 skip logic.
2. `master.m3u8` + segments.
3. Client component with `hls.js`.
4. Poster JPEG.

**Done when:** Chrome network tab shows playlist + segments; quality can change.

### Step 7 — Progress + failures

1. Parse FFmpeg time → Redis → poll or SSE.
2. Failed probe / FFmpeg → UI error.
3. Retry button.

**Done when:** you can demo a live percent, then a failed job (upload a `.txt` renamed to `.mp4`).

### Step 8 — Transforms (Phase 2)

1. `POST /transforms` with Zod spec.
2. Worker `transform` queue: one FFmpeg graph from spec (watermark, crop 9:16, speed, CRF).
3. New Asset + playback.

**Done when:** same source becomes a vertical mute clip with a PNG logo.

### Step 9 — Timeline compiler (Phase 3)

1. Zod timeline schema in `packages/shared`.
2. Compiler: JSON → `string[]` args (unit-test the compiler **without** FFmpeg).
3. Worker compose job.
4. Dashboard JSON playground.

**Done when:** intro clip + trim + logo renders one MP4. Tests catch injection (`filename` with `;`).

### Step 10 — API keys, idempotency, webhooks, usage (Phase 4)

1. Hash secrets (scrypt/argon2). Show key once.
2. Bearer auth on `/api/v1`.
3. Idempotency unique constraint.
4. Webhook signer + retry table.
5. Cap encoded minutes.

**Done when:** `curl` with `fk_test_` creates a job; [webhook.site](https://webhook.site) receives `job.completed`.

### Step 11 — Production deploy

1. Same Docker images.
2. Managed Postgres (Neon), Redis (Upstash), R2 bucket, worker on **Cloud Run Jobs** or Fly (not Vercel for the worker).
3. Next.js can go to Vercel **only if** it does not need FFmpeg — that is true if worker is separate. Vercel is fine for `apps/web`.
4. Private R2 + signed URLs. Custom domain.

**Done when:** a friend uploads from their phone on your public URL.

---

## 13. Security checklist (non-negotiable)

- FFmpeg argv arrays only; never `exec` / template strings with user input.
- Authz: every asset/job query includes `userId` (no IDOR).
- Presigned PUT: content-length cap; complete-upload **HEAD**s the object and checks size.
- Rate limit uploads per user.
- Private bucket; no public `*` ACL.
- Webhook URLs: HTTPS; signature; no SSRF to `169.254.169.254` / localhost (allow-list or block private IPs).
- Temp files on worker deleted in `finally`.
- Non-root user in worker container.

---

## 14. What “done” looks like for a portfolio

A 2-minute demo on a **public URL**:

1. Log in → drag a phone clip.
2. Job ticks probing → encoding 41% → packaging.
3. HLS player plays; DevTools shows segments from object storage/CDN.
4. Transform: 9:16 + watermark.
5. `curl` + API key; webhook.site fires.

README (short, not this file): architecture diagram, why worker ≠ Next, CRF/ladder, cost per minute of 1080p on your instance, how to retry.

---

## 15. What you will learn (mapped to this build)


| While doing…                           | You learn                                            |
| -------------------------------------- | ---------------------------------------------------- |
| Presigned upload                       | Why APIs must not proxy gigabytes                    |
| BullMQ + worker                        | Async jobs, retries, idempotency — classic interview |
| Prisma relations                       | SQL modeling for pipelines                           |
| Next.js RSC vs client vs Route Handler | Modern React jobs, not “just CRA”                    |
| FFmpeg in Docker                       | Containers, 12-factor config                         |
| HLS + hls.js                           | How streaming actually works                         |
| Timeline compiler                      | Compilers + security (injection)                     |
| Webhooks + API keys                    | Platform / Stripe-shaped products                    |
| Deploy worker off Vercel               | Real production constraints                          |


---

