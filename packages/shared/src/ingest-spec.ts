import { z } from "zod";

export const captionStyleSchema = z
  .object({
    font: z.enum(["sans", "serif", "mono"]).default("sans"),
    color: z.enum(["white", "yellow", "black"]).default("white"),
    background: z.enum(["none", "black", "white"]).default("black"),
  })
  .strict();

export type CaptionStyle = z.infer<typeof captionStyleSchema>;

export const DEFAULT_CAPTION_STYLE: CaptionStyle = {
  font: "sans",
  color: "white",
  background: "black",
};

export const ingestSpecSchema = z
  .object({
    maxHeight: z
      .union([z.literal(360), z.literal(720), z.literal(1080)])
      .default(1080),
    quality: z.enum(["high", "default", "small"]).default("default"),
    aspect: z.enum(["16:9", "9:16", "1:1"]).optional(),
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
    captions: z.boolean().default(true),
    captionStyle: captionStyleSchema.default(DEFAULT_CAPTION_STYLE),
  })
  .strict();

export type IngestSpec = z.infer<typeof ingestSpecSchema>;

export function parseIngestSpec(input: unknown): IngestSpec {
  const raw = input && typeof input === "object" ? input : {};
  return ingestSpecSchema.parse(raw);
}

export function parseCaptionStyle(input: unknown): CaptionStyle {
  const raw = input && typeof input === "object" ? input : {};
  return captionStyleSchema.parse(raw);
}
