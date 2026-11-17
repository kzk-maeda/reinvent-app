import { it, expect, afterEach } from "vitest";
import { Store } from "../server/db.ts";
import { Budget, month } from "../server/budget.ts";
const stores: Store[] = [];
afterEach(() => stores.splice(0).forEach((s) => s.close()));
it("reserves atomically, preserves unknown costs and settles exactly once", () => {
  const s = new Store(":memory:");
  stores.push(s);
  const b = new Budget(s, 10, 150);
  const id = b.reserve("text", "model", 6);
  expect(() => b.reserve("voice", "model", 5)).toThrow("予算");
  expect(b.snapshot().totalYen).toBe(6);
  b.confirm(id, 0.01, {});
  b.confirm(id, 0.02, {});
  expect(b.snapshot().totalYen).toBe(1.5);
  expect(() => b.reserve("text", "model", Number.NaN)).toThrow();
  expect(() => b.reserve("text", "model", -1)).toThrow();
});
it("uses Japanese calendar months at UTC month boundaries", () => {
  expect(month(new Date("2026-10-31T15:00:00Z"))).toContain("11");
  expect(month(new Date("2026-10-31T14:59:59Z"))).toContain("10");
});
it("enforces a preparation job cap across reserved and confirmed operations", () => {
  const s = new Store(":memory:");
  stores.push(s);
  const b = new Budget(s, 3000, 150);
  s.put("job", "j", { maxYen: 6 });
  const id = b.reserve("translation", "model", 5, undefined, "j");
  expect(() => b.reserve("translation", "model", 5, undefined, "j")).toThrow(
    "教材準備",
  );
  b.confirm(id, 0.005, {});
  expect(() =>
    b.reserve("translation", "model", 5, undefined, "j"),
  ).not.toThrow();
  expect(() => b.reserve("transcription", "model", 1, undefined, "j")).toThrow(
    "教材準備",
  );
});
it("keeps the exchange rate from the moment an operation was reserved", () => {
  const s = new Store(":memory:");
  stores.push(s);
  const b = new Budget(s, 3000, 150);
  const id = b.reserve("text", "model", 5);
  b.usdJpy = 180;
  b.confirm(id, 0.01, {});
  expect(b.snapshot().totalYen).toBe(1.5);
});
