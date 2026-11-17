import { DatabaseSync } from "node:sqlite";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { defaultProfile, type Material } from "../shared/domain.ts";
import { fixtureCues } from "../shared/content.ts";
export class Store {
  db: DatabaseSync;
  constructor(path: string) {
    if (path !== ":memory:")
      mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
    this.db = new DatabaseSync(path);
    this.db.exec(`PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000;
      CREATE TABLE IF NOT EXISTS records (kind TEXT NOT NULL,id TEXT NOT NULL,data TEXT NOT NULL,PRIMARY KEY(kind,id));
      CREATE TABLE IF NOT EXISTS logins (token TEXT PRIMARY KEY,expires INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS usage (id TEXT PRIMARY KEY,kind TEXT NOT NULL,model TEXT NOT NULL,month TEXT NOT NULL,amount INTEGER NOT NULL,status TEXT NOT NULL,detail TEXT NOT NULL,created TEXT NOT NULL);
      CREATE INDEX IF NOT EXISTS usage_month ON usage(month);
      CREATE TABLE IF NOT EXISTS operations (id TEXT PRIMARY KEY,result TEXT NOT NULL);
    `);
    if (!this.get("profile", "self"))
      this.put("profile", "self", defaultProfile);
    if (!this.get("meta", "seed-v1")) {
      this.put("material", "demo", {
        id: "demo",
        title: "字幕操作のサンプル",
        topic: "AI",
        url: "https://example.com/local-fixture",
        difficulty: "初級",
        reason: "操作検証用の独自英文。実際のre:Invent教材ではありません。",
        status: "ready",
        offsetMs: 0,
        positionMs: 0,
        fixture: true,
        captions: {
          version: 1,
          sourceUrl: "https://example.com/local-fixture",
          sourceDescription: "独自作成の操作確認サンプル",
          permission: "アプリ独自の例文",
          inputHash: "fixture-v1",
          model: "fixture",
          generatedAt: "2026-11-17T00:00:00Z",
          cues: fixtureCues,
        },
      } satisfies Material);
      this.put("meta", "seed-v1", true);
    }
  }
  get<T>(kind: string, id: string): T | undefined {
    const row = this.db
      .prepare("SELECT data FROM records WHERE kind=? AND id=?")
      .get(kind, id) as { data: string } | undefined;
    return row ? JSON.parse(row.data) : undefined;
  }
  all<T>(kind: string): T[] {
    return (
      this.db
        .prepare("SELECT data FROM records WHERE kind=? ORDER BY rowid DESC")
        .all(kind) as { data: string }[]
    ).map((r) => JSON.parse(r.data));
  }
  put(kind: string, id: string, data: unknown) {
    this.db
      .prepare(
        "INSERT INTO records VALUES(?,?,?) ON CONFLICT(kind,id) DO UPDATE SET data=excluded.data",
      )
      .run(kind, id, JSON.stringify(data));
  }
  remove(kind: string, id: string) {
    this.db.prepare("DELETE FROM records WHERE kind=? AND id=?").run(kind, id);
  }
  transaction<T>(run: () => T): T {
    this.db.exec("BEGIN IMMEDIATE");
    try {
      const result = run();
      this.db.exec("COMMIT");
      return result;
    } catch (e) {
      this.db.exec("ROLLBACK");
      throw e;
    }
  }
  close() {
    this.db.close();
  }
}
