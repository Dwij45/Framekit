# Phase 2 — transforms

A transform is a **new job** on a **ready** asset. The worker builds **one**
FFmpeg argv from a Zod spec. Next.js never encodes.

| Ships | Done when |
| --- | --- |
| `POST /api/v1/assets/:id/transforms` | Same source becomes a 9:16 mute clip with a PNG logo, as a **new** asset you can play. |

Knobs: quality (CRF), aspect (16:9 / 9:16 / 1:1), speed 0.5–2, mute, logo overlay.
