import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, it } from "vitest";
import { Store } from "../server/db.ts";
import { curatedMaterials } from "../shared/catalog.ts";
import { youtubeId, type Material } from "../shared/domain.ts";

it("seeds official videos for all three topics without invented app subtitles", () => {
  const store = new Store(":memory:");
  try {
    const materials = store.all<Material>("material");
    expect(materials.map((m) => m.id)).toEqual([
      ...curatedMaterials.map((m) => m.id),
      "demo",
    ]);
    expect(curatedMaterials.map((m) => m.topic)).toEqual([
      "AI",
      "SRE",
      "データ基盤",
    ]);
    for (const video of curatedMaterials) {
      expect(youtubeId(video.url)).toBe(video.youtubeId);
      expect(video.publisher).toBe("AWS Events");
      expect(video.fixture).toBeUndefined();
      expect(video.captions).toBeUndefined();
      expect(video.status).toBe("awaiting_source");
    }
    expect(
      store.db.prepare("SELECT COUNT(*) AS count FROM usage").get(),
    ).toEqual({ count: 0 });
  } finally {
    store.close();
  }
});

it("upgrades an existing database once and preserves saved material state", () => {
  const dir = mkdtempSync(join(tmpdir(), "lab-catalog-"));
  const path = join(dir, "lab.sqlite");
  let store = new Store(path);
  try {
    store.remove("meta", "curated-videos-v1");
    for (const video of curatedMaterials) store.remove("material", video.id);
    const video = {
      ...curatedMaterials[0],
      positionMs: 42000,
      offsetMs: 350,
      captions: store.get<Material>("material", "demo")!.captions,
    };
    store.put("material", video.id, video);
    store.close();
    store = new Store(path);
    expect(store.all("material")).toHaveLength(4);
    expect(store.get("material", video.id)).toEqual(video);
    store.remove("material", curatedMaterials[1].id);
    store.close();
    store = new Store(path);
    expect(store.all("material")).toHaveLength(3);
    expect(store.get("material", video.id)).toEqual(video);
  } finally {
    store.close();
    rmSync(dir, { recursive: true, force: true });
  }
});
