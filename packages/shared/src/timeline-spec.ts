import { z } from "zod";

const clipSchema = z
  .object({
    assetId: z.string().min(1).max(64).regex(/^[a-zA-Z0-9_-]+$/),
    trimStart: z.number().min(0).max(600).optional(),
    trimEnd: z.number().min(0).max(600).optional(),
  })
  .strict()
  .refine((c) => c.trimEnd == null || c.trimStart == null || c.trimEnd > c.trimStart, {
    message: "trimEnd must be greater than trimStart",
  });

export const timelineSchema = z
  .object({
    clips: z.array(clipSchema).min(1).max(8),
    overlay: z
      .union([
        z.literal(false),
        z
          .object({
            x: z.number().int().min(0).max(4096).default(24),
            y: z.number().int().min(0).max(4096).default(24),
            start: z.number().min(0).max(600).optional(),
            duration: z.number().min(0).max(600).optional(),
          })
          .strict(),
      ])
      .default(false),
    mute: z.boolean().default(false),
  })
  .strict();

export type Timeline = z.infer<typeof timelineSchema>;

export function parseTimeline(input: unknown): Timeline {
  return timelineSchema.parse(input);
}
