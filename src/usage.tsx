import { useState } from "react";
import type { PageProps } from "./main.tsx";
import { api } from "./api.ts";
export default function UsageReconciliation({
  data,
  run,
  refresh,
  busy,
}: PageProps) {
  const [id, setId] = useState("");
  const [amount, setAmount] = useState("");
  const [reference, setReference] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const pending = data.usage.events.filter((e: any) => e.status === "reserved");
  return (
    <details>
      <summary>未確定の費用を請求記録と照合する</summary>
      <p className="muted">
        APIの応答や停止が不明な場合、費用予約を残します。OpenAI側で通話の終了と請求額を確認した後に使ってください。
      </p>
      {(data.voiceRecovery || []).map((call: any) => (
        <p key={call.id}>
          停止確認が必要な音声：{call.id}
          <button
            disabled={busy}
            onClick={() =>
              void run(async () => {
                await api(`/practice-sessions/${call.id}/stop`, {});
                await refresh();
              }, "停止を再確認しました。停止未確認なら接続は引き続き保留されます。")
            }
          >
            停止を再確認
          </button>
        </p>
      ))}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void run(async () => {
            await api(`/usage/${id}/reconcile`, {
              amountYen: Number(amount),
              reference,
              confirmedStopped: confirmed,
            });
            await refresh();
            setId("");
            setAmount("");
            setConfirmed(false);
          }, "請求記録に合わせて確定しました");
        }}
      >
        <label>
          未確定の処理
          <select value={id} onChange={(e) => setId(e.target.value)} required>
            <option value="">処理を選択</option>
            {pending.map((e: any) => (
              <option key={e.id} value={e.id}>
                {e.kind} · {e.created} · 予約¥{e.amount / 1000}
              </option>
            ))}
          </select>
        </label>
        <label>
          確認した金額（円）
          <input
            type="number"
            min="0"
            step="0.001"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            required
          />
        </label>
        <label>
          確認した請求記録・照合メモ
          <input
            value={reference}
            onChange={(e) => setReference(e.target.value)}
            required
            maxLength={2000}
          />
        </label>
        <label className="check">
          <input
            type="checkbox"
            checked={confirmed}
            onChange={(e) => setConfirmed(e.target.checked)}
            required
          />
          対象の処理・音声がOpenAI側で終了していることを確認しました
        </label>
        <button disabled={busy || !confirmed}>確認した費用で確定する</button>
      </form>
    </details>
  );
}
export function BudgetSettings({ data, run, refresh, busy }: PageProps) {
  const [limitYen, setLimit] = useState(data.usage.limitYen);
  const [usdJpy, setRate] = useState(data.usage.usdJpy);
  return (
    <details>
      <summary>月間予算と換算率を変更</summary>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void run(async () => {
            await api("/settings/budget", { limitYen, usdJpy }, "PUT");
            await refresh();
          }, "予算を更新しました。既存の記録には処理開始時の換算率を使います。");
        }}
      >
        <label>
          月間API予算（円）
          <input
            type="number"
            min="1"
            max="100000"
            value={limitYen}
            onChange={(e) => setLimit(Number(e.target.value))}
            required
          />
        </label>
        <label>
          1 USDあたりの円
          <input
            type="number"
            min="1"
            max="1000"
            step="0.01"
            value={usdJpy}
            onChange={(e) => setRate(Number(e.target.value))}
            required
          />
        </label>
        <button disabled={busy}>予算を保存</button>
      </form>
    </details>
  );
}
export function PerformanceRecords({
  run,
  busy,
}: {
  run: PageProps["run"];
  busy: boolean;
}) {
  const [metrics, setMetrics] = useState<any[]>([]);
  return (
    <details>
      <summary>この環境の表示・応答の計測記録</summary>
      <p className="muted">
        本番ビルドで計測します。LCP 2.5秒・INP 200ms・CLS
        0.1が目標です。少数の参考値であり、実機や全利用の達成率を示すものではありません。
      </p>
      <button
        disabled={busy}
        onClick={() =>
          void run(
            async () => setMetrics(await api("/metrics")),
            "計測記録を取得しました",
          )
        }
      >
        記録を取得
      </button>
      {metrics.slice(0, 20).map((m) => (
        <p key={`${m.id}:${m.name}`}>
          {m.name}: {m.value.toFixed(m.name === "CLS" ? 3 : 0)}
          {m.name === "CLS" ? "" : "ms"} · {m.viewport} · {m.network}
          <small>
            {m.at} / {m.route}
          </small>
        </p>
      ))}
    </details>
  );
}
