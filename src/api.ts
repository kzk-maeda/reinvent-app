export class APIError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}
export async function api<T = any>(
  path: string,
  body?: unknown,
  method = body === undefined ? "GET" : "POST",
  operationId = crypto.randomUUID(),
  signal?: AbortSignal,
): Promise<T> {
  const r = await fetch(`/api${path}`, {
    signal,
    method,
    credentials: "same-origin",
    headers: {
      "X-Lab-Request": "1",
      "Content-Type": "application/json",
      "Idempotency-Key": operationId,
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data = await r
    .json()
    .catch(() => ({ error: "サーバーの応答を確認できません" }));
  if (!r.ok) throw new APIError(data.error || "処理に失敗しました", r.status);
  return data;
}
export const go = (path: string) => {
  location.hash = path;
};
