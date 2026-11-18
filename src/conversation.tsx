import { useEffect, useRef, useState } from "react";
import type { PageProps } from "./main.tsx";
import type { PracticeSession, Turn } from "../shared/domain.ts";
import { api } from "./api.ts";
export default function Conversation(props: PageProps & { id: string }) {
  const s = props.data.sessions.find((s) => s.id === props.id);
  if (!s)
    return (
      <>
        <h1>会話が見つかりません</h1>
        <a href="#/practice">新しい会話へ</a>
      </>
    );
  return <Session key={s.id} {...props} initial={s} />;
}
function Session({
  initial,
  data,
  run,
  refresh,
  busy,
}: PageProps & { initial: PracticeSession }) {
  const [session, setSession] = useState(initial);
  const scenario = data.packs.find((p) => p.id === session.packId)?.scenario;
  const [text, setText] = useState("");
  const [hint, setHint] = useState("");
  const [hintText, setHintText] = useState("");
  const [state, setState] = useState("ready");
  const [muted, setMuted] = useState(false);
  const [transcript, setTranscript] = useState(
    initial.training && data.profile.showTranscript,
  );
  const [translation, setTranslation] = useState(data.profile.showTranslation);
  const [translations, setTranslations] = useState<Record<string, string>>({});
  const [elapsed, setElapsed] = useState(0);
  const pc = useRef<RTCPeerConnection | undefined>(undefined);
  const stream = useRef<MediaStream | undefined>(undefined);
  const dc = useRef<RTCDataChannel | undefined>(undefined);
  const audio = useRef<HTMLAudioElement>(null);
  const generation = useRef(0);
  const activeRef = useRef(false);
  const list = useRef<HTMLDivElement>(null);
  const statusLabels: Record<string, string> = {
    ready: "準備完了",
    connecting: "接続中",
    active: "聞き取り中",
    responding: "応答中",
    muted: "ミュート",
    ended: "終了",
    failed: "接続を終了しました",
  };
  const dispose = () => {
    generation.current++;
    activeRef.current = false;
    stream.current?.getTracks().forEach((t) => t.stop());
    stream.current = undefined;
    dc.current?.close();
    dc.current = undefined;
    pc.current?.close();
    pc.current = undefined;
    if (audio.current) {
      audio.current.pause();
      audio.current.srcObject = null;
    }
    if ("speechSynthesis" in window) speechSynthesis.cancel();
  };
  const stop = async () => {
    dispose();
    setMuted(false);
    setState("ended");
    const s = await api<PracticeSession>(
      `/practice-sessions/${session.id}/stop`,
      {},
    );
    setSession(s);
    await refresh();
  };
  useEffect(() => {
    const hidden = () => {
      if (document.hidden && activeRef.current) {
        dispose();
        setState("ended");
        void api<PracticeSession>(`/practice-sessions/${initial.id}/stop`, {})
          .then(setSession)
          .catch(() => {});
      }
    };
    const unload = () => {
      if (activeRef.current) {
        dispose();
        void fetch(`/api/practice-sessions/${initial.id}/stop`, {
          method: "POST",
          credentials: "same-origin",
          keepalive: true,
          headers: { "X-Lab-Request": "1", "Content-Type": "application/json" },
          body: "{}",
        });
      }
    };
    document.addEventListener("visibilitychange", hidden);
    window.addEventListener("pagehide", unload);
    return () => {
      const wasActive = activeRef.current;
      dispose();
      document.removeEventListener("visibilitychange", hidden);
      window.removeEventListener("pagehide", unload);
      if (wasActive)
        void api(`/practice-sessions/${initial.id}/stop`, {}).catch(() => {});
    };
  }, [initial.id]);
  useEffect(() => {
    if (!activeRef.current) return;
    const timer = setInterval(() => {
      setElapsed((t) => t + 1);
      void api<PracticeSession>(`/practice-sessions/${session.id}`)
        .then((s) => {
          setSession(s);
          if (s.status !== "active" && s.status !== "connecting") {
            dispose();
            setState("ended");
          }
        })
        .catch(() => {
          dispose();
          setState("failed");
        });
    }, 1000);
    const heart = setInterval(
      () =>
        void api(`/practice-sessions/${session.id}/heartbeat`, {}).catch(() => {
          dispose();
          setState("failed");
        }),
      15000,
    );
    return () => {
      clearInterval(timer);
      clearInterval(heart);
    };
  }, [state === "active" || state === "responding" || state === "muted"]);
  useEffect(() => {
    if (list.current) list.current.scrollTop = list.current.scrollHeight;
  }, [session.turns.length]);
  async function startVoice() {
    if (!navigator.mediaDevices?.getUserMedia || !window.RTCPeerConnection)
      throw new Error(
        "このブラウザでは音声接続できません。テキスト練習を使えます",
      );
    const turn = ++generation.current;
    activeRef.current = true;
    setState("connecting");
    setElapsed(0);
    try {
      const mic = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true },
        video: false,
      });
      if (turn !== generation.current) {
        mic.getTracks().forEach((t) => t.stop());
        return;
      }
      stream.current = mic;
      const peer = new RTCPeerConnection();
      pc.current = peer;
      peer.addTrack(mic.getAudioTracks()[0], mic);
      peer.ontrack = (e) => {
        if (audio.current) {
          audio.current.srcObject = e.streams[0];
          void audio.current
            .play()
            .catch(() =>
              setHint(
                "音声再生がブロックされました。音声の再生ボタンを押してください。",
              ),
            );
        }
      };
      peer.onconnectionstatechange = () => {
        if (
          ["failed", "disconnected", "closed"].includes(peer.connectionState) &&
          activeRef.current
        )
          void run(
            stop,
            "接続を終了しました。確定した発話は保存されています。",
          );
      };
      const channel = peer.createDataChannel("oai-events");
      dc.current = channel;
      channel.onmessage = (e) => {
        try {
          const event = JSON.parse(e.data);
          if (event.type === "response.created") setState("responding");
          if (
            event.type === "output_audio_buffer.stopped" ||
            event.type === "input_audio_buffer.speech_started"
          )
            setState(mic.getAudioTracks()[0].enabled ? "active" : "muted");
          if (event.type === "error") {
            void run(async () => {
              await stop();
              throw new Error(
                "音声接続でエラーが発生しました。テキスト練習へ切り替えられます",
              );
            });
          }
        } catch {}
      };
      const offer = await peer.createOffer();
      await peer.setLocalDescription(offer);
      const result = await api<{ sdp: string; maxSeconds: number }>(
        `/practice-sessions/${session.id}/voice`,
        { sdp: offer.sdp },
      );
      if (turn !== generation.current) {
        await api(`/practice-sessions/${session.id}/stop`, {});
        return;
      }
      await peer.setRemoteDescription({ type: "answer", sdp: result.sdp });
      setState("active");
    } catch (e) {
      dispose();
      setState("failed");
      void api(`/practice-sessions/${session.id}/stop`, {}).catch(() => {});
      throw new Error(
        e instanceof DOMException && e.name === "NotAllowedError"
          ? "マイクが許可されていません。ブラウザ設定で許可するか、テキスト練習をお使いください。"
          : e instanceof Error
            ? e.message
            : "音声を開始できませんでした",
      );
    }
  }
  const toggleMute = () => {
    const enabled = muted;
    stream.current?.getAudioTracks().forEach((t) => {
      t.enabled = enabled;
    });
    setMuted(!muted);
    setState(enabled ? "active" : "muted");
  };
  const interrupt = () => {
    if (dc.current?.readyState === "open") {
      dc.current.send(JSON.stringify({ type: "response.cancel" }));
      dc.current.send(JSON.stringify({ type: "output_audio_buffer.clear" }));
    }
    if ("speechSynthesis" in window) speechSynthesis.cancel();
    setState(muted ? "muted" : "active");
  };
  const speak = (t: string) => {
    if (!("speechSynthesis" in window)) return;
    speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(t);
    u.lang = "en-US";
    u.rate = data.profile.speed;
    speechSynthesis.speak(u);
  };
  const finished = session.status === "completed";
  const connected = ["connecting", "active", "responding", "muted"].includes(
    state,
  );
  const send = async () => {
    const sentText = text;
    const s = await api<PracticeSession>(
      `/practice-sessions/${session.id}/turns`,
      { text: sentText },
    );
    setSession(s);
    setText((current) => (current === sentText ? "" : current));
    await refresh();
  };
  return (
    <>
      <a className="back" href="#/practice">
        ← 会話の準備へ
      </a>
      <div className="page-heading">
        <p className="eyebrow">{session.mode} / CONVERSATION LAB</p>
        <h1>聞きたいことから、話そう。</h1>
        <p className="muted">
          {data.packs.find((p) => p.id === session.packId)?.partner}
        </p>
      </div>
      {session.provider === "simulator" && (
        <p className="warning">
          操作検証モード：応答と講評は固定例です。実際の英語力・製品知識の評価は行いません。
        </p>
      )}
      <div className="goal-strip">
        <span className="eyebrow">TODAY'S GOAL</span>
        <p>{session.goal}</p>
        <span className="pill">
          {session.training ? "学習モード" : "本番モード"}
        </span>
      </div>
      <div className="conversation-layout">
        <section className="card conversation">
          <div className="conversation-status">
            <span className="dot" />
            {statusLabels[state]}{" "}
            {connected && (
              <span>
                {Math.floor(elapsed / 60)}:
                {String(elapsed % 60).padStart(2, "0")} / 最大10分
              </span>
            )}
          </div>
          <div className="turn-list" ref={list}>
            {!session.turns.length && (
              <div className="conversation-empty">
                <div className="voice-orbit">re:</div>
                <h2>最初の一言は、あなたから。</h2>
                <p lang="en">
                  “{scenario?.opening || "Hi! Could you give me a quick demo?"}”
                </p>
                <p className="muted">言い直しても、聞き返しても大丈夫。</p>
              </div>
            )}
            {session.turns.map((t) => (
              <article className={`turn ${t.role}`} key={t.id}>
                <span className="eyebrow">
                  {t.role === "user" ? "YOU" : "PARTNER"}
                </span>
                {transcript || finished ? (
                  <p lang="en">{t.text}</p>
                ) : (
                  <p className="muted">会話中の文字起こしは非表示です</p>
                )}
                {translation && translations[t.id] && (
                  <p lang="ja">{translations[t.id]}</p>
                )}
                {(transcript || finished) && (
                  <div className="turn-actions">
                    <button
                      disabled={busy}
                      onClick={() =>
                        void run(() =>
                          api("/review-items", {
                            en: t.text,
                            ja: "会話で使った表現",
                            source: {
                              kind: "session",
                              id: session.id,
                              turnId: t.id,
                            },
                          }),
                        )
                      }
                    >
                      保存 ＋
                    </button>
                    <button onClick={() => speak(t.text)}>聞く</button>
                    {translation && (
                      <button
                        disabled={busy}
                        onClick={() =>
                          void run(async () => {
                            const r = await api("/explain", {
                              text: `日本語訳: ${t.text}`,
                            });
                            setTranslations({
                              ...translations,
                              [t.id]: r.text,
                            });
                          }, "訳を表示しました")
                        }
                      >
                        日本語訳
                      </button>
                    )}
                    {t.role === "user" && (
                      <CorrectTurn
                        turn={t}
                        busy={busy || connected}
                        update={(value) =>
                          run(async () => {
                            const s = await api<PracticeSession>(
                              `/practice-sessions/${session.id}/turns/${t.id}`,
                              { text: value },
                              "PATCH",
                            );
                            setSession(s);
                            await refresh();
                          }, "文字起こしを修正しました。講評は再作成できます。")
                        }
                      />
                    )}
                  </div>
                )}
              </article>
            ))}
          </div>
          <form
            className="text-composer"
            onSubmit={(e) => {
              e.preventDefault();
              void run(send, "発話を保存しました");
            }}
          >
            <label>
              テキストで話す
              <textarea
                value={text}
                onChange={(e) => setText(e.target.value)}
                placeholder="What would you like to ask?"
                lang="en"
                required
                maxLength={2000}
                disabled={
                  finished || connected || session.status === "interrupted"
                }
              />
            </label>
            <button
              className="primary"
              disabled={
                busy ||
                finished ||
                connected ||
                session.status === "interrupted"
              }
            >
              送信 ↑
            </button>
          </form>
          <div className="voice-controls">
            <button
              className="primary"
              disabled={
                busy ||
                connected ||
                finished ||
                !data.connections.voice ||
                session.status === "interrupted"
              }
              onClick={() => void run(startVoice, "音声に接続しました")}
            >
              音声で話す ◉
            </button>
            <button
              disabled={!connected}
              aria-pressed={muted}
              onClick={toggleMute}
            >
              {muted ? "ミュート解除" : "ミュート"}
            </button>
            <button disabled={!connected} onClick={interrupt}>
              割り込む
            </button>
            <button
              className="danger"
              disabled={!connected}
              onClick={() => void run(stop, "音声を終了しました")}
            >
              音声を終了 ■
            </button>
          </div>
          <audio ref={audio} autoPlay controls aria-label="相手の音声" />
          <p className="muted">
            別画面へ移動・背景化・画面ロックでは接続を終了します。再開は明示操作が必要です。
          </p>
          {session.status === "interrupted" && (
            <p className="warning">
              接続が中断しました。振り返りを保存し、同じ目的で再挑戦できます。
              <button
                disabled={busy}
                onClick={() =>
                  void run(async () => {
                    const s = await api<PracticeSession>(
                      `/practice-sessions/${session.id}/resume`,
                      {},
                    );
                    setSession(s);
                    setState("ready");
                    await refresh();
                  }, "再開の準備ができました。音声は開始ボタンを押すまで接続しません。")
                }
              >
                停止を確認して再開する
              </button>
            </p>
          )}
        </section>
        <aside>
          {scenario && (
            <details className="card padded">
              <summary>このシナリオの質問例</summary>
              <p className="muted">
                架空のチームの開発手法を聞く練習です。質問を選ぶと入力欄に入ります。
              </p>
              <button
                className="hint-phrase"
                lang="en"
                disabled={connected || finished}
                onClick={() => setText(scenario.opening)}
              >
                {scenario.opening}
              </button>
              {scenario.topics.map((topic) => (
                <section key={topic.label}>
                  <h3>{topic.label}</h3>
                  {[topic.question, topic.followUp].map((question) => (
                    <button
                      key={question}
                      className="hint-phrase"
                      lang="en"
                      disabled={connected || finished}
                      onClick={() => setText(question)}
                    >
                      {question}
                    </button>
                  ))}
                </section>
              ))}
              <h3>自分の理解を確認する</h3>
              <button
                className="hint-phrase"
                lang="en"
                disabled={connected || finished}
                onClick={() => setText(scenario.confirmation)}
              >
                {scenario.confirmation}
              </button>
            </details>
          )}
          <section className="card padded">
            <h2>困ったときの一言</h2>
            {[
              "Could you say that again?",
              "Could you speak more slowly?",
              "Could you give me an example?",
            ].map((q) => (
              <button
                className="hint-phrase"
                lang="en"
                key={q}
                disabled={connected || finished}
                onClick={() => setText(q)}
              >
                {q}
              </button>
            ))}
            <label>
              日本語で「言いたいこと」
              <textarea
                value={hintText}
                onChange={(e) => setHintText(e.target.value)}
                maxLength={2000}
              />
            </label>
            <button
              disabled={busy || !hintText}
              onClick={() =>
                void run(async () => {
                  const r = await api(`/practice-sessions/${session.id}/hint`, {
                    text: hintText,
                  });
                  setHint(r.text);
                }, "ヒントを表示しました")
              }
            >
              英語のヒントを見る
            </button>
            {hint && <p className="hint-result">{hint}</p>}
            <p className="muted">ヒント利用：{session.hintCount} 回</p>
          </section>
          <section className="card padded">
            <h2>表示設定</h2>
            <label className="check">
              <input
                type="checkbox"
                checked={transcript}
                disabled={!session.training && !finished}
                onChange={(e) => setTranscript(e.target.checked)}
              />
              英語文字起こし
            </label>
            <label className="check">
              <input
                type="checkbox"
                checked={translation}
                disabled={!session.training && !finished}
                onChange={(e) => setTranslation(e.target.checked)}
              />
              日本語訳（必要時に取得）
            </label>
            <button
              className="primary"
              disabled={
                busy ||
                connected ||
                !session.turns.some((t) => t.role === "user")
              }
              onClick={() =>
                void run(async () => {
                  const s = await api<PracticeSession>(
                    `/practice-sessions/${session.id}/finish`,
                    {},
                  );
                  setSession(s);
                  await refresh();
                }, "振り返りを保存しました")
              }
            >
              振り返りを作る →
            </button>
          </section>
        </aside>
      </div>
      {session.feedback && (
        <section className="feedback card padded">
          <span className="eyebrow">A NOTE FOR NEXT TIME</span>
          <h2>次の会話につながる振り返り</h2>
          <p>{session.feedback.positive}</p>
          <h3>次に意識すること</h3>
          <ul>
            {session.feedback.improvements.map((i, n) => (
              <li key={n}>{i}</li>
            ))}
          </ul>
          <p>
            目的：{session.feedback.goal} ·{" "}
            {session.feedback.achieved
              ? "達成の根拠あり"
              : "次の練習で確認しましょう"}
          </p>
          {session.feedback.expressions.map((e, i) => (
            <div className="feedback-expression" key={i}>
              <p lang="en" className="english">
                {e.en}
              </p>
              <p>{e.ja}</p>
              <button
                disabled={busy}
                onClick={() =>
                  void run(async () => {
                    await api("/review-items", {
                      en: e.en,
                      ja: e.ja,
                      source: {
                        kind: "session",
                        id: session.id,
                        turnId: e.turnId,
                      },
                    });
                    await refresh();
                  })
                }
              >
                復習に保存 ＋
              </button>
            </div>
          ))}
        </section>
      )}
    </>
  );
}
function CorrectTurn({
  turn,
  busy,
  update,
}: {
  turn: Turn;
  busy: boolean;
  update: (value: string) => Promise<unknown>;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const [text, setText] = useState(turn.text);
  return (
    <>
      <button disabled={busy} onClick={() => ref.current?.showModal()}>
        誤認識を修正
      </button>
      <dialog ref={ref} aria-label="文字起こしを修正">
        <h2>文字起こしを修正</h2>
        <label>
          発話の内容
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            lang="en"
            maxLength={2000}
          />
        </label>
        <div className="actions">
          <button onClick={() => ref.current?.close()}>戻る</button>
          <button
            disabled={busy || !text}
            onClick={() => void update(text).then(() => ref.current?.close())}
          >
            修正を保存
          </button>
        </div>
      </dialog>
    </>
  );
}
