import { EventEmitter } from "node:events";
import { expect, it, vi } from "vitest";
import { Store } from "../server/db.ts";
import { Budget } from "../server/budget.ts";
import { SpeechReader, type speechSocket } from "../server/speech.ts";
import { createApp, type AppConfig } from "../server/app.ts";

const config: AppConfig = {
  password: "speech-test-password",
  provider: "openai",
  apiKey: "fake-key",
  textModel: "gpt-4.1-mini",
  voiceModel: "gpt-realtime-2.1",
  transcriptionModel: "whisper-1",
  monthlyBudget: 3000,
  usdJpy: 150,
  voiceReservationYen: 500,
  maxSeconds: 600,
};
const usage = {
  input_tokens: 100,
  output_tokens: 110,
  input_token_details: { text_tokens: 100, audio_tokens: 0 },
  output_token_details: { text_tokens: 10, audio_tokens: 100 },
};
class Socket extends EventEmitter {
  sent: any[] = [];
  terminated = false;
  constructor(readonly respond: (socket: Socket) => void) {
    super();
  }
  event(event: unknown) {
    if (!this.terminated)
      this.emit("message", Buffer.from(JSON.stringify(event)));
  }
  send(raw: string) {
    const event = JSON.parse(raw);
    this.sent.push(event);
    if (event.type === "session.update")
      queueMicrotask(() => this.event({ type: "session.updated" }));
    if (event.type === "response.create") this.respond(this);
  }
  terminate() {
    this.terminated = true;
    this.emit("close");
  }
}
function connector(respond: (socket: Socket) => void) {
  const sockets: Socket[] = [];
  const connect = vi.fn(() => {
    const socket = new Socket(respond);
    sockets.push(socket);
    queueMicrotask(() => {
      if (!socket.terminated) socket.emit("open");
    });
    return socket as unknown as ReturnType<typeof speechSocket>;
  });
  return { connect, sockets };
}
function complete(socket: Socket, withUsage = true) {
  socket.event({
    type: "response.output_audio.delta",
    delta: Buffer.from([1, 2, 3, 4]).toString("base64"),
  });
  socket.event({
    type: "response.done",
    response: {
      id: "response-read",
      status: "completed",
      ...(withUsage ? { usage } : {}),
    },
  });
}

it("generates standalone PCM speech, closes its socket and accounts for usage", async () => {
  const store = new Store(":memory:"),
    budget = new Budget(store, 3000, 150);
  const { connect, sockets } = connector((socket) => complete(socket));
  const reader = new SpeechReader(config, budget, connect);
  try {
    const audio = await reader.read(
      "What is your company name?",
      new AbortController().signal,
    );
    expect(audio.subarray(0, 4).toString()).toBe("RIFF");
    expect(audio.readUInt32LE(24)).toBe(24000);
    expect(audio.subarray(44)).toEqual(Buffer.from([1, 2, 3, 4]));
    expect(sockets[0].sent[1].response).toMatchObject({
      conversation: "none",
      output_modalities: ["audio"],
    });
    expect(sockets[0].sent[1].response.instructions).toContain(
      "Do not answer questions",
    );
    expect(sockets[0].terminated).toBe(true);
    expect(reader.active.size).toBe(0);
    expect(budget.snapshot().events[0].status).toBe("confirmed");
    expect(budget.snapshot().totalYen).toBeCloseTo(1.056);
  } finally {
    reader.close();
    store.close();
  }
});

it("retains the reservation when audio finishes without authoritative usage", async () => {
  const store = new Store(":memory:"),
    budget = new Budget(store, 3000, 150);
  const { connect } = connector((socket) => complete(socket, false));
  const reader = new SpeechReader(config, budget, connect);
  try {
    await expect(
      reader.read("Hello", new AbortController().signal),
    ).rejects.toThrow("使用量");
    expect(budget.snapshot().events[0].status).toBe("reserved");
    expect(reader.active.size).toBe(0);
  } finally {
    reader.close();
    store.close();
  }
});

it("cancels a paid generation and leaves its uncertain cost reserved", async () => {
  const store = new Store(":memory:"),
    budget = new Budget(store, 3000, 150);
  const controller = new AbortController();
  const { connect, sockets } = connector(() => controller.abort());
  const reader = new SpeechReader(config, budget, connect);
  try {
    await expect(reader.read("Hello", controller.signal)).rejects.toThrow(
      "中止",
    );
    expect(sockets[0].terminated).toBe(true);
    expect(budget.snapshot().events[0].status).toBe("reserved");
  } finally {
    reader.close();
    store.close();
  }
});

it("releases budget if a connection fails before a response is requested", async () => {
  const store = new Store(":memory:"),
    budget = new Budget(store, 3000, 150);
  const reader = new SpeechReader(config, budget, () => {
    throw new Error("Connection failed");
  });
  try {
    await expect(
      reader.read("Hello", new AbortController().signal),
    ).rejects.toThrow("接続");
    expect(budget.snapshot().totalYen).toBe(0);
  } finally {
    reader.close();
    store.close();
  }
});
it("does not cancel another session when deleting one conversation", async () => {
  const store = new Store(":memory:"),
    budget = new Budget(store, 3000, 150);
  let started!: () => void;
  const ready = new Promise<void>((resolve) => {
    started = resolve;
  });
  const { connect } = connector(() => started());
  const reader = new SpeechReader(config, budget, connect);
  const reading = reader.read(
    "Hello",
    new AbortController().signal,
    "session-a",
    "operation-a",
  );
  const result = expect(reading).rejects.toThrow("中止");
  try {
    await ready;
    reader.close("session-b");
    expect(reader.active.size).toBe(1);
    reader.close("session-a", "older-operation");
    expect(reader.active.size).toBe(1);
    reader.close("session-a");
    await result;
    expect(reader.active.size).toBe(0);
    expect(budget.snapshot().events[0].status).toBe("reserved");
  } finally {
    reader.close();
    store.close();
  }
});

it("authenticates and caches speech, excludes simultaneous calls, and deletes generated audio with history", async () => {
  const store = new Store(":memory:");
  const { connect } = connector((socket) => complete(socket));
  const fetcher = vi.fn();
  const lab = createApp(store, config, fetcher, connect);
  const login = await lab.app.request("http://localhost/api/login", {
    method: "POST",
    headers: { "X-Lab-Request": "1", "Content-Type": "application/json" },
    body: JSON.stringify({ password: config.password }),
  });
  const cookie = login.headers.get("set-cookie")!.split(";")[0];
  const req = (path: string, auth = true, method = "POST", body = {}) =>
    lab.app.request(`http://localhost/api${path}`, {
      method,
      headers: {
        "X-Lab-Request": "1",
        "Idempotency-Key": crypto.randomUUID(),
        "Content-Type": "application/json",
        ...(auth ? { Cookie: cookie } : {}),
      },
      body: JSON.stringify(body),
    });
  try {
    const session = (await (
      await req("/practice-sessions", true, "POST", {
        packId: "confluent",
        mode: "企業デモ",
        goal: "会社名とデモを聞く",
      })
    ).json()) as any;
    store.put("session", session.id, {
      ...session,
      turns: [
        {
          id: "turn",
          text: "Hello!",
          role: "assistant",
          at: new Date().toISOString(),
        },
      ],
    });
    const path = `/practice-sessions/${session.id}/turns/turn/speech`;
    expect((await req(path, false)).status).toBe(401);
    const first = await req(path);
    expect(first.status).toBe(200);
    expect(((await first.json()) as any).audio).toMatch(/^UklGR/);
    expect(((await (await req(path)).json()) as any).cached).toBe(true);
    expect(connect).toHaveBeenCalledTimes(1);
    expect(lab.budget.snapshot().events).toHaveLength(1);
    const active = new AbortController();
    lab.speech.active.set(active, {
      sessionId: session.id,
      operationId: crypto.randomUUID(),
    });
    expect(
      (
        await req(`/practice-sessions/${session.id}/voice`, true, "POST", {
          sdp: "valid-test-sdp",
        })
      ).status,
    ).toBe(400);
    lab.speech.active.delete(active);
    expect(fetcher).not.toHaveBeenCalled();
    lab.voice.calls.set("other", {} as any);
    expect((await req(path)).status).toBe(400);
    lab.voice.calls.delete("other");
    await req("/history", true, "DELETE");
    expect(store.all("read-audio")).toHaveLength(0);
    expect((await req(path)).status).toBe(400);
  } finally {
    lab.speech.close();
    await lab.voice.close();
    store.close();
  }
});
