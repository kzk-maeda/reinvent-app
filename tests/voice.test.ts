import { it, expect, vi } from "vitest";
import { Store } from "../server/db.ts";
import { Budget } from "../server/budget.ts";
import { VoiceManager, type CallRecord } from "../server/voice.ts";
import { defaultProfile } from "../shared/domain.ts";
const config = {
  provider: "openai" as const,
  apiKey: "fake-test-key",
  textModel: "gpt-4.1-mini",
  voiceModel: "gpt-realtime",
  transcriptionModel: "whisper-1",
  voiceReservationYen: 500,
  maxSeconds: 600,
};
function fixture() {
  const store = new Store(":memory:");
  store.put("session", "test", { id: "test", status: "ready", turns: [] });
  return { store, budget: new Budget(store, 3000, 150) };
}
it("hangs up a call that was cancelled while creation was pending; all stop callers wait", async () => {
  const { store, budget } = fixture();
  let resolve!: (r: Response) => void;
  const pending = new Promise<Response>((r) => (resolve = r));
  let hangup!: (r: Response) => void;
  const stopPending = new Promise<Response>((r) => (hangup = r));
  const fetcher = vi
    .fn()
    .mockReturnValueOnce(pending)
    .mockReturnValueOnce(stopPending);
  const voice = new VoiceManager(store, budget, config, fetcher);
  const start = voice.start("test", "sdp-test", defaultProfile).catch((e) => e);
  const stop1 = voice.stop("test", true);
  const stop2 = voice.stop("test", true);
  expect(stop1).toBe(stop2);
  resolve(
    new Response("sdp", {
      headers: { location: "/v1/realtime/calls/rtc_test" },
    }),
  );
  await vi.waitFor(() => expect(fetcher).toHaveBeenCalledTimes(2));
  expect(voice.calls.size).toBe(1);
  hangup(new Response(null, { status: 200 }));
  await Promise.all([start, stop1, stop2]);
  expect(voice.calls.size).toBe(0);
  expect(store.get("voice-call", "test")).toBeUndefined();
  expect(budget.snapshot().totalYen).toBe(500);
  store.close();
});
it("keeps full reservations for restored calls and unfinished responses", async () => {
  for (const restored of [true, false]) {
    const { store, budget } = fixture();
    const reservation = budget.reserve("voice", "gpt-realtime", 500);
    store.put("voice-call", "test", {
      id: "test",
      callId: "rtc_partial",
      reservation,
      outcome: "created",
      usd: 0.01,
      uncertain: false,
      responseIds: ["done"],
      transcriptionIds: ["transcribed"],
      updatedAt: new Date().toISOString(),
    });
    const voice = new VoiceManager(
      store,
      budget,
      config,
      vi.fn().mockResolvedValue(new Response(null, { status: 200 })),
    );
    if (!restored) {
      voice.calls.get("test")!.record.uncertain = false;
      voice.event("test", {
        type: "response.created",
        response: { id: "unfinished" },
      });
    }
    await voice.stop("test");
    expect(budget.snapshot().events[0].status).toBe("reserved");
    expect(budget.snapshot().totalYen).toBe(500);
    store.close();
  }
});
it("persists failed hangups and restores stopping control after restart", async () => {
  const { store, budget } = fixture();
  const reservation = budget.reserve("voice", "gpt-realtime", 500);
  const record: CallRecord = {
    id: "test",
    callId: "rtc_persist",
    reservation,
    outcome: "created",
    usd: 0,
    uncertain: true,
    responseIds: [],
    transcriptionIds: [],
    updatedAt: new Date().toISOString(),
  };
  store.put("voice-call", "test", record);
  const bad = new VoiceManager(
    store,
    budget,
    config,
    vi.fn().mockRejectedValue(new Error("offline")),
  );
  expect(await bad.stop("test", true)).toBe(false);
  expect(store.get("voice-call", "test")).toBeTruthy();
  const restarted = new VoiceManager(
    store,
    budget,
    config,
    vi.fn().mockResolvedValue(new Response(null, { status: 200 })),
  );
  await restarted.recover();
  expect(store.get("voice-call", "test")).toBeUndefined();
  expect(budget.snapshot().totalYen).toBe(500);
  store.close();
});
it("settles server usage exactly once and distinguishes heard from interrupted output", async () => {
  const { store, budget } = fixture();
  const reservation = budget.reserve("voice", "gpt-realtime", 500);
  store.put("voice-call", "test", {
    id: "test",
    callId: "rtc_usage",
    reservation,
    outcome: "created",
    usd: 0,
    uncertain: false,
    responseIds: [],
    transcriptionIds: [],
    updatedAt: new Date().toISOString(),
  });
  const voice = new VoiceManager(
    store,
    budget,
    config,
    vi.fn().mockResolvedValue(new Response(null, { status: 200 })),
  );
  // This fixture represents a continuously monitored live call, rather than a restored call.
  voice.calls.get("test")!.record.uncertain = false;
  voice.event("test", {
    type: "response.output_audio_transcript.done",
    item_id: "assistant",
    transcript: "Hello",
  });
  voice.event("test", { type: "output_audio_buffer.stopped" });
  expect(store.get<any>("session", "test").turns[0].heard).toBe(true);
  voice.event("test", {
    type: "conversation.item.truncated",
    item_id: "assistant",
  });
  expect(store.get<any>("session", "test").turns[0].heard).toBe(false);
  voice.event("test", {
    type: "conversation.item.input_audio_transcription.completed",
    item_id: "user",
    transcript: "Hi",
    usage: { type: "duration", seconds: 10 },
  });
  const event = {
    type: "response.done",
    response: {
      id: "r1",
      usage: {
        input_tokens: 100,
        output_tokens: 100,
        input_token_details: { text_tokens: 50, audio_tokens: 50 },
        output_token_details: { text_tokens: 50, audio_tokens: 50 },
      },
    },
  };
  voice.event("test", event);
  voice.event("test", event);
  await voice.stop("test");
  expect(budget.snapshot().events[0].status).toBe("confirmed");
  expect(budget.snapshot().totalYen).toBeLessThan(5);
  store.close();
});
it("retains the reservation when a new response starts during hangup", async () => {
  const { store, budget } = fixture();
  const reservation = budget.reserve("voice", "gpt-realtime", 500);
  store.put("voice-call", "test", {
    id: "test",
    callId: "rtc_late",
    reservation,
    outcome: "created",
    usd: 0.01,
    uncertain: false,
    responseIds: ["done"],
    transcriptionIds: ["transcribed"],
    updatedAt: new Date().toISOString(),
  });
  let finish!: (r: Response) => void;
  const response = new Promise<Response>((r) => (finish = r));
  const fetcher = vi.fn().mockReturnValue(response);
  const voice = new VoiceManager(store, budget, config, fetcher);
  voice.calls.get("test")!.record.uncertain = false;
  const stopping = voice.stop("test");
  await vi.waitFor(() => expect(fetcher).toHaveBeenCalled());
  voice.event("test", { type: "response.created", response: { id: "late" } });
  finish(new Response(null, { status: 200 }));
  await stopping;
  expect(budget.snapshot().events[0].status).toBe("reserved");
  store.close();
});
it("uses the reserved exchange rate for its in-call stopping threshold", async () => {
  const { store, budget } = fixture();
  const reservation = budget.reserve("voice", "gpt-realtime", 500);
  store.put("voice-call", "test", {
    id: "test",
    callId: "rtc_rate",
    reservation,
    outcome: "created",
    usd: 0,
    uncertain: false,
    responseIds: [],
    transcriptionIds: [],
    updatedAt: new Date().toISOString(),
  });
  const voice = new VoiceManager(
    store,
    budget,
    config,
    vi.fn().mockResolvedValue(new Response(null, { status: 200 })),
  );
  budget.usdJpy = 1;
  const stop = vi.spyOn(voice, "stop").mockResolvedValue(true);
  voice.event("test", {
    type: "response.done",
    response: {
      id: "expensive",
      usage: {
        input_tokens: 0,
        output_tokens: 50000,
        input_token_details: { text_tokens: 0, audio_tokens: 0 },
        output_token_details: { text_tokens: 0, audio_tokens: 50000 },
      },
    },
  });
  expect(stop).toHaveBeenCalledWith("test", true);
  stop.mockRestore();
  await voice.stop("test");
  store.close();
});
