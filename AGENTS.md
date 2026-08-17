# Agent instructions — Framekit

Read `docs/COMPLETE_GUIDE.md` before writing code. That file is the source of truth for architecture, features, and build order.

After each phase, append the real commands (including failures) to `docs/BUILD_LOG.md`.
Phase 1 is split in `docs/PHASE_1.md`. Phase 2 is `docs/PHASE_2.md`.

## Stack

- **Next.js 15 App Router** (`apps/web`) — UI + HTTP API only
- **PostgreSQL + Prisma** (`packages/db`) — metadata, never video bytes
- **Redis + BullMQ** — job queue
- **Node worker + FFmpeg** (`apps/worker`) — all encoding
- **MinIO** locally, **Cloudflare R2** in production — files
- **npm workspaces**
- Runtime is **Docker Compose** when it is stable. If Docker Desktop hangs Windows, use native processes: `npm run infra:local` (Postgres **5434**, Redis 6379, MinIO 9000). Switch back with `npm run infra:up` and `DATABASE_URL` port **5433**.
- Windows already has a Postgres service on **5432** — do not use that port. Do not install FFmpeg; the worker uses `ffmpeg-static`.

## Hard rules

- Do **not** run FFmpeg, ffprobe, or any encode in Route Handlers, Server Actions, or middleware.
- Do **not** `exec` / shell-concat user input. Always `spawn("ffmpeg", argvArray)`.
- Do **not** put MP4/HLS bytes in Postgres.
- Do **not** skip phases: health → presign upload → probe → one 720p MP4 → HLS → transforms → timeline.
- Do **not** add Mux/Cloudinary as the encoder.

## Runtime

**Preferred:** Docker Desktop + `npm run infra:up` (Compose file stays; we will use it again).

**If Docker hangs the PC:** do **not** start Docker. From repo root: `npm run infra:local`. That starts a private Postgres cluster on **5434** (using the already-installed PostgreSQL binaries; the 5432 service is untouched), portable Redis, and portable MinIO. Data is under `%LOCALAPPDATA%\framekit`, not OneDrive.

Do **not** install FFmpeg on Windows. Do **not** encode in Next.js. Do **not** put video bytes in Postgres.
