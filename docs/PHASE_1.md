# Phase 1 — ingest, split into parts

Phase 1 in `COMPLETE_GUIDE.md` is the whole Mux-like core. We are **not**
building it in one sitting. Each part has a “done when” before the next starts.

| Part | Ships | Done when |
| --- | --- | --- |
| **1A** | Asset + Job in Postgres. Browser uploads **directly to MinIO**. Worker runs **ffprobe only**. Dashboard shows duration/size. | You can upload a short clip, see a job go queued → probing → ready, and read width/height/duration. **No transcode.** |
| **1B** | One **720p MP4** encode + playable URL | The probed file becomes a playable 720p MP4 in the browser. |
| **1C** | 360/720/1080 ladder + **HLS** + `hls.js` | Network tab shows a playlist and segments. |
| **1D** | Live percent, poster JPEG, failed jobs + retry | Demo: progress ticks, then a bad `.txt` renamed to `.mp4` fails cleanly. |

**Why we later bundled 1B–1D:** encoding without HLS still needs a player; HLS without progress looks hung; retry without failure handling is untestable. They share one worker pipeline.

**1A does not run FFmpeg encode.** It uses `ffprobe-static`. 1B–1D add `ffmpeg-static`, renditions, the playback proxy, and retry.

**Status (2026-08-17):** 1B–1D **code is in and smoke-tested on native infra** (`npm run infra:local`). Docker Compose is parked until the PC can handle it; switch back with `npm run infra:up` and `DATABASE_URL` port 5433.
