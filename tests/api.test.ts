import { it, expect, beforeEach, afterEach, vi } from "vitest";
import { Store } from "../server/db.ts";
import { createApp, type AppConfig } from "../server/app.ts";
let s: Store;
let lab: ReturnType<typeof createApp>;
let cookie: string;
const config: AppConfig = {
  password: "a-test-password-only",
  provider: "simulator",
  textModel: "gpt-4.1-mini",
  voiceModel: "gpt-realtime",
  transcriptionModel: "whisper-1",
  monthlyBudget: 3000,
  usdJpy: 150,
  voiceReservationYen: 500,
  maxSeconds: 600,
};
const req = (
  path: string,
  body?: unknown,
  method = body ? "POST" : "GET",
  auth = true,
  key = crypto.randomUUID(),
) =>
  lab.app.request(`http://localhost/api${path}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      "X-Lab-Request": "1",
      "Idempotency-Key": key,
      ...(auth ? { Cookie: cookie } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
beforeEach(async () => {
  s = new Store(":memory:");
  lab = createApp(s, config);
  const r = await req("/login", { password: config.password }, "POST", false);
  cookie = r.headers.get("set-cookie")!.split(";")[0];
});
afterEach(async () => {
  await lab.voice.close();
  s.close();
});
it("protects every data and AI boundary and rejects CSRF", async () => {
  for (const path of [
    "/bootstrap",
    "/catalog",
    "/usage",
    "/ai-connections",
    "/review-items",
    "/preparation-jobs/nope",
    "/practice-sessions/nope",
  ])
    expect((await req(path, undefined, "GET", false)).status).toBe(401);
  expect(
    (
      await lab.app.request("http://localhost/api/profile", {
        method: "PUT",
        headers: { Cookie: cookie },
        body: "{}",
      })
    ).status,
  ).toBe(403);
  expect(
    (
      await lab.app.request("http://localhost/api/logout", {
        method: "POST",
        headers: {
          Cookie: cookie,
          "X-Lab-Request": "1",
          Origin: "https://evil.test",
        },
      })
    ).status,
  ).toBe(403);
});
it("runs conversation, feedback, sourced review, sync and deletion without AI charges", async () => {
  let r = await req("/practice-sessions", {
    mode: "ネットワーキング",
    packId: "networking",
    goal: "2つ質問して聞き返す",
    training: true,
  });
  let session = (await r.json()) as any;
  const key = crypto.randomUUID();
  r = await req(
    `/practice-sessions/${session.id}/turns`,
    { text: "Could you give me a quick demo?" },
    "POST",
    true,
    key,
  );
  session = await r.json();
  expect(session.turns).toHaveLength(2);
  expect(
    (
      (await (
        await req(
          `/practice-sessions/${session.id}/turns`,
          { text: "duplicate" },
          "POST",
          true,
          key,
        )
      ).json()) as any
    ).turns,
  ).toHaveLength(2);
  session = await (
    await req(`/practice-sessions/${session.id}/finish`, {})
  ).json();
  expect(session.status).toBe("completed");
  const card = {
    en: session.feedback.expressions[0].en,
    ja: "聞き返す",
    source: { kind: "session", id: session.id, turnId: session.turns[0].id },
  };
  await req("/review-items", card);
  await req("/review-items", card);
  expect((await (await req("/review-items")).json()) as any[]).toHaveLength(1);
  expect(lab.budget.snapshot().totalYen).toBe(0);
  await req("/history", undefined, "DELETE");
  expect((await (await req("/review-items")).json()) as any[]).toHaveLength(0);
});
it("imports subtitles once and never calls AI on repeated reads", async () => {
  const m = (await (
    await req("/materials", {
      title: "実動画",
      url: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
      topic: "AI",
    })
  ).json()) as any;
  const fixture = s.get<any>("material", "demo").captions;
  expect(
    (
      await req(`/materials/${m.id}/subtitle-packages`, {
        ...fixture,
        sourceUrl: m.url,
      })
    ).status,
  ).toBe(200);
  for (let i = 0; i < 3; i++) expect((await req("/catalog")).status).toBe(200);
  expect(lab.budget.snapshot().events).toHaveLength(0);
  expect(
    (
      await req(`/materials/${m.id}/subtitle-packages`, {
        ...fixture,
        sourceUrl: "https://evil.test",
      })
    ).status,
  ).toBe(400);
});
it("invalidates login on logout", async () => {
  await req("/logout", {});
  expect((await req("/bootstrap")).status).toBe(401);
});
it("rejects reconciliation while hangup is in flight and preserves control", async () => {
  const reservation = lab.budget.reserve("voice", "gpt-realtime", 500);
  s.put("session", "race", { id: "race", status: "interrupted", turns: [] });
  s.put("voice-call", "race", {
    id: "race",
    callId: "rtc_race",
    reservation,
    outcome: "created",
    usd: 0,
    uncertain: true,
    responseIds: [],
    transcriptionIds: [],
    updatedAt: new Date().toISOString(),
  });
  let finish!: (response: Response) => void;
  const pending = new Promise<Response>((resolve) => (finish = resolve));
  lab = createApp(
    s,
    { ...config, provider: "openai", apiKey: "fake-test-key" },
    vi.fn().mockReturnValue(pending),
  );
  const stopping = lab.voice.stop("race", true);
  expect(
    (
      await req(`/usage/${reservation}/reconcile`, {
        amountYen: 1,
        reference: "test invoice",
        confirmedStopped: true,
      })
    ).status,
  ).toBe(400);
  expect(lab.voice.calls.has("race")).toBe(true);
  finish(new Response(null, { status: 200 }));
  await stopping;
  expect(lab.voice.calls.size).toBe(0);
});
it("retains unknown AI costs and never automatically resends an ambiguous operation", async () => {
  const fetcher = vi.fn().mockRejectedValue(new Error("timeout"));
  lab = createApp(
    s,
    { ...config, provider: "openai", apiKey: "fake-test-key" },
    fetcher,
  );
  const session = (await (
    await req("/practice-sessions", {
      mode: "ネットワーキング",
      packId: "networking",
      goal: "ask a question",
      training: true,
    })
  ).json()) as any;
  const id = crypto.randomUUID();
  await req(
    `/practice-sessions/${session.id}/turns`,
    { text: "What does it do?" },
    "POST",
    true,
    id,
  );
  await req(
    `/practice-sessions/${session.id}/turns`,
    { text: "What does it do?" },
    "POST",
    true,
    id,
  );
  expect(fetcher).toHaveBeenCalledTimes(1);
  expect(lab.budget.snapshot().events[0].status).toBe("reserved");
});
it("never changes a saved simulator session into a paid session after server reconfiguration", async () => {
  const session = (await (
    await req("/practice-sessions", {
      mode: "ネットワーキング",
      packId: "networking",
      goal: "ask a question",
      training: true,
    })
  ).json()) as any;
  const fetcher = vi.fn();
  lab = createApp(
    s,
    { ...config, provider: "openai", apiKey: "fake-test-key" },
    fetcher,
  );
  const response = await req(`/practice-sessions/${session.id}/turns`, {
    text: "What does it do?",
  });
  expect(response.status).toBe(400);
  expect(((await response.json()) as any).error).toContain("AI接続設定が変更");
  expect(fetcher).not.toHaveBeenCalled();
  expect(lab.budget.snapshot().totalYen).toBe(0);
});
