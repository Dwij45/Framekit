export const SPRITE_TILE_W = 160;
export const SPRITE_TILE_H = 90;
export const SPRITE_COLS = 10;
export const SPRITE_MAX_TILES = 100;

export type SpritePlan = {
  interval: number;
  count: number;
  cols: number;
  rows: number;
  tileW: number;
  tileH: number;
};

export function spritePlan(durationSec: number): SpritePlan {
  const duration = Math.max(0.1, durationSec);
  const interval = duration <= 30 ? 1 : duration <= 120 ? 2 : 5;
  const count = Math.min(SPRITE_MAX_TILES, Math.max(1, Math.ceil(duration / interval)));
  const cols = Math.min(SPRITE_COLS, count);
  const rows = Math.ceil(count / cols);
  return { interval, count, cols, rows, tileW: SPRITE_TILE_W, tileH: SPRITE_TILE_H };
}

export function formatVttTimestamp(sec: number): string {
  const clamped = Math.max(0, sec);
  const hours = Math.floor(clamped / 3600);
  const minutes = Math.floor((clamped % 3600) / 60);
  const seconds = clamped % 60;
  const whole = Math.floor(seconds);
  const ms = Math.round((seconds - whole) * 1000);
  const pad = (n: number, w: number) => String(n).padStart(w, "0");
  return `${pad(hours, 2)}:${pad(minutes, 2)}:${pad(whole, 2)}.${pad(ms, 3)}`;
}

export function buildSpriteVtt(plan: SpritePlan): string {
  const lines = ["WEBVTT", ""];
  for (let i = 0; i < plan.count; i++) {
    const start = i * plan.interval;
    const end = (i + 1) * plan.interval;
    const col = i % plan.cols;
    const row = Math.floor(i / plan.cols);
    const x = col * plan.tileW;
    const y = row * plan.tileH;
    lines.push(`${formatVttTimestamp(start)} --> ${formatVttTimestamp(end)}`);
    lines.push(`sprite.jpg#xywh=${x},${y},${plan.tileW},${plan.tileH}`);
    lines.push("");
  }
  return lines.join("\n");
}

export type CaptionCue = { start: number; end: number; text: string };

export function buildCaptionsVtt(cues: CaptionCue[]): string {
  const lines = ["WEBVTT", ""];
  for (const cue of cues) {
    const text = cue.text.replace(/\r/g, "").trim();
    if (!text) continue;
    const start = Math.max(0, cue.start);
    const end = Math.max(start + 0.2, cue.end);
    lines.push(`${formatVttTimestamp(start)} --> ${formatVttTimestamp(end)}`);
    lines.push(text);
    lines.push("");
  }
  return lines.join("\n");
}
