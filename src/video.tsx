import { useEffect, useRef, useState } from "react";
import type { PageProps } from "./main.tsx";
import { api, go } from "./api.ts";
import {
  activeCue,
  parseSubtitles,
  now,
  packageSchema,
  type Material,
  type SubtitlePackage,
  type PracticeSession,
} from "../shared/domain.ts";
declare global {
  interface Window {
    YT: any;
    onYouTubeIframeAPIReady?: () => void;
  }
}
let youtubeReady: Promise<void> | undefined;
function loadYouTube() {
  if (window.YT?.Player) return Promise.resolve();
  if (!youtubeReady)
    youtubeReady = new Promise((resolve, reject) => {
      window.onYouTubeIframeAPIReady = () => resolve();
      const script = document.createElement("script");
      script.src = "https://www.youtube.com/iframe_api";
      script.onerror = () => {
        youtubeReady = undefined;
        reject(new Error("YouTubeプレイヤーを読み込めませんでした"));
      };
      document.head.append(script);
    });
  return youtubeReady;
}
function format(ms: number) {
  const s = Math.max(0, Math.floor(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}
export default function Video(props: PageProps & { id: string }) {
  const m = props.data.materials.find((m) => m.id === props.id);
  if (!m)
    return (
      <>
        <h1>教材が見つかりません</h1>
        <a href="#/materials">一覧へ</a>
      </>
    );
  return <Player key={m.id} {...props} material={m} />;
}
function Player({
  material: m,
  data,
  run,
  refresh,
  busy,
}: PageProps & { material: Material }) {
  const stored = JSON.parse(sessionStorage.getItem(`video-${m.id}`) || "{}");
  const [time, setTime] = useState(m.positionMs);
  const timeRef = useRef(time);
  const [playing, setPlaying] = useState(false);
  const playingRef = useRef(false);
  const [speed, setSpeed] = useState(1);
  const speedRef = useRef(1);
  const [en, setEn] = useState(stored.en ?? true);
  const [ja, setJa] = useState(stored.ja ?? false);
  const [peek, setPeek] = useState(false);
  const [follow, setFollow] = useState(true);
  const following = useRef(true);
  const [offset, setOffset] = useState(m.offsetMs);
  const [a, setA] = useState<number>();
  const [b, setB] = useState<number>();
  const loopRef = useRef({ a, b });
  const player = useRef<any>(null);
  const host = useRef<HTMLDivElement>(null);
  const [ready, setReady] = useState(m.fixture);
  const [playerError, setPlayerError] = useState("");
  const captionsRef = useRef<HTMLDivElement>(null);
  const active = activeCue(m.captions?.cues || [], time, offset);
  const [captionPage, setCaptionPage] = useState(0);
  const cueIndex = active
    ? (m.captions?.cues.findIndex((c) => c.cueId === active.cueId) ?? 0)
    : 0;
  const visiblePage = follow
    ? Math.floor(Math.max(0, cueIndex) / 80)
    : captionPage;
  const pageCount = Math.ceil((m.captions?.cues.length || 0) / 80);
  const [explanation, setExplanation] = useState("");
  const updateTime = (ms: number) => {
    timeRef.current = ms;
    setTime(ms);
  };
  useEffect(() => {
    speedRef.current = speed;
  }, [speed]);
  useEffect(() => {
    loopRef.current = { a, b };
  }, [a, b]);
  useEffect(() => {
    sessionStorage.setItem(`video-${m.id}`, JSON.stringify({ en, ja }));
  }, [en, ja, m.id]);
  useEffect(() => {
    let disposed = false;
    if (!m.fixture)
      void loadYouTube()
        .then(() => {
          if (disposed || !host.current) return;
          const child = document.createElement("div");
          host.current.append(child);
          player.current = new window.YT.Player(child, {
            host: "https://www.youtube-nocookie.com",
            videoId: m.youtubeId,
            playerVars: {
              playsinline: 1,
              origin: location.origin,
              start: Math.floor(m.positionMs / 1000),
            },
            events: {
              onReady: () => setReady(true),
              onStateChange: (event: any) => {
                playingRef.current = event.data === 1;
                setPlaying(event.data === 1);
              },
              onError: () =>
                setPlayerError(
                  "この動画は埋め込み再生できません。元のYouTubeページをご確認ください。",
                ),
            },
          });
        })
        .catch((e) => setPlayerError(e.message));
    const save = () =>
      void api(
        `/materials/${m.id}`,
        { positionMs: Math.floor(timeRef.current) },
        "PATCH",
      ).catch(() => {});
    const saveTimer = setInterval(save, 10000);
    const hidden = () => {
      if (document.hidden) {
        player.current?.pauseVideo?.();
        playingRef.current = false;
        setPlaying(false);
        save();
      }
    };
    document.addEventListener("visibilitychange", hidden);
    return () => {
      disposed = true;
      clearInterval(saveTimer);
      save();
      document.removeEventListener("visibilitychange", hidden);
      player.current?.destroy?.();
    };
  }, [m.id]);
  useEffect(() => {
    if (!playing) return;
    const timer = setInterval(() => {
      if (document.hidden) return;
      let ms = m.fixture
        ? timeRef.current + 250 * speedRef.current
        : (player.current?.getCurrentTime?.() || 0) * 1000;
      const { a, b } = loopRef.current;
      if (a !== undefined && b !== undefined && b > a && ms >= b) {
        ms = a;
        player.current?.seekTo(a / 1000, true);
      }
      if (m.fixture && ms >= 20000) {
        ms = 20000;
        playingRef.current = false;
        setPlaying(false);
      }
      updateTime(ms);
    }, 250);
    return () => clearInterval(timer);
  }, [playing, m.fixture]);
  useEffect(() => {
    if (following.current && active && captionsRef.current) {
      const element = captionsRef.current.querySelector(
        `[data-cue="${CSS.escape(active.cueId)}"]`,
      ) as HTMLElement | null;
      if (element) {
        const pane = captionsRef.current;
        if (
          element.offsetTop < pane.scrollTop ||
          element.offsetTop + element.offsetHeight >
            pane.scrollTop + pane.clientHeight
        )
          pane.scrollTo({
            top: element.offsetTop - pane.offsetTop - 20,
            behavior: matchMedia("(prefers-reduced-motion: reduce)").matches
              ? "instant"
              : "smooth",
          });
      }
    }
  }, [active?.cueId]);
  function seek(ms: number) {
    const t = Math.max(0, ms);
    updateTime(t);
    player.current?.seekTo(t / 1000, true);
  }
  function play() {
    if (playing) {
      player.current?.pauseVideo?.();
      setPlaying(false);
      playingRef.current = false;
    } else {
      player.current?.playVideo?.();
      setPlaying(true);
      playingRef.current = true;
    }
  }
  const bookmark = () => {
    const cue = active;
    if (!cue) return;
    void run(async () => {
      await api("/review-items", {
        en: cue.correctedText || cue.originalText,
        ja: cue.translation || "動画で聞いた表現",
        source: {
          kind: "material",
          id: m.id,
          cueId: cue.cueId,
          positionMs: cue.startMs + offset,
        },
      });
      await refresh();
    });
  };
  return (
    <>
      <a className="back" href="#/materials">
        ← セッション一覧
      </a>
      <div className="page-heading">
        <p className="eyebrow">{m.topic} / LISTENING LAB</p>
        <h1>{m.title}</h1>
        <p className="muted">{m.reason}</p>
      </div>
      {m.fixture && (
        <p className="warning">
          独自作成した字幕の操作確認サンプルです。実動画・実STTの結果ではありません。
        </p>
      )}
      <div className="learning-grid">
        <section className="video-section">
          <div className="video-frame" ref={host}>
            {m.fixture && (
              <div className="fixture-frame">
                <span className="eyebrow">SUBTITLE PRACTICE SAMPLE</span>
                <p lang="en">
                  Listen. Notice.
                  <br />
                  <em>Ask again.</em>
                </p>
                <span>字幕同期の操作確認 · 20秒</span>
              </div>
            )}
          </div>
          {playerError && (
            <p className="error" role="alert">
              {playerError}{" "}
              <a href={m.url} target="_blank" rel="noreferrer">
                元動画 ↗
              </a>
            </p>
          )}
          <div className="player-controls">
            <button disabled={!ready} onClick={play}>
              {playing ? "一時停止 Ⅱ" : "再生 ▷"}
            </button>
            <button disabled={!ready} onClick={() => seek(time - 10000)}>
              10秒戻す
            </button>
            <button
              disabled={!ready || !m.captions}
              onClick={() => {
                const cues = m.captions?.cues || [];
                const previous = [...cues]
                  .reverse()
                  .find((c) => c.startMs + offset < time - 500);
                seek((previous?.startMs || 0) + offset);
              }}
            >
              前の文へ
            </button>
            <label className="speed-label">
              速度
              <select
                value={speed}
                onChange={(e) => {
                  const v = Number(e.target.value);
                  setSpeed(v);
                  player.current?.setPlaybackRate?.(v);
                }}
              >
                {(m.fixture
                  ? [0.5, 0.75, 1, 1.25, 1.5, 2]
                  : player.current?.getAvailablePlaybackRates?.() || [1]
                ).map((r: number) => (
                  <option key={r} value={r}>
                    {r}×
                  </option>
                ))}
              </select>
            </label>
            <span role="timer" aria-label="再生位置" aria-live="off">
              {format(time)}
            </span>
          </div>
          <div className="actions">
            <button
              onClick={() => {
                setA(time);
                if (b !== undefined && b <= time) setB(undefined);
              }}
            >
              A地点 {a === undefined ? "" : format(a)}
            </button>
            <button
              disabled={a === undefined || time <= (a || 0)}
              onClick={() => setB(time)}
            >
              B地点 {b === undefined ? "" : format(b)}
            </button>
            <button
              disabled={a === undefined}
              onClick={() => {
                setA(undefined);
                setB(undefined);
              }}
            >
              反復を解除
            </button>
            <button disabled={!active || busy} onClick={bookmark}>
              この表現を保存 ＋
            </button>
          </div>
          <label className="inline-label">
            字幕の時刻補正（秒）
            <input
              type="number"
              step="0.1"
              min="-3600"
              max="3600"
              value={offset / 1000}
              onChange={(e) => setOffset(Number(e.target.value) * 1000)}
            />
            <button
              disabled={busy}
              onClick={() =>
                void run(() =>
                  api(
                    `/materials/${m.id}`,
                    { offsetMs: Math.round(offset) },
                    "PATCH",
                  ),
                )
              }
            >
              補正を保存
            </button>
          </label>
          <button
            className="primary"
            disabled={busy}
            onClick={() =>
              void run(async () => {
                const s = await api<PracticeSession>("/practice-sessions", {
                  mode: "動画から会話",
                  packId:
                    m.topic === "SRE"
                      ? "sre"
                      : m.topic === "データ基盤"
                        ? "confluent"
                        : "databricks",
                  goal: `「${m.title}」で理解できなかったことを質問する`,
                  materialId: m.id,
                  materialPositionMs: time,
                  training: true,
                });
                await refresh();
                go(`/practice/${s.id}`);
              }, "動画を題材にした会話を準備しました")
            }
          >
            このテーマで会話する ↗
          </button>
        </section>
        <section className="transcript card">
          <div className="transcript-toolbar">
            <h2>聞こえたことを、確かめる</h2>
            <div className="actions">
              <label className="check">
                <input
                  type="checkbox"
                  checked={en}
                  onChange={(e) => setEn(e.target.checked)}
                />
                英語
              </label>
              <label className="check">
                <input
                  type="checkbox"
                  checked={ja}
                  onChange={(e) => setJa(e.target.checked)}
                />
                日本語
              </label>
              <button onClick={() => setPeek(!peek)} aria-pressed={peek}>
                訳を一時表示
              </button>
            </div>
            <div className="presets">
              {[
                ["なし", false, false],
                ["英語のみ", true, false],
                ["日本語のみ", false, true],
                ["両方", true, true],
              ].map(([label, e, j]) => (
                <button
                  key={String(label)}
                  aria-pressed={en === e && ja === j}
                  onClick={() => {
                    setEn(Boolean(e));
                    setJa(Boolean(j));
                    setPeek(false);
                  }}
                >
                  {label}
                </button>
              ))}
            </div>
            <p className="muted">アプリ側字幕。YouTube内のCCは別設定です。</p>
          </div>
          <div
            className="caption-list"
            ref={captionsRef}
            onWheel={() => {
              following.current = false;
              setFollow(false);
            }}
            onTouchMove={() => {
              following.current = false;
              setFollow(false);
            }}
            onKeyDown={(e) => {
              if (
                [
                  "PageUp",
                  "PageDown",
                  "ArrowUp",
                  "ArrowDown",
                  "Home",
                  "End",
                ].includes(e.key)
              ) {
                following.current = false;
                setFollow(false);
              }
            }}
            tabIndex={0}
            aria-label="字幕リスト"
          >
            {!m.captions ? (
              <div className="empty">
                <h3>字幕の準備を待っています</h3>
                <p>
                  利用可能な音声から教材準備CLIで字幕を作るか、VTT/SRT・字幕パッケージを取り込めます。
                </p>
              </div>
            ) : !en && !ja && !peek ? (
              <div className="empty">
                <p>まずは字幕なしで聞いてみましょう。</p>
              </div>
            ) : (
              m.captions.cues
                .slice(visiblePage * 80, (visiblePage + 1) * 80)
                .map((c) => (
                  <article
                    key={c.cueId}
                    data-cue={c.cueId}
                    className={active?.cueId === c.cueId ? "cue active" : "cue"}
                  >
                    <button
                      className="timestamp"
                      aria-label={`${format(c.startMs + offset)}へ移動`}
                      onClick={() => seek(c.startMs + offset)}
                    >
                      {format(c.startMs + offset)}
                    </button>
                    {en && (
                      <p lang="en" className="english">
                        {c.correctedText || c.originalText}
                      </p>
                    )}
                    {(ja || peek) && (
                      <p lang="ja">{c.translation || "日本語訳は未準備です"}</p>
                    )}
                  </article>
                ))
            )}
          </div>
          {pageCount > 1 && (
            <div className="actions">
              <button
                disabled={visiblePage === 0}
                onClick={() => {
                  following.current = false;
                  setFollow(false);
                  setCaptionPage(visiblePage - 1);
                }}
              >
                前の80文
              </button>
              <span>
                {visiblePage + 1} / {pageCount}
              </span>
              <button
                disabled={visiblePage >= pageCount - 1}
                onClick={() => {
                  following.current = false;
                  setFollow(false);
                  setCaptionPage(visiblePage + 1);
                }}
              >
                次の80文
              </button>
            </div>
          )}
          {!follow && (
            <button
              onClick={() => {
                following.current = true;
                setFollow(true);
                const el = captionsRef.current?.querySelector(".active") as
                  | HTMLElement
                  | undefined;
                if (el && captionsRef.current)
                  captionsRef.current.scrollTop =
                    el.offsetTop - captionsRef.current.offsetTop;
              }}
            >
              現在の字幕へ戻る ↓
            </button>
          )}
        </section>
      </div>
      <details className="card disclosure">
        <summary>字幕の取り込み・訳の準備</summary>
        <ImportSubtitles material={m} run={run} refresh={refresh} busy={busy} />
        {m.captions?.cues.some((c) => !c.translation) && (
          <button
            disabled={busy}
            onClick={() =>
              void run(async () => {
                await api(`/materials/${m.id}/translations`, {
                  cueIds: m
                    .captions!.cues.filter((c) => !c.translation)
                    .slice(0, 20)
                    .map((c) => c.cueId),
                });
                await refresh();
              }, "日本語訳を保存しました（最大20文ずつ）")
            }
          >
            未翻訳の字幕を翻訳する（API費用が発生）
          </button>
        )}
      </details>
      <details className="card disclosure">
        <summary>用語・字幕の出典</summary>
        <p className="muted">
          教材ID：<code>{m.id}</code>
        </p>
        <p>{m.captions?.sourceDescription || "字幕なし"}</p>
        <p>{m.captions?.permission}</p>
        {m.captions && (
          <p className="muted">
            生成元：{m.captions.model} · {m.captions.generatedAt} ·
            自動生成字幕は誤認識の可能性があります。
          </p>
        )}
        <button
          disabled={!active || busy}
          onClick={() =>
            void run(async () => {
              const r = await api("/explain", { text: active!.originalText });
              setExplanation(r.text);
            }, "用語の説明を取得しました")
          }
        >
          現在の文の用語を説明する
        </button>
        {explanation && <p>{explanation}</p>}
        {!m.fixture && (
          <a target="_blank" rel="noreferrer" href={m.url}>
            元動画を開く ↗
          </a>
        )}
      </details>
    </>
  );
}
function ImportSubtitles({
  material,
  run,
  refresh,
  busy,
}: {
  material: Material;
  run: PageProps["run"];
  refresh: PageProps["refresh"];
  busy: boolean;
}) {
  const [text, setText] = useState("");
  const [source, setSource] = useState("");
  const [permission, setPermission] = useState("");
  return (
    <form
      className="form-grid"
      onSubmit={(e) => {
        e.preventDefault();
        void run(async () => {
          let pack: SubtitlePackage;
          try {
            pack = packageSchema.parse(JSON.parse(text));
          } catch {
            const cues = parseSubtitles(text);
            const bytes = await crypto.subtle.digest(
              "SHA-256",
              new TextEncoder().encode(text),
            );
            pack = {
              version: 1,
              sourceUrl: material.url,
              sourceDescription: source,
              permission,
              inputHash: Array.from(new Uint8Array(bytes), (b) =>
                b.toString(16).padStart(2, "0"),
              ).join(""),
              model: "imported-vtt-srt",
              generatedAt: now(),
              cues,
            };
          }
          await api(`/materials/${material.id}/subtitle-packages`, pack);
          await refresh();
          setText("");
        }, "字幕を保存しました");
      }}
    >
      <label>
        ファイル（JSON / VTT / SRT、1MB以内）
        <input
          type="file"
          accept=".json,.vtt,.srt"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file)
              void run(async () => {
                if (file.size > 1024 * 1024)
                  throw new Error("ファイルは1MB以内にしてください");
                setText(await file.text());
              }, "ファイルを読み込みました。出典を確認して取り込んでください");
          }}
        />
      </label>
      <label>
        字幕内容
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          required
          maxLength={1000000}
        />
      </label>
      <label>
        取得元・提供元
        <input
          value={source}
          onChange={(e) => setSource(e.target.value)}
          required
          maxLength={2000}
        />
      </label>
      <label>
        STT・翻訳に利用できる条件／許可の記録
        <input
          value={permission}
          onChange={(e) => setPermission(e.target.value)}
          required
          maxLength={2000}
        />
      </label>
      <button className="primary" disabled={busy}>
        字幕を取り込む
      </button>
      <p className="muted">
        元URLに一致する字幕を取り込んでください。URL登録だけで音声を取得することはありません。
      </p>
    </form>
  );
}
