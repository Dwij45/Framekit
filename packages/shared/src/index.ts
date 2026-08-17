export const JOB_STATUSES = [
  "queued",
  "probing",
  "encoding",
  "packaging",
  "ready",
  "failed",
  "canceled",
] as const;

export type JobStatus = (typeof JOB_STATUSES)[number];
