import assert from "node:assert/strict";
import test from "node:test";
import { buildCaptionsVtt, buildSpriteVtt, formatVttTimestamp, spritePlan } from "./sprite";

test("sprite plan stays numeric and capped", () => {
  const short = spritePlan(8);
  assert.equal(short.interval, 1);
  assert.equal(short.count, 8);
  const long = spritePlan(400);
  assert.equal(long.interval, 5);
  assert.ok(long.count <= 100);
});

test("sprite VTT uses relative sprite.jpg and xywh only", () => {
  const vtt = buildSpriteVtt(spritePlan(3));
  assert.match(vtt, /^WEBVTT/m);
  assert.match(vtt, /sprite\.jpg#xywh=0,0,160,90/);
  assert.ok(!vtt.includes("http"));
  assert.ok(!vtt.includes(";"));
});

test("VTT timestamps are zero-padded", () => {
  assert.equal(formatVttTimestamp(0), "00:00:00.000");
  assert.equal(formatVttTimestamp(65.5), "00:01:05.500");
});

test("caption VTT drops empty cues", () => {
  const vtt = buildCaptionsVtt([
    { start: 0, end: 1, text: "hello" },
    { start: 1, end: 2, text: "  " },
  ]);
  assert.match(vtt, /hello/);
  assert.equal((vtt.match(/-->/g) ?? []).length, 1);
});
