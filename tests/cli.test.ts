import { it, expect } from "vitest";
import { normalizeSegments, mergeCueChunks } from "../cli/prepare.ts";
it("owns chunk boundaries once and restores absolute source times", () => {
  const previous = normalizeSegments(
    [{ start: 178, end: 182, text: "boundary" }],
    0,
    0,
    180000,
  );
  const next = normalizeSegments(
    [
      { start: 0, end: 4, text: "boundary" },
      { start: 4, end: 6, text: "next" },
    ],
    178000,
    180000,
    360000,
  );
  expect(previous).toHaveLength(1);
  expect(next).toHaveLength(2);
  expect(next[0].startMs).toBe(180000);
  expect(next[0].endMs).toBe(182000);
  expect(next[1].startMs).toBe(182000);
});
it("matches repeated text even when chunk timestamps drift across the boundary", () => {
  for (const [left, right] of [
    [
      { start: 177, end: 181, text: "We need reliable systems." },
      { start: 0, end: 5, text: "We need reliable systems." },
    ],
    [
      { start: 179, end: 182, text: "Missing words." },
      { start: 0, end: 2.5, text: "Missing words." },
    ],
  ] as const) {
    const merged = mergeCueChunks(
      normalizeSegments([left], 0, 0, 360000),
      normalizeSegments([right], 178000, 0, 360000),
      178000,
    );
    expect(merged).toHaveLength(1);
    expect(merged[0].originalText).toBe(left.text);
  }
});
it("stops for ambiguous overlap instead of silently deleting words", () => {
  expect(() =>
    mergeCueChunks(
      normalizeSegments(
        [{ start: 177, end: 182, text: "original content" }],
        0,
        0,
        360000,
      ),
      normalizeSegments(
        [{ start: 1, end: 5, text: "different boundary content" }],
        178000,
        0,
        360000,
      ),
      178000,
    ),
  ).toThrow("分割境界");
});
