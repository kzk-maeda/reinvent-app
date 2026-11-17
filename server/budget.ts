import { randomUUID } from "node:crypto";
import { Store } from "./db.ts";
export type Usage = {
  id: string;
  kind: string;
  model: string;
  month: string;
  amount: number;
  status: string;
  detail: string;
  created: string;
};
// All stored amounts are integer milli-yen. Japanese calendar months govern the budget.
export function month(at = new Date()) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "2-digit",
  }).format(at);
}
export class Budget {
  constructor(
    readonly store: Store,
    public limitYen: number,
    public usdJpy: number,
  ) {}
  snapshot() {
    const events = this.store.db
      .prepare("SELECT * FROM usage WHERE month=? ORDER BY created DESC")
      .all(month()) as Usage[];
    const total = events.reduce((s, e) => s + e.amount, 0) / 1000;
    return {
      limitYen: this.limitYen,
      totalYen: total,
      confirmedYen:
        events
          .filter((e) => e.status === "confirmed")
          .reduce((s, e) => s + e.amount, 0) / 1000,
      remainingYen: Math.max(0, this.limitYen - total),
      warning:
        total >= this.limitYen * 0.9
          ? 90
          : total >= this.limitYen * 0.7
            ? 70
            : 0,
      usdJpy: this.usdJpy,
      rateDate: "2026-11-17",
      events,
    };
  }
  reserve(
    kind: string,
    model: string,
    yen: number,
    id = randomUUID(),
    jobId?: string,
  ): string {
    return this.store.transaction(() => {
      const old = this.store.db
        .prepare("SELECT id FROM usage WHERE id=?")
        .get(id);
      if (old) throw new Error("同じ処理は既に登録されています");
      if (
        !Number.isFinite(yen) ||
        yen <= 0 ||
        this.snapshot().remainingYen < yen
      )
        throw new Error("予算が不足しています");
      if (jobId) {
        const job = this.store.get<any>("job", jobId);
        const used = this.store.db
          .prepare(
            "SELECT COALESCE(SUM(amount),0) AS total FROM usage WHERE json_valid(detail) AND json_extract(detail,'$.jobId')=?",
          )
          .get(jobId) as { total: number };
        if (
          !job ||
          !Number.isFinite(job.maxYen) ||
          used.total / 1000 + yen > job.maxYen
        )
          throw new Error("この教材準備の上限予算が不足しています");
      }
      this.store.db
        .prepare("INSERT INTO usage VALUES(?,?,?,?,?,?,?,?)")
        .run(
          id,
          kind,
          model,
          month(),
          Math.ceil(yen * 1000),
          "reserved",
          JSON.stringify({
            jobId,
            usdJpy: this.usdJpy,
            reason: "未確定使用量を含む費用予約",
          }),
          new Date().toISOString(),
        );
      return id;
    });
  }
  confirm(id: string, usd: number, detail: unknown) {
    if (!Number.isFinite(usd) || usd < 0) throw new Error("費用が不正です");
    const old = this.store.db
      .prepare("SELECT detail FROM usage WHERE id=?")
      .get(id) as { detail: string } | undefined;
    const previous = old ? JSON.parse(old.detail) : {};
    this.store.db
      .prepare(
        "UPDATE usage SET amount=?,status='confirmed',detail=? WHERE id=? AND status='reserved'",
      )
      .run(
        Math.ceil(usd * (previous.usdJpy || this.usdJpy) * 1000),
        JSON.stringify({ ...previous, usd, detail }),
        id,
      );
  }
  release(id: string) {
    this.confirm(id, 0, { reason: "API処理開始前の取消" });
  }
}
