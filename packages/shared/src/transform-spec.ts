import { z } from "zod";

export const QUALITY_CRF = {
  high: 18,
  default: 23,
  small: 28,
} as const;

export const transformSpecSchema = z
  .object({
    quality: z.enum(["high", "default", "small"]).default("default"),
    aspect: z.enum(["16:9", "9:16", "1:1"]).optional(),
    fit: z
      .object({
        width: z.number().int().min(2).max(3840),
        height: z.number().int().min(2).max(2160),
      })
      .optional(),
    speed: z.number().min(0.5).max(2).default(1),
    mute: z.boolean().default(false),
    watermark: z
      .union([
        z.literal(false),
        z.object({
          x: z.number().int().min(0).max(4096).default(24),
          y: z.number().int().min(0).max(4096).default(24),
        }),
      ])
      .default(false),
  })
  .strict();

export type TransformSpec = z.infer<typeof transformSpecSchema>;

export function parseTransformSpec(input: unknown): TransformSpec {
  return transformSpecSchema.parse(input);
}
