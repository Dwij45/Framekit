import assert from "node:assert/strict";
import test from "node:test";
import { parseIngestSpec } from "./ingest-spec";
import { pickLadder } from "./index";

test("ingest spec defaults to 1080p ladder and captions on", () => {
  const spec = parseIngestSpec({});
  assert.equal(spec.maxHeight, 1080);
  assert.equal(spec.captions, true);
});

test("ingest spec keeps speed and caption look", () => {
  const spec = parseIngestSpec({
    maxHeight: 720,
    speed: 1.25,
    mute: true,
    captions: true,
    captionStyle: { font: "mono", color: "yellow", background: "none" },
  });
  assert.equal(spec.speed, 1.25);
  assert.equal(spec.mute, true);
  assert.equal(spec.captionStyle.font, "mono");
  assert.equal(spec.captionStyle.background, "none");
});

test("ingest spec rejects unknown keys", () => {
  assert.throws(() => parseIngestSpec({ maxHeight: 720, ffmpeg: "-vf" }));
});

test("pickLadder never upscales and respects maxHeight", () => {
  const full = pickLadder(1080);
  assert.deepEqual(
    full.map((r) => r.label),
    ["360p", "720p", "1080p"],
  );
  const capped = pickLadder(1080, 720);
  assert.deepEqual(
    capped.map((r) => r.label),
    ["360p", "720p"],
  );
  const phone = pickLadder(720, 1080);
  assert.deepEqual(
    phone.map((r) => r.label),
    ["360p", "720p"],
  );
});
