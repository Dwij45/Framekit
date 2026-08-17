import assert from "node:assert/strict";
import test from "node:test";
import { compileTimelineArgs } from "./compile-timeline";
import { parseTimeline } from "./timeline-spec";

test("rejects unknown ops and ffmpeg strings", () => {
  assert.throws(() => parseTimeline({ clips: [{ assetId: "abc" }], ffmpeg: "-i x" }));
  assert.throws(() => parseTimeline({ clips: [{ assetId: "abc;rm" }] }));
});

test("hostile clip path stays one -i argument", () => {
  const timeline = parseTimeline({
    clips: [
      { assetId: "intro1", trimEnd: 2 },
      { assetId: "body2", trimStart: 1, trimEnd: 4 },
    ],
    overlay: { x: 16, y: 16 },
    mute: true,
  });
  const args = compileTimelineArgs(timeline, {
    clipPaths: ["intro;rm -rf.mp4", "body.mp4"],
    overlayPath: "/opt/logo.png",
    output: "out.mp4",
  });
  assert.equal(args[args.indexOf("-i") + 1], "intro;rm -rf.mp4");
  assert.ok(!args.some((a) => a === "rm -rf"));
  const fc = args[args.indexOf("-filter_complex") + 1];
  assert.match(fc, /concat=n=2/);
  assert.match(fc, /overlay=16:16/);
  assert.ok(args.includes("-an"));
});

test("silent clip uses anullsrc instead of [i:a]", () => {
  const timeline = parseTimeline({
    clips: [{ assetId: "a1", trimEnd: 2 }],
    mute: false,
  });
  const args = compileTimelineArgs(timeline, {
    clipPaths: ["in.mp4"],
    clipHasAudio: [false],
    clipDurationSec: [8],
    output: "out.mp4",
  });
  const fc = args[args.indexOf("-filter_complex") + 1];
  assert.match(fc, /anullsrc=/);
  assert.ok(!fc.includes("[0:a]"));
});

test("overlay enable stays inside one filter_complex argument", () => {
  const timeline = parseTimeline({
    clips: [{ assetId: "a1", trimEnd: 3 }],
    overlay: { x: 8, y: 8, start: 0, duration: 1 },
    mute: true,
  });
  const args = compileTimelineArgs(timeline, {
    clipPaths: ["in.mp4"],
    overlayPath: "logo.png",
    output: "out.mp4",
  });
  const fc = args[args.indexOf("-filter_complex") + 1];
  assert.match(fc, /enable=between\(t/);
  assert.equal(args.filter((a) => a === "-filter_complex").length, 1);
});
