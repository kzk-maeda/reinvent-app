import { voiceRates } from "../shared/models.ts";
import WebSocket from "ws";
import { randomUUID } from "node:crypto";
import { Store } from "./db.ts";
import { Budget } from "./budget.ts";
import { instructions, type AIConfig } from "./ai.ts";
import { now, type PracticeSession, type Profile } from "../shared/domain.ts";
export type CallRecord = {
  id: string;
  callId: string;
  reservation: string;
  outcome: "pending" | "created" | "not-created" | "unknown";
  usd: number;
  uncertain: boolean;
  responseIds: string[];
  transcriptionIds: string[];
  pendingResponses?: string[];
  pendingInputs?: string[];
  usdJpy?: number;
  updatedAt: string;
};
type Call = {
  record: CallRecord;
  socket?: WebSocket;
  timer?: ReturnType<typeof setTimeout>;
  heartbeat?: ReturnType<typeof setInterval>;
  closing: boolean;
  stopPromise?: Promise<boolean>;
  creation: Promise<void>;
  created: () => void;
  lastActivity: number;
};
export class VoiceManager {
  calls = new Map<string, Call>();
  constructor(
    readonly store: Store,
    readonly budget: Budget,
    readonly config: AIConfig,
    readonly fetcher: typeof fetch = fetch,
  ) {
    for (const record of store.all<CallRecord>("voice-call")) {
      const reserved = store.db
        .prepare("SELECT detail FROM usage WHERE id=?")
        .get(record.reservation) as { detail: string } | undefined;
      record.usdJpy ??= reserved
        ? JSON.parse(reserved.detail).usdJpy || budget.usdJpy
        : budget.usdJpy;
      record.uncertain = true; // Events may have arrived after the last durable checkpoint before a crash.
      this.calls.set(record.id, {
        record,
        socket: undefined,
        closing: true,
        creation: Promise.resolve(),
        created: () => {},
        lastActivity: Date.now(),
      });
      this.store.put("voice-call", record.id, record);
    }
  }
  getSession(id: string) {
    return this.store.get<PracticeSession>("session", id);
  }
  update(id: string, update: Partial<PracticeSession>) {
    const s = this.getSession(id);
    if (s && s.status !== "completed")
      this.store.put("session", id, { ...s, ...update });
  }
  save(call: Call) {
    call.record.updatedAt = now();
    this.store.put("voice-call", call.record.id, call.record);
  }
  async start(id: string, sdp: string, profile: Profile) {
    if (!this.config.apiKey || !voiceRates[this.config.voiceModel])
      throw new Error(
        "音声APIキーまたは検証済みモデルの設定を確認してください",
      );
    if (this.calls.size)
      throw new Error(
        "実行中または停止未確認の音声があります。停止を確認してから新しく開始してください",
      );
    const reservation = this.budget.reserve(
      "voice",
      this.config.voiceModel,
      this.config.voiceReservationYen,
    );
    let created!: () => void;
    const creation = new Promise<void>((r) => {
      created = r;
    });
    const call: Call = {
      record: {
        id,
        callId: "",
        reservation,
        outcome: "pending",
        usd: 0,
        usdJpy: this.budget.usdJpy,
        uncertain: false,
        responseIds: [],
        transcriptionIds: [],
        updatedAt: now(),
      },
      closing: false,
      creation,
      created,
      lastActivity: Date.now(),
    };
    this.calls.set(id, call);
    this.save(call);
    this.update(id, { status: "connecting" });
    try {
      const body = new FormData();
      body.set("sdp", sdp);
      body.set(
        "session",
        JSON.stringify({
          type: "realtime",
          model: this.config.voiceModel,
          instructions: instructions(this.getSession(id)!, profile),
          max_output_tokens: 600,
          audio: {
            input: {
              transcription: { model: "whisper-1", language: "en" },
              turn_detection: {
                type: "server_vad",
                silence_duration_ms: 1200,
                create_response: true,
                interrupt_response: true,
              },
            },
            output: { voice: "marin", speed: profile.speed },
          },
        }),
      );
      const result = await this.fetcher(
        "https://api.openai.com/v1/realtime/calls",
        {
          method: "POST",
          headers: { Authorization: `Bearer ${this.config.apiKey}` },
          body,
          signal: AbortSignal.timeout(20000),
        },
      );
      if (!result.ok) {
        call.record.outcome = [400, 401, 403, 404, 429].includes(result.status)
          ? "not-created"
          : "unknown";
        if (call.record.outcome === "not-created")
          this.budget.release(reservation);
        throw new Error("音声APIへ接続できませんでした");
      }
      const callId =
        (result.headers.get("location") || "").split("/").at(-1) || "";
      if (!/^rtc_[\w-]+$/.test(callId)) {
        call.record.outcome = "unknown";
        throw new Error(
          "音声接続IDを確認できませんでした。新規接続を保留します",
        );
      }
      call.record.callId = callId;
      call.record.outcome = "created";
      this.save(call);
      created();
      if (call.closing) throw new Error("音声接続を取り消しました");
      const answer = await result.text();
      await new Promise<void>((resolve, reject) => {
        const socket = new WebSocket(
          `wss://api.openai.com/v1/realtime?call_id=${encodeURIComponent(callId)}`,
          { headers: { Authorization: `Bearer ${this.config.apiKey}` } },
        );
        call.socket = socket;
        const timeout = setTimeout(() => {
          socket.terminate();
          reject(new Error("音声のサーバー監視接続に失敗しました"));
        }, 10000);
        socket.on("error", () => {
          clearTimeout(timeout);
          call.record.uncertain = true;
          reject(new Error("音声の監視接続が切断されました"));
          if (!call.closing) void this.stop(id, true);
        });
        socket.on("close", () => {
          clearTimeout(timeout);
          reject(new Error("音声の監視接続が終了しました"));
          if (!call.closing) {
            call.record.uncertain = true;
            void this.stop(id, true);
          }
        });
        socket.on("message", (raw) => {
          try {
            this.event(id, JSON.parse(raw.toString()));
          } catch {
            call.record.uncertain = true;
            this.save(call);
            void this.stop(id, true);
          }
        });
        socket.on("open", () => {
          clearTimeout(timeout);
          if (call.closing) {
            socket.close();
            reject(new Error("音声接続を取り消しました"));
          } else resolve();
        });
      });
      if (call.closing) throw new Error("音声接続を取り消しました");
      this.update(id, { status: "active" });
      call.timer = setTimeout(
        () => void this.stop(id, true),
        this.config.maxSeconds * 1000,
      );
      call.heartbeat = setInterval(() => {
        if (Date.now() - call.lastActivity > 90000) void this.stop(id, true);
      }, 5000);
      return { sdp: answer, maxSeconds: this.config.maxSeconds };
    } catch (error) {
      if (call.record.outcome === "pending") call.record.outcome = "unknown";
      call.record.uncertain = true;
      if (this.calls.get(id) === call) this.save(call);
      created();
      await this.stop(id, true);
      throw error;
    }
  }
  event(id: string, event: any) {
    const call = this.calls.get(id);
    const s = this.getSession(id);
    if (!call || !s) return;
    const r = call.record;
    const rate = voiceRates[this.config.voiceModel];
    r.pendingInputs ??= [];
    r.pendingResponses ??= [];
    if (
      event.type === "response.created" &&
      event.response?.id &&
      !r.pendingResponses.includes(event.response.id)
    )
      r.pendingResponses.push(event.response.id);
    if (event.type === "input_audio_buffer.speech_started") {
      call.lastActivity = Date.now();
      if (event.item_id && !r.pendingInputs.includes(event.item_id))
        r.pendingInputs.push(event.item_id);
      else if (!event.item_id) r.uncertain = true;
    }
    if (
      event.type === "conversation.item.input_audio_transcription.completed" ||
      event.type === "response.output_audio_transcript.done"
    ) {
      const tid = event.item_id || randomUUID();
      const user = event.type.startsWith("conversation");
      if (user)
        r.pendingInputs = r.pendingInputs.filter((item) => item !== tid);
      if (
        typeof event.transcript === "string" &&
        !s.turns.some((t) => t.id === tid)
      ) {
        s.turns.push({
          id: tid,
          role: user ? "user" : "assistant",
          text: event.transcript,
          at: now(),
          heard: user,
        });
        this.store.put("session", id, s);
      }
      if (user && !r.transcriptionIds.includes(tid)) {
        r.transcriptionIds.push(tid);
        const u = event.usage;
        if (
          u?.type === "duration" &&
          Number.isFinite(u.seconds) &&
          u.seconds >= 0
        )
          r.usd += (u.seconds / 60) * 0.006;
        else r.uncertain = true;
      }
    }
    if (event.type === "output_audio_buffer.stopped") {
      const last = [...s.turns].reverse().find((t) => t.role === "assistant");
      if (last) {
        last.heard = true;
        this.store.put("session", id, s);
      }
    }
    if (
      event.type === "conversation.item.truncated" ||
      event.type === "output_audio_buffer.cleared"
    ) {
      const last = event.item_id
        ? s.turns.find((t) => t.id === event.item_id)
        : [...s.turns].reverse().find((t) => t.role === "assistant");
      if (last) {
        last.heard = false;
        this.store.put("session", id, s);
      }
    }
    if (
      event.type === "response.done" &&
      !r.responseIds.includes(event.response.id)
    ) {
      r.responseIds.push(event.response.id);
      r.pendingResponses = r.pendingResponses.filter(
        (item) => item !== event.response.id,
      );
      const u = event.response.usage;
      const i = u?.input_token_details,
        o = u?.output_token_details;
      if (
        !u ||
        ![
          u.input_tokens,
          u.output_tokens,
          i?.text_tokens,
          i?.audio_tokens,
          o?.text_tokens,
          o?.audio_tokens,
        ].every(Number.isFinite)
      )
        r.uncertain = true;
      else
        r.usd +=
          (i.text_tokens * rate.textInput +
            i.audio_tokens * rate.audioInput +
            o.text_tokens * rate.textOutput +
            o.audio_tokens * rate.audioOutput) /
          1e6;
      if (
        r.usd * (r.usdJpy || this.budget.usdJpy) >
        this.config.voiceReservationYen * 0.8
      )
        void this.stop(id, true);
    }
    this.save(call);
    if (event.type === "error") {
      r.uncertain = true;
      void this.stop(id, true);
    }
  }
  heartbeat(id: string) {
    const c = this.calls.get(id);
    if (c && !c.closing) c.lastActivity = Date.now();
  }
  stop(id: string, interrupted = false): Promise<boolean> {
    const call = this.calls.get(id);
    if (!call) return Promise.resolve(true);
    if (call.stopPromise) return call.stopPromise;
    call.closing = true;
    if (
      call.record.pendingInputs?.length ||
      call.record.pendingResponses?.length
    )
      call.record.uncertain = true;
    clearTimeout(call.timer);
    clearInterval(call.heartbeat);
    call.stopPromise = (async () => {
      await call.creation;
      let stopped = call.record.outcome === "not-created";
      if (call.record.callId) {
        try {
          const result = await this.fetcher(
            `https://api.openai.com/v1/realtime/calls/${call.record.callId}/hangup`,
            {
              method: "POST",
              headers: { Authorization: `Bearer ${this.config.apiKey}` },
              signal: AbortSignal.timeout(10000),
            },
          );
          stopped = result.ok || result.status === 404;
        } catch {
          call.record.uncertain = true;
        }
      }
      call.socket?.close();
      if (
        call.record.pendingInputs?.length ||
        call.record.pendingResponses?.length
      )
        call.record.uncertain = true;
      if (stopped) {
        if (this.calls.get(id) !== call) return true;
        if (
          !call.record.uncertain &&
          call.record.responseIds.length &&
          call.record.transcriptionIds.length
        )
          this.budget.confirm(call.record.reservation, call.record.usd, {
            model: this.config.voiceModel,
            rateDate: "2026-11-17",
            responseIds: call.record.responseIds,
            transcriptionIds: call.record.transcriptionIds,
          });
        else if (call.record.outcome !== "not-created")
          this.store.put("voice-accounting", id, {
            ...call.record,
            reason: "使用量が未確定です。請求記録と照合してください。",
          });
        this.store.remove("voice-call", id);
        this.calls.delete(id);
      } else {
        this.save(call);
        call.stopPromise = undefined;
      }
      if (!this.calls.has(id) || this.calls.get(id) === call)
        this.update(id, {
          status: interrupted || !stopped ? "interrupted" : "ready",
        });
      return stopped;
    })();
    return call.stopPromise;
  }
  async recover() {
    await Promise.all(
      [...this.calls.keys()]
        .filter((id) => this.calls.get(id)!.record.callId)
        .map((id) => this.stop(id, true)),
    );
  }
  async close() {
    await Promise.all([...this.calls.keys()].map((id) => this.stop(id, true)));
  }
}
