import assert from "node:assert/strict";
import test from "node:test";
import { compileTransformArgs } from "./compile-transform.js";
import { parseTransformSpec } from "./transform-spec.js";

test("rejects unknown keys and shell-looking quality", () => {
  assert.throws(() => parseTransformSpec({ quality: "high;rm -rf" }));
  assert.throws(() => parseTransformSpec({ extra: true }));
});

test("argv keeps a hostile filename as one argument", () => {
  const spec = parseTransformSpec({ mute: true, aspect: "9:16" });
  const args = compileTransformArgs(spec, {
    input: "clip;rm -rf / .mp4",
    output: "out.mp4",
    srcWidth: 1280,
    srcHeight: 720,
    hasAudio: true,
  });
  assert.equal(args[args.indexOf("-i") + 1], "clip;rm -rf / .mp4");
  assert.ok(!args.includes("rm -rf"));
  assert.ok(args.some((a) => a.includes("crop=")));
  assert.ok(args.includes("-an"));
});

test("watermark overlay uses numeric x/y only", () => {
  const spec = parseTransformSpec({ watermark: { x: 16, y: 32 } });
  const args = compileTransformArgs(spec, {
    input: "in.mp4",
    output: "out.mp4",
    srcWidth: 1280,
    srcHeight: 720,
    hasAudio: true,
    watermarkPath: "/opt/logo.png",
  });
  const fc = args[args.indexOf("-filter_complex") + 1];
  assert.match(fc, /overlay=16:32/);
  assert.equal(args[args.indexOf("-i") + 3], "/opt/logo.png");
});
