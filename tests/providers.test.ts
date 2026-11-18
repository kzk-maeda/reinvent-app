import { it, expect, vi } from "vitest";
import { Store } from "../server/db.ts";
import { Budget } from "../server/budget.ts";
import {
  TextAI,
  replySchema,
  instructions,
  simulatedRoleplay,
} from "../server/ai.ts";
import { defaultProfile, type PracticeSession } from "../shared/domain.ts";
import { VoiceManager } from "../server/voice.ts";
it("keeps company identity and prepared demos in character without asserting unverified releases", () => {
  for (const [packId, company] of [
    ["confluent", "Confluent"],
    ["databricks", "Databricks"],
  ]) {
    const session = {
      packId,
      mode: "企業デモ",
      goal: "会社名と最新デモを聞く",
      turns: [],
    } as unknown as PracticeSession;
    const prompt = instructions(session, defaultProfile);
    expect(prompt).toContain(`booth engineer at ${company}`);
    expect(prompt).toContain("without claiming it is the latest release");
    expect(prompt).toContain(
      "If explicitly asked whether you are a real employee",
    );
    const response = simulatedRoleplay(
      session,
      "What is your company name? I'd like to know some demos of your latest products.",
    );
    expect(response).toContain(`from ${company}`);
    expect(response).not.toContain("fictional demo chat");
    expect(response).not.toContain("not a company representative");
    expect(simulatedRoleplay(session, "Are you a real employee?")).toContain(
      "I'm an AI",
    );
    expect(simulatedRoleplay(session, "What is the exact price?")).toContain(
      "I don't have that detail here",
    );
  }
});
it("uses the current text model rate card and disables reasoning for short responses", async () => {
  const store = new Store(":memory:");
  const budget = new Budget(store, 3000, 150);
  const fetcher = vi.fn().mockResolvedValue(
    new Response(
      JSON.stringify({
        id: "response",
        status: "completed",
        output: [
          { content: [{ type: "output_text", text: '{"text":"Hello"}' }] },
        ],
        usage: {
          input_tokens: 1000,
          output_tokens: 500,
          input_tokens_details: { cached_tokens: 200 },
        },
      }),
      { headers: { "Content-Type": "application/json" } },
    ),
  );
  const ai = new TextAI(
    {
      provider: "openai",
      apiKey: "fake-test-key",
      textModel: "gpt-6-luna",
      voiceModel: "gpt-realtime-2.1",
      transcriptionModel: "whisper-1",
      voiceReservationYen: 500,
      maxSeconds: 600,
    },
    budget,
    fetcher,
  );
  expect(
    await ai.json("roleplay", "Return JSON", { text: "Hi" }, replySchema, {
      text: "fixture",
    }),
  ).toEqual({ text: "Hello" });
  const body = JSON.parse(fetcher.mock.calls[0][1].body);
  expect(body.reasoning).toEqual({ effort: "none" });
  expect(body.service_tier).toBe("default");
  expect(budget.snapshot().events[0].amount).toBe(50);
  store.close();
});
it("uses the newer realtime text-output rate", async () => {
  const store = new Store(":memory:");
  const budget = new Budget(store, 3000, 150);
  const reservation = budget.reserve("voice", "gpt-realtime-2.1", 500);
  store.put("session", "current", {
    id: "current",
    status: "active",
    turns: [],
  });
  store.put("voice-call", "current", {
    id: "current",
    callId: "rtc_current",
    reservation,
    outcome: "created",
    usd: 0,
    uncertain: true,
    responseIds: [],
    transcriptionIds: [],
    updatedAt: new Date().toISOString(),
  });
  const voice = new VoiceManager(
    store,
    budget,
    {
      provider: "openai",
      apiKey: "fake-test-key",
      textModel: "gpt-6-luna",
      voiceModel: "gpt-realtime-2.1",
      transcriptionModel: "whisper-1",
      voiceReservationYen: 500,
      maxSeconds: 600,
    },
    vi.fn().mockResolvedValue(new Response(null, { status: 200 })),
  );
  voice.event("current", {
    type: "response.done",
    response: {
      id: "r-current",
      usage: {
        input_tokens: 0,
        output_tokens: 1000,
        input_token_details: { text_tokens: 0, audio_tokens: 0 },
        output_token_details: { text_tokens: 1000, audio_tokens: 0 },
      },
    },
  });
  expect(voice.calls.get("current")!.record.usd).toBeCloseTo(0.024);
  await voice.stop("current");
  store.close();
});
