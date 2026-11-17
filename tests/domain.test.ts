import { describe, it, expect } from "vitest";
import {
  activeCue,
  parseSubtitles,
  packageSchema,
  youtubeId,
  reviewNext,
} from "../shared/domain.ts";
import { fixtureCues } from "../shared/content.ts";
describe("subtitle boundaries", () => {
  it("synchronizes at seek boundaries, gaps and offsets", () => {
    expect(activeCue(fixtureCues, 0)?.cueId).toBe("demo-1");
    expect(activeCue(fixtureCues, 6000)?.cueId).toBe("demo-2");
    expect(activeCue(fixtureCues, 20000)).toBeUndefined();
    expect(activeCue(fixtureCues, 7000, 1000)?.cueId).toBe("demo-2");
  });
  it("parses SRT and VTT with multiline text without HTML execution", () => {
    expect(
      parseSubtitles(
        "WEBVTT\n\n00:00.000 --> 00:02.000 align:start\n<b>Hello</b>\nworld",
      )[0].originalText,
    ).toBe("Hello world");
    expect(
      parseSubtitles("1\n00:00:02,000 --> 00:00:03,100\nHi")[0].startMs,
    ).toBe(2000);
  });
  it("rejects invalid, overlapping, reversed and empty tracks", () => {
    for (const s of [
      "00::01,000 --> 00::02,000\nX",
      "00:60.000 --> 01:02.000\nX",
      "00:02.000 --> 00:01.000\nX",
      "",
      "00:00.000 --> 00:10.000\nA\n\n00:01.000 --> 00:02.000\nB",
    ])
      expect(() => parseSubtitles(s)).toThrow();
  });
});
it("only embeds supported https YouTube URLs", () => {
  expect(youtubeId("https://www.youtube.com/watch?v=dQw4w9WgXcQ")).toBe(
    "dQw4w9WgXcQ",
  );
  for (const u of [
    "https://evil.test/watch?v=dQw4w9WgXcQ",
    "http://youtube.com/watch?v=dQw4w9WgXcQ",
    "javascript:alert(1)",
    "https://youtube.com@localhost/",
  ])
    expect(youtubeId(u)).toBeUndefined();
});
it("schedules meaningful retrieval intervals and resets after a miss", () => {
  const at = new Date("2026-11-17T00:00:00Z");
  let item: any = { stage: 0, attempts: [] };
  const days = [1, 3, 7];
  for (const day of days) {
    item = reviewNext(item, true, at);
    expect(new Date(item.dueAt).getTime() - at.getTime()).toBe(day * 86400000);
  }
  expect(reviewNext(item, false, at).stage).toBe(0);
});
