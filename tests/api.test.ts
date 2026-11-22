import { it, expect, beforeEach, afterEach, vi } from "vitest";
import { Store } from "../server/db.ts";
import { createApp, type AppConfig } from "../server/app.ts";
import type { PracticeSession } from "../shared/domain.ts";
import { productDevelopmentPackId } from "../shared/scenarios.ts";
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
  lab.speech.close();
  await lab.voice.close();
  s.close();
});
it("translates utterances through a dedicated provider, caches them, and invalidates corrections", async () => {
  await lab.voice.close();
  const fetcher = vi.fn().mockImplementation(
    async () =>
      new Response(
        JSON.stringify({
          id: "translated",
          status: "completed",
          output: [
            {
              content: [
                {
                  type: "output_text",
                  text: JSON.stringify({ text: "会社名を教えてください。" }),
                },
              ],
            },
          ],
          usage: { input_tokens: 100, output_tokens: 20 },
        }),
        { headers: { "Content-Type": "application/json" } },
      ),
  );
  lab = createApp(
    s,
    { ...config, provider: "openai", apiKey: "fake-key" },
    fetcher,
  );
  const session = (await (
    await req("/practice-sessions", {
      packId: "confluent",
      mode: "企業デモ",
      goal: "会社名を聞く",
    })
  ).json()) as any;
  s.put("session", session.id, {
    ...session,
    turns: [
      {
        id: "user-turn",
        role: "user",
        text: "What is your company name?",
        at: new Date().toISOString(),
      },
    ],
  });
  const path = `/practice-sessions/${session.id}/turns/user-turn/translation`;
  expect((await req(path, {}, "POST", false)).status).toBe(401);
  const first = await req(path, {});
  expect(first.status).toBe(200);
  expect(((await first.json()) as any).translation).toBe(
    "会社名を教えてください。",
  );
  expect(((await (await req(path, {})).json()) as any).cached).toBe(true);
  expect(fetcher).toHaveBeenCalledTimes(1);
  expect(JSON.parse(fetcher.mock.calls[0][1].body).instructions).toContain(
    "Translate the English conversation utterance",
  );
  expect(s.get<any>("session", session.id).turns[0].translation).toBe(
    "会社名を教えてください。",
  );
  await req(
    `/practice-sessions/${session.id}/turns/user-turn`,
    { text: "Could you show me a demo?" },
    "PATCH",
  );
  expect(
    s.get<any>("session", session.id).turns[0].translation,
  ).toBeUndefined();
  await req(path, {});
  expect(fetcher).toHaveBeenCalledTimes(2);
  expect(
    lab.budget.snapshot().events.every((event) => event.kind === "translation"),
  ).toBe(true);
});
it("keeps simulator history from becoming paid translation or speech after reconnecting", async () => {
  const session = (await (
    await req("/practice-sessions", {
      packId: "confluent",
      mode: "企業デモ",
      goal: "会社名を聞く",
    })
  ).json()) as any;
  s.put("session", session.id, {
    ...session,
    turns: [
      { id: "old", role: "user", text: "Hello", at: new Date().toISOString() },
    ],
  });
  const path = `/practice-sessions/${session.id}/turns/old`;
  await req(`${path}/translation`, {});
  expect(s.get<any>("session", session.id).turns[0].translationProvider).toBe(
    "simulator",
  );
  await lab.voice.close();
  const fetcher = vi.fn();
  lab = createApp(
    s,
    { ...config, provider: "openai", apiKey: "fake-key" },
    fetcher,
  );
  expect((await req(`${path}/translation`, {})).status).toBe(400);
  expect((await req(`${path}/speech`, {})).status).toBe(400);
  expect(fetcher).not.toHaveBeenCalled();
  expect(lab.budget.snapshot().events).toHaveLength(0);
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
it("practices internal AI development with follow-up examples instead of a product pitch", async () => {
  const created = await req("/practice-sessions", {
    packId: "ai-development",
    mode: "エンジニアとの情報交換",
    goal: "AIの利用範囲と基盤、役割の変化を聞く",
    training: true,
  });
  expect(created.status).toBe(201);
  const session = (await created.json()) as any;
  const say = async (text: string) => {
    const response = await req(`/practice-sessions/${session.id}/turns`, {
      text,
    });
    expect(response.status).toBe(200);
    return ((await response.json()) as any).turns.at(-1).text as string;
  };
  expect(
    await say("Do you use tools like Factory, or an internal platform?"),
  ).toContain("thin internal platform");
  expect(
    await say("How is your engineering organization structured?"),
  ).toContain("four cross-functional product teams");
  expect(
    await say("How do your product teams and platform team divide the work?"),
  ).toContain("A product team might test");
  expect(await say("How have engineers' roles changed?")).toContain(
    "framing problems",
  );
  const example = await say("Could you give me a concrete example?");
  expect(example).toContain("junior engineer");
  expect(await say("Could you say that again?")).toContain(example);
  expect(await say("How do you review AI-generated changes?")).toContain(
    "human review",
  );
  expect(await say("How do you measure the impact?")).toContain(
    "review effort",
  );
  const hint = (await (
    await req(`/practice-sessions/${session.id}/hint`, {
      text: "自前の開発基盤があるか聞きたい",
    })
  ).json()) as any;
  expect(hint.text).toContain("Do you use tools like Factory");
  expect(await say("Thanks for sharing!")).toContain(
    "Enjoy the rest of the conference",
  );
  expect(lab.budget.snapshot().totalYen).toBe(0);
  expect(lab.budget.snapshot().events).toHaveLength(0);
});

it("continues from the product introduction into its team's workflow, size, and individual goals", async () => {
  const created = await req("/practice-sessions", {
    packId: productDevelopmentPackId,
    mode: "エンジニアとの情報交換",
    goal: "ブースで製品の開発体制とKPIを聞く",
  });
  expect(created.status).toBe(201);
  const { id } = (await created.json()) as PracticeSession;
  const ask = async (text: string) => {
    const response = await req(`/practice-sessions/${id}/turns`, { text });
    expect(response.status).toBe(200);
    return ((await response.json()) as PracticeSession).turns.at(-1)?.text;
  };
  expect(await ask("What does SyncRelay do?")).toContain(
    "I'm Maya, a backend engineer on SyncRelay",
  );
  expect(await ask("Do you have a software factory?")).toContain(
    "engineers approve what ships",
  );
  expect(await ask("Could you give me an example?")).toContain(
    "connector retry change",
  );
  expect(await ask("How many engineers are on your team?")).toContain(
    "five engineers, one product manager, and one designer",
  );
  expect(await ask("What are your team KPIs?")).toContain(
    "change lead time and change failure rate",
  );
  expect(await ask("What about you personally?")).toContain(
    "duplicate alerts per thousand syncs by 25%",
  );
  const both = await ask(
    "What KPIs do you track for teams and individual engineers?",
  );
  expect(both).toContain("delivery lead time");
  expect(both).toContain("duplicate alerts");
  expect(lab.budget.snapshot().events).toHaveLength(0);
});

it("sends the named product engineer, workflow and KPIs to the text adapter", async () => {
  await lab.voice.close();
  const fetcher = vi.fn().mockResolvedValue(
    new Response(
      JSON.stringify({
        id: "scenario-test",
        status: "completed",
        output: [
          {
            content: [
              {
                type: "output_text",
                text: JSON.stringify({
                  text: "Our team tracks change lead time and change failure rate.",
                }),
              },
            ],
          },
        ],
        usage: { input_tokens: 100, output_tokens: 20 },
      }),
      { headers: { "Content-Type": "application/json" } },
    ),
  );
  lab = createApp(
    s,
    { ...config, provider: "openai", apiKey: "fake-test-key" },
    fetcher,
  );
  const session = (await (
    await req("/practice-sessions", {
      packId: productDevelopmentPackId,
      mode: "エンジニアとの情報交換",
      goal: "製品の開発体制を聞く",
    })
  ).json()) as any;
  await req(`/practice-sessions/${session.id}/turns`, {
    text: "What KPIs do you track on your team?",
  });
  expect(fetcher).toHaveBeenCalledTimes(1);
  const sent = JSON.parse(fetcher.mock.calls[0][1].body);
  expect(sent.instructions).toContain(
    "You are Maya, a backend engineer who personally builds and operates SyncRelay",
  );
  expect(sent.instructions).toContain("one or two sentences");
  expect(sent.instructions).toContain('"verifiedFacts":[]');
  expect(sent.instructions).toContain(
    "five engineers, one product manager and one designer",
  );
  expect(sent.instructions).toContain(
    "duplicate alerts per 1,000 syncs by 25%",
  );
  expect(sent.input).toContain("What KPIs do you track on your team?");
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
