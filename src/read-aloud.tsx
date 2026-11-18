import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "./api.ts";
import type { Turn } from "../shared/domain.ts";

export function englishVoices(voices: SpeechSynthesisVoice[]) {
  const score = (voice: SpeechSynthesisVoice) =>
    (/natural|neural|enhanced|premium/i.test(voice.name) ? 50 : 0) +
    (/google|microsoft|samantha|daniel|ava|serena/i.test(voice.name) ? 20 : 0) +
    (!voice.localService ? 10 : 0) +
    (/^en-US$/i.test(voice.lang) ? 3 : 0);
  return voices
    .filter((voice) => /^en([-_]|$)/i.test(voice.lang))
    .sort((a, b) => score(b) - score(a));
}
export function useReadAloud(
  sessionId: string,
  aiAvailable: boolean,
  speed: number,
  reservationYen: number,
  disabled: boolean,
  refreshUsage: () => Promise<void>,
) {
  const [mode, setMode] = useState(aiAvailable ? "ai" : "device");
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [voiceUri, setVoiceUri] = useState(
    sessionStorage.getItem("reading-voice") || "",
  );
  const [loading, setLoading] = useState(false);
  const [reading, setReading] = useState(false);
  const [hasAudio, setHasAudio] = useState(false);
  const [error, setError] = useState("");
  const player = useRef<HTMLAudioElement>(null);
  const bindPlayer = useCallback((element: HTMLAudioElement | null) => {
    if (!element) player.current?.pause();
    player.current = element;
  }, []);
  const request = useRef<AbortController | undefined>(undefined);
  const requestId = useRef<string | undefined>(undefined);
  const generation = useRef(0);
  const utterance = useRef<SpeechSynthesisUtterance | undefined>(undefined);
  const selected =
    voices.find((voice) => voice.voiceURI === voiceUri) || voices[0];
  const stop = useCallback(() => {
    generation.current++;
    const operationId = requestId.current;
    requestId.current = undefined;
    request.current?.abort();
    request.current = undefined;
    player.current?.pause();
    if ("speechSynthesis" in window) speechSynthesis.cancel();
    utterance.current = undefined;
    setReading(false);
    setLoading(false);
    if (operationId)
      void api(`/practice-sessions/${sessionId}/speech/stop`, { operationId })
        .finally(() => refreshUsage())
        .catch(() => {});
  }, [sessionId, refreshUsage]);
  useEffect(() => {
    if (!("speechSynthesis" in window)) return;
    const update = () => setVoices(englishVoices(speechSynthesis.getVoices()));
    update();
    speechSynthesis.addEventListener("voiceschanged", update);
    return () => speechSynthesis.removeEventListener("voiceschanged", update);
  }, []);
  useEffect(() => {
    const hidden = () => {
      if (document.hidden) stop();
    };
    document.addEventListener("visibilitychange", hidden);
    return () => {
      document.removeEventListener("visibilitychange", hidden);
      stop();
    };
  }, [stop]);
  useEffect(() => {
    if (disabled) stop();
  }, [disabled, stop]);
  const speak = async (turn: Turn) => {
    stop();
    setError("");
    const token = generation.current;
    if (mode === "device") {
      if (!selected || !("speechSynthesis" in window)) {
        setError(
          "端末に英語音声がありません。英語音声の追加かAI音声への切り替えをお試しください",
        );
        return;
      }
      const u = new SpeechSynthesisUtterance(turn.text);
      utterance.current = u;
      u.voice = selected;
      u.lang = selected.lang;
      u.rate = speed;
      u.pitch = 1;
      u.onend = () => {
        if (token === generation.current) setReading(false);
      };
      u.onerror = () => {
        if (token === generation.current) {
          setReading(false);
          setError(
            "端末の音声を再生できませんでした。別の英語音声を選択できます",
          );
        }
      };
      setReading(true);
      speechSynthesis.speak(u);
      return;
    }
    const controller = new AbortController();
    const operationId = crypto.randomUUID();
    requestId.current = operationId;
    request.current = controller;
    setLoading(true);
    try {
      const result = await api<{ audio: string }>(
        `/practice-sessions/${sessionId}/turns/${turn.id}/speech`,
        {},
        "POST",
        operationId,
        controller.signal,
      );
      if (token !== generation.current || !player.current) return;
      player.current.src = `data:audio/wav;base64,${result.audio}`;
      player.current.playbackRate = speed;
      player.current.preservesPitch = true;
      setHasAudio(true);
      setReading(true);
      try {
        await player.current.play();
      } catch {
        setReading(false);
        setError("音声を準備しました。下の音声プレイヤーで再生してください");
      }
    } catch (e) {
      if (token === generation.current && !controller.signal.aborted)
        setError(e instanceof Error ? e.message : "音声の準備に失敗しました");
    } finally {
      if (token === generation.current) {
        setLoading(false);
        request.current = undefined;
        requestId.current = undefined;
      }
      if (!controller.signal.aborted) await refreshUsage().catch(() => {});
    }
  };
  const controls = (
    <section className="card padded">
      <h2>「聞く」の音声</h2>
      <label htmlFor="reading-method">読み上げ方法</label>
      <select
        id="reading-method"
        value={mode}
        disabled={disabled}
        onChange={(event) => {
          stop();
          setMode(event.target.value);
          setError("");
        }}
      >
        <option value="ai" disabled={!aiAvailable}>
          自然なAI音声（API費用）
        </option>
        <option value="device">端末の英語音声（API費用なし）</option>
      </select>
      {mode === "device" ? (
        <>
          <label htmlFor="reading-voice">端末の英語音声</label>
          <select
            id="reading-voice"
            value={selected?.voiceURI || ""}
            disabled={!voices.length || disabled}
            onChange={(event) => {
              stop();
              setVoiceUri(event.target.value);
              sessionStorage.setItem("reading-voice", event.target.value);
            }}
          >
            {!voices.length && (
              <option value="">英語音声が見つかりません</option>
            )}
            {voices.map((voice) => (
              <option key={voice.voiceURI} value={voice.voiceURI}>
                {voice.name} / {voice.lang}
              </option>
            ))}
          </select>
          <p className="muted">
            音色は端末の音声に依存します。AI音声にはOpenAI接続が必要です。
          </p>
        </>
      ) : (
        <p className="muted">
          AIが生成した音声です。生成時に最大¥{reservationYen}
          の予算を予約し、使用量で精算します。保存済み音声は再利用します。停止までの生成分にも費用が発生する場合があります。
        </p>
      )}
      {loading && <p role="status">読み上げ音声を準備しています…</p>}
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      <audio
        className="reading-audio"
        ref={bindPlayer}
        controls
        hidden={!hasAudio || disabled}
        aria-label="読み上げ音声"
        onEnded={() => setReading(false)}
        onPause={() => setReading(false)}
        onPlay={() => setReading(true)}
      />
      <button disabled={!loading && !reading} onClick={stop}>
        読み上げを停止
      </button>
    </section>
  );
  return {
    speak,
    stop,
    controls,
    loading,
    available: mode === "ai" ? aiAvailable : !!selected,
  };
}
