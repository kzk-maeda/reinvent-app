import React, {
  useState,
  useEffect,
  useRef,
  useCallback,
  lazy,
  Suspense,
} from "react";
import { createRoot } from "react-dom/client";
import { api, APIError, go } from "./api.ts";
import { purgeOffline, readOffline, saveOffline } from "./offline.ts";
import type {
  Material,
  PracticeSession,
  Profile,
  ReviewItem,
} from "../shared/domain.ts";
import { phrases, packs } from "../shared/content.ts";
import { productDevelopmentPackId } from "../shared/scenarios.ts";
import "./style.css";
import UsageReconciliation, {
  BudgetSettings,
  PerformanceRecords,
} from "./usage.tsx";
if (import.meta.env.PROD) void import("./metrics.ts");
const Video = lazy(() => import("./video.tsx"));
const Conversation = lazy(() => import("./conversation.tsx"));
export type Snapshot = {
  profile: Profile;
  materials: Material[];
  sessions: PracticeSession[];
  review: ReviewItem[];
  packs: typeof packs;
  phrases: typeof phrases;
  usage: any;
  connections: any;
  jobs: any[];
  voiceRecovery?: any[];
};
export type Run = <T>(
  task: () => Promise<T>,
  message?: string,
) => Promise<T | undefined>;
export type PageProps = {
  data: Snapshot;
  refresh: () => Promise<void>;
  refreshUsage: () => Promise<void>;
  run: Run;
  busy: boolean;
};
const nav = [
  ["/", "今日の練習", "01"],
  ["/materials", "セッション", "02"],
  ["/practice", "ブース会話", "03"],
  ["/phrases", "旅行・会場フレーズ", "04"],
  ["/review", "復習ノート", "05"],
  ["/history", "振り返り", "06"],
  ["/settings", "設定", "07"],
];
function App() {
  const [data, setData] = useState<Snapshot>();
  const [auth, setAuth] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [route, setRoute] = useState(location.hash.slice(1) || "/");
  const [offline, setOffline] = useState(!navigator.onLine);
  const main = useRef<HTMLElement>(null);
  const positions = useRef(new Map<string, number>());
  const refresh = useCallback(async () => {
    const d = await api<Snapshot>("/bootstrap");
    setData(d);
    setAuth(true);
  }, []);
  const refreshUsage = useCallback(async () => {
    const usage = await api<Snapshot["usage"]>("/usage");
    // A late cost response must never restore a logged-out data snapshot.
    setData((current) => (current ? { ...current, usage } : current));
  }, []);
  const run: Run = async (task, message = "保存しました") => {
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const r = await task();
      setMessage(message);
      return r;
    } catch (e) {
      setError(e instanceof Error ? e.message : "処理に失敗しました");
      if (e instanceof APIError && e.status === 401) {
        setAuth(false);
        setData(undefined);
        await purgeOffline();
      }
      return undefined;
    } finally {
      setBusy(false);
    }
  };
  useEffect(() => {
    refresh()
      .catch((e) => {
        if (e instanceof APIError && e.status === 401) setAuth(false);
        else setError(e.message);
      })
      .finally(() => setLoading(false));
  }, [refresh]);
  useEffect(() => {
    const changed = () => {
      positions.current.set(route, window.scrollY);
      setRoute(location.hash.slice(1) || "/");
    };
    window.addEventListener("hashchange", changed);
    return () => window.removeEventListener("hashchange", changed);
  }, [route]);
  useEffect(() => {
    document.title = `${nav.find((n) => n[0] === route)?.[1] || "学習"} · re:Invent English Lab`;
    main.current?.focus({ preventScroll: true });
    window.scrollTo(0, positions.current.get(route) || 0);
  }, [route]);
  useEffect(() => {
    const online = () => {
      setOffline(false);
      void refresh().catch(() => {});
    };
    const off = () => setOffline(true);
    window.addEventListener("online", online);
    window.addEventListener("offline", off);
    return () => {
      window.removeEventListener("online", online);
      window.removeEventListener("offline", off);
    };
  }, [refresh]);
  useEffect(() => {
    if (data) document.documentElement.dataset.theme = data.profile.theme;
  }, [data?.profile.theme]);
  useEffect(() => {
    if (import.meta.env.PROD && "serviceWorker" in navigator)
      void navigator.serviceWorker.register("/sw.js");
  }, []);
  if (offline) return <Offline />;
  if (loading)
    return (
      <div className="loading" role="status">
        学習ノートを開いています…
      </div>
    );
  if (!auth || !data)
    return (
      <Login
        error={error}
        busy={busy}
        login={(password) =>
          run(async () => {
            await api("/login", { password });
            await refresh();
          }, "ログインしました")
        }
      />
    );
  const props = { data, refresh, refreshUsage, run, busy };
  const logout = () =>
    run(async () => {
      await api("/logout", {});
      await purgeOffline();
      setAuth(false);
      setData(undefined);
    }, "ログアウトしました");
  return (
    <div className="shell">
      <a
        className="skip"
        href="#main"
        onClick={(e) => {
          e.preventDefault();
          main.current?.focus();
        }}
      >
        本文へ移動
      </a>
      <aside className="sidebar">
        <a className="brand" href="#/" aria-label="English Lab ホーム">
          <span className="brand-mark">re:</span>
          <span>
            ENGLISH LAB<small>FOR YOUR NEXT CONVERSATION</small>
          </span>
        </a>
        <p className="nav-label">学びを、会話につなぐ</p>
        <nav aria-label="メイン">
          {nav.map(([path, title, n]) => (
            <a
              key={path}
              href={`#${path}`}
              aria-current={route === path ? "page" : undefined}
            >
              <span aria-hidden="true">{n}</span>
              {title}
            </a>
          ))}
        </nav>
        <div className="sidebar-foot">
          <span className="avatar">K</span>
          <div>
            {data.profile.name}
            <small>プライベートな学習ノート</small>
          </div>
          <button
            className="quiet"
            onClick={() => void logout()}
            disabled={busy}
            aria-label="ログアウト"
          >
            ↗
          </button>
        </div>
      </aside>
      <div className="workspace">
        <header className="topbar">
          <span>
            re:Inventへの準備 <span className="muted">/ 自分のペースで</span>
          </span>
          <span className="pill">
            {data.connections.simulator ? "操作検証モード" : "OpenAI API"}
            <span className="dot" />
          </span>
        </header>
        <div className="notice-area">
          <p role="status" className="notice">
            {message}
          </p>
          {error && (
            <p role="alert" className="error">
              {error}
            </p>
          )}
          {data.usage.warning > 0 && (
            <p className="warning">
              今月のAPI予算の{data.usage.warning}
              %に達しました。未確定の費用予約も含みます。
            </p>
          )}
        </div>
        <main id="main" tabIndex={-1} ref={main}>
          <Suspense fallback={<p role="status">画面を読み込んでいます…</p>}>
            {route === "/" ? (
              <Home {...props} />
            ) : route === "/materials" ? (
              <Materials {...props} />
            ) : route.startsWith("/material/") ? (
              <Video {...props} id={route.split("/")[2]} />
            ) : route === "/practice" || route.startsWith("/practice?") ? (
              <PracticeSetup key={route} {...props} />
            ) : route.startsWith("/practice/") ? (
              <Conversation {...props} id={route.split("/")[2]} />
            ) : route === "/phrases" ? (
              <Phrases {...props} />
            ) : route === "/review" ? (
              <Reviews {...props} />
            ) : route === "/history" ? (
              <History {...props} />
            ) : route === "/settings" ? (
              <Settings {...props} />
            ) : (
              <>
                <h1>ページが見つかりません</h1>
                <a href="#/">今日の練習へ</a>
              </>
            )}
          </Suspense>
        </main>
        <footer>
          一つずつ、伝わる英語へ。<span>re:Invent English Lab · v0.3</span>
        </footer>
      </div>
    </div>
  );
}
function Login({
  error,
  busy,
  login,
}: {
  error: string;
  busy: boolean;
  login: (password: string) => unknown;
}) {
  const [password, setPassword] = useState("");
  return (
    <main className="login">
      <div className="brand-mark">re:</div>
      <p className="eyebrow">YOUR PERSONAL ENGLISH LAB</p>
      <h1>
        次の会話へ、
        <br />
        一歩ずつ。
      </h1>
      <p>動画で聞いて、会話で試して、自分の表現に。</p>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          login(password);
        }}
      >
        <label>
          本人用パスワード
          <input
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
        </label>
        <button className="primary" disabled={busy}>
          {busy ? "開いています…" : "学習ノートを開く →"}
        </button>
      </form>
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
      <p className="muted">ローカルで設定したパスワードを入力してください。</p>
    </main>
  );
}
function Heading({
  kicker,
  title,
  description,
}: {
  kicker: string;
  title: string;
  description?: string;
}) {
  return (
    <div className="page-heading">
      <p className="eyebrow">{kicker}</p>
      <h1>{title}</h1>
      {description && <p className="muted">{description}</p>}
    </div>
  );
}
function Home({ data }: PageProps) {
  const due = data.review.filter((r) => r.dueAt <= new Date().toISOString());
  const material =
    data.materials.find((m) => m.positionMs > 0) || data.materials[0];
  return (
    <>
      <div className="home-heading">
        <div>
          <p className="eyebrow">A LITTLE PRACTICE, A REAL CONVERSATION</p>
          <h1>
            次の質問が、
            <br />
            会話をひらく。
          </h1>
          <p className="muted">
            {data.profile.name}さん、今日はどんな話をしてみますか。
          </p>
        </div>
        <div className="date-stamp">
          TODAY'S LAB
          <strong>
            {data.profile.dailyMinutes}
            <small>min</small>
          </strong>
          <span>小さな練習を、毎日に。</span>
        </div>
      </div>
      <section className="hero">
        <div>
          <span className="tag">TODAY'S FOCUS / 技術の話を聞き返す</span>
          <h2>
            「わかったつもり」を、
            <br />
            もう一つの質問に。
          </h2>
          <p>
            短い動画から話題を拾って、ブースでの会話へ。
            <br />
            上手に話すより、知りたいことを聞いてみましょう。
          </p>
          <a className="button primary" href="#/practice">
            今日の会話を始める <span>↗</span>
          </a>
        </div>
        <div className="hero-note" lang="en">
          <span>KEEP THIS ONE HANDY</span>
          <blockquote>
            “Could you explain
            <br />
            the last part again?”
          </blockquote>
          <p lang="ja">最後の部分を、もう一度。</p>
          <span className="note-index">01 / ASK & UNDERSTAND</span>
        </div>
      </section>
      <section className="section">
        <div className="section-title">
          <h2>今日の小さなステップ</h2>
          <span className="muted">聞く → 話す → 思い出す</span>
        </div>
        <div className="steps">
          <a
            className="card step"
            href={material ? `#/material/${material.id}` : "#/materials"}
          >
            <span className="step-number">
              01 <small>LISTEN · 8 MIN</small>
            </span>
            <h3>技術の英語に耳を慣らす</h3>
            <p>字幕なしで聞いて、対訳で確かめる。</p>
            <span className="text-link">
              {material?.positionMs ? "続きから再開" : "セッションを選ぶ"} →
            </span>
          </a>
          <a className="card step" href="#/practice">
            <span className="step-number">
              02 <small>SPEAK · 7 MIN</small>
            </span>
            <h3>自分から質問してみる</h3>
            <p>AI・SRE・データ基盤の話題で会話。</p>
            <span className="text-link">ブース会話へ →</span>
          </a>
          <a className="card step" href="#/review">
            <span className="step-number">
              03 <small>RECALL · 5 MIN</small>
            </span>
            <h3>使いたい表現を、自分のものに</h3>
            <p>
              今日の復習待ち <strong>{due.length}</strong> 枚
            </p>
            <span className="text-link">復習ノートを開く →</span>
          </a>
        </div>
      </section>
      <div className="lower-grid">
        <section className="section">
          <div className="section-title">
            <h2>次に話してみたいこと</h2>
            <a href="#/practice">すべて見る ↗</a>
          </div>
          {data.packs.slice(1, 3).map((p) => (
            <a
              className="topic-row"
              key={p.id}
              href={`#/practice?pack=${p.id}`}
            >
              <span className="topic-icon">
                {p.topic === "AI" ? "✳" : "⇄"}
              </span>
              <div>
                <span className="eyebrow">{p.topic}</span>
                <h3>{p.title}</h3>
                <p>
                  {p.scenario?.booth
                    ? p.partner
                    : p.scenario
                      ? "エンジニア同士の情報交換"
                      : "公開資料を題材にした会話"}
                </p>
              </div>
              <span>↗</span>
            </a>
          ))}
        </section>
        <section className="budget-card">
          <p className="eyebrow">API BUDGET / 今月の目安</p>
          <p className="budget-amount">
            ¥{Math.ceil(data.usage.totalYen).toLocaleString()}
            <small> / ¥{data.usage.limitYen.toLocaleString()}</small>
          </p>
          <progress
            aria-label="今月のAPI予算使用率"
            value={data.usage.totalYen}
            max={data.usage.limitYen}
          />
          <p className="muted">
            未確定使用量を含む推計。
            <br />
            ホスティング費用は含みません。
          </p>
          <a href="#/settings">利用状況を確認 →</a>
        </section>
      </div>
    </>
  );
}
function Materials({ data, run, refresh, busy }: PageProps) {
  const [topic, setTopic] = useState(
    sessionStorage.getItem("catalog-topic") || "すべて",
  );
  const [title, setTitle] = useState("");
  const [url, setUrl] = useState("");
  return (
    <>
      <Heading
        kicker="LISTEN & NOTICE"
        title="セッション"
        description="聞き取れなかった一文が、次の会話のきっかけに。"
      />
      <div className="filters" aria-label="分野">
        {["すべて", "AI", "SRE", "データ基盤", "その他"].map((t) => (
          <button
            aria-pressed={topic === t}
            key={t}
            onClick={() => {
              setTopic(t);
              sessionStorage.setItem("catalog-topic", t);
            }}
          >
            {t}
          </button>
        ))}
      </div>
      <div className="material-grid">
        {data.materials
          .filter((m) => topic === "すべて" || m.topic === topic)
          .map((m) => (
            <a
              key={m.id}
              className="card material-card"
              href={`#/material/${m.id}`}
            >
              <div className="material-cover">
                <span>{m.topic}</span>
                <span className="play-symbol">▷</span>
                <small>
                  {m.fixture ? "操作確認サンプル" : m.year || "SESSION"}
                </small>
              </div>
              <div className="card-content">
                <span className="tag">
                  {m.captions
                    ? "アプリ字幕の準備済み"
                    : "YouTubeで視聴 · アプリ字幕未準備"}
                </span>
                <h2>{m.title}</h2>
                {m.publisher && (
                  <p className="muted">
                    {m.publisher} · re:Invent {m.year} · {m.difficulty}
                  </p>
                )}
                <p>
                  {m.reason ||
                    "YouTubeで再生できます。英日字幕には教材準備が必要です。"}
                </p>
                <span className="text-link">
                  {m.positionMs ? "続きから見る" : "学習画面へ"} →
                </span>
              </div>
            </a>
          ))}
      </div>
      <details className="card disclosure">
        <summary>YouTube動画を登録する</summary>
        <form
          className="form-grid"
          onSubmit={(e) => {
            e.preventDefault();
            void run(async () => {
              await api("/materials", {
                title,
                url,
                topic: topic === "すべて" ? "その他" : topic,
              });
              await refresh();
              setTitle("");
              setUrl("");
            }, "動画を登録しました。音声取得は開始していません。");
          }}
        >
          <label>
            教材名
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              required
              maxLength={200}
            />
          </label>
          <label>
            YouTube URL
            <input
              type="url"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              required
            />
          </label>
          <button className="primary" disabled={busy}>
            登録する
          </button>
          <p className="muted">
            登録後は埋め込み視聴ができます。字幕は利用可能な音声や字幕ファイルから別途準備します。
          </p>
        </form>
      </details>
      <section className="section">
        <h2>教材の準備状況</h2>
        {data.jobs.length ? (
          data.jobs.map((j) => (
            <article className="card compact" key={j.id}>
              <strong>
                {data.materials.find((m) => m.id === j.materialId)?.title}
              </strong>
              <p>
                {j.status} · {new Date(j.updatedAt).toLocaleString("ja-JP")}
              </p>
              {j.failure && <p className="error">{j.failure}</p>}
            </article>
          ))
        ) : (
          <p className="muted">
            準備ジョブはまだありません。字幕ファイルの取り込みや教材準備CLIを使えます。
          </p>
        )}
      </section>
    </>
  );
}
function PracticeSetup({ data, run, refresh, busy }: PageProps) {
  const query = new URLSearchParams(location.hash.split("?")[1]);
  const phrase = phrases.find((p) => p.id === query.get("phrase"));
  const initialPack =
    data.packs.find((p) => p.id === query.get("pack")) || data.packs[0];
  const [pack, setPack] = useState(initialPack.id);
  const [mode, setMode] = useState(
    phrase ? "旅行練習" : initialPack.scenario?.mode || "ネットワーキング",
  );
  const [goal, setGoal] = useState(
    phrase
      ? `「${phrase.ja}」を英語で伝えて、短い会話を続ける`
      : initialPack.scenario?.goal ||
          "自分から2つ質問し、聞き返して、会話を終える",
  );
  const [training, setTraining] = useState(true);
  const selected = data.packs.find((p) => p.id === pack) || data.packs[0];
  const productBooth = data.packs.find(
    (p) => p.id === productDevelopmentPackId,
  );
  return (
    <>
      <Heading
        kicker="ASK, LISTEN & ASK AGAIN"
        title="ブース会話"
        description="知りたいことを、自分から聞くための練習。"
      />
      {productBooth && pack !== productBooth.id && (
        <a className="topic-row" href={`#/practice?pack=${productBooth.id}`}>
          <div>
            <h2>{productBooth.title}</h2>
            <p>製品を作るエンジニアに、開発基盤・チームの規模・KPIを聞く →</p>
          </div>
        </a>
      )}
      <div className="two-columns">
        <form
          className="card padded"
          onSubmit={(e) => {
            e.preventDefault();
            void run(async () => {
              const s = await api<PracticeSession>("/practice-sessions", {
                packId: pack,
                mode,
                goal,
                training,
              });
              await refresh();
              go(`/practice/${s.id}`);
            }, "会話の準備ができました");
          }}
        >
          <h2>今日は、誰と話す？</h2>
          <label>
            題材と相手
            <select
              value={pack}
              onChange={(e) => {
                const next = data.packs.find((p) => p.id === e.target.value)!;
                setPack(next.id);
                if (next.scenario) {
                  setMode(next.scenario.mode);
                  setGoal(next.scenario.goal);
                } else if (selected.scenario) {
                  setMode("ネットワーキング");
                  setGoal("自分から2つ質問し、聞き返して、会話を終える");
                }
              }}
            >
              {data.packs.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.title} / {p.topic}
                </option>
              ))}
            </select>
          </label>
          <label>
            会話の場面
            <select value={mode} onChange={(e) => setMode(e.target.value)}>
              {[
                "ネットワーキング",
                "エンジニアとの情報交換",
                "企業デモ",
                "AWS技術相談",
                "技術トレンド",
                "動画から会話",
                "旅行練習",
              ].map((m) => (
                <option key={m}>{m}</option>
              ))}
            </select>
          </label>
          <label>
            達成したいこと
            <textarea
              value={goal}
              onChange={(e) => setGoal(e.target.value)}
              required
              maxLength={1000}
            />
          </label>
          <label className="check">
            <input
              type="checkbox"
              checked={training}
              onChange={(e) => setTraining(e.target.checked)}
            />
            学習モード（文字起こしを表示）
          </label>
          <button className="primary" disabled={busy}>
            会話を準備する →
          </button>
        </form>
        <aside className="context-note">
          <span className="eyebrow">CONVERSATION CONTEXT</span>
          <h2>{selected.title}</h2>
          <p>{selected.partner}</p>
          <p className="muted">
            {selected.scenario ? "練習設定日" : "資料の基準日"}：{selected.date}
          </p>
          <ul>
            {selected.facts.map((f) => (
              <li key={f}>{f}</li>
            ))}
          </ul>
          {selected.source && (
            <a target="_blank" rel="noreferrer" href={selected.source}>
              元の公開資料 ↗
            </a>
          )}
          <h3>{selected.scenario ? "話の切り出し方" : "質問のきっかけ"}</h3>
          {selected.scenario ? (
            <>
              <p lang="en" className="english">
                {selected.scenario.opening}
              </p>
              <h3>聞きたいことと深掘り</h3>
              {selected.scenario.topics.map((topic) => (
                <section key={topic.label}>
                  <h4>{topic.label}</h4>
                  <p lang="en" className="english">
                    {topic.question}
                  </p>
                  <p lang="en">{topic.followUp}</p>
                </section>
              ))}
              <p lang="en" className="english">
                {selected.scenario.confirmation}
              </p>
            </>
          ) : (
            selected.questions.map((q) => (
              <p lang="en" className="english" key={q}>
                {q}
              </p>
            ))
          )}
          <p className="muted">
            標準5〜7分。実音声は最大10分。
            {data.connections.simulator
              ? "現在は検証モードです。テキスト入力と端末の読み上げで流れを確認できます。"
              : "音声会話にはマイクとAPI利用料が必要です。"}
          </p>
        </aside>
      </div>
    </>
  );
}
function Phrases({ data, run, refresh, busy }: PageProps) {
  const [category, setCategory] = useState("すべて");
  const [revealed, setRevealed] = useState(new Set<string>());
  const speak = (text: string) => {
    speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.lang = "en-US";
    u.rate = data.profile.speed;
    speechSynthesis.speak(u);
  };
  useEffect(
    () => () => {
      if ("speechSynthesis" in window) speechSynthesis.cancel();
    },
    [],
  );
  return (
    <>
      <Heading
        kicker="SMALL PHRASES, MORE POSSIBILITIES"
        title="旅行・会場フレーズ"
        description="意味を見て、まず声に出す。短い一言から始めましょう。"
      />
      <label className="inline-label">
        場面
        <select value={category} onChange={(e) => setCategory(e.target.value)}>
          {["すべて", ...new Set(phrases.map((p) => p.category))].map((c) => (
            <option key={c}>{c}</option>
          ))}
        </select>
      </label>
      <div className="phrase-grid">
        {phrases
          .filter((p) => category === "すべて" || p.category === category)
          .map((p) => (
            <article className="card phrase-card" key={p.id}>
              <span className="eyebrow">{p.category}</span>
              <h2>{p.ja}</h2>
              {revealed.has(p.id) ? (
                <p lang="en" className="english">
                  {p.en}
                </p>
              ) : (
                <button
                  className="reveal"
                  onClick={() => setRevealed(new Set([...revealed, p.id]))}
                >
                  英語を思い出す → 答えを見る
                </button>
              )}
              <div className="actions">
                <button
                  disabled={!("speechSynthesis" in window)}
                  onClick={() => speak(p.en)}
                >
                  聞く ♫
                </button>
                <button
                  disabled={busy}
                  onClick={() =>
                    void run(async () => {
                      await api("/review-items", {
                        en: p.en,
                        ja: p.ja,
                        source: { kind: "phrase", id: p.id },
                      });
                      await refresh();
                    })
                  }
                >
                  復習に保存 ＋
                </button>
                <a className="button" href={`#/practice?phrase=${p.id}`}>
                  会話で使う ↗
                </a>
              </div>
            </article>
          ))}
      </div>
    </>
  );
}
function Reviews({ data, run, refresh, busy }: PageProps) {
  const [showAll, setShowAll] = useState(false);
  const [revealed, setRevealed] = useState(new Set<string>());
  const items = data.review.filter(
    (r) => showAll || r.dueAt <= new Date().toISOString(),
  );
  return (
    <>
      <Heading
        kicker="MAKE IT YOUR OWN"
        title="復習ノート"
        description="昨日言えなかったことを、今日の一言に。"
      />
      <div className="actions">
        <label className="check">
          <input
            type="checkbox"
            checked={showAll}
            onChange={(e) => setShowAll(e.target.checked)}
          />
          復習予定のカードも見る
        </label>
        <button
          disabled={busy}
          onClick={() =>
            void run(
              () => saveOffline(data.review),
              "この端末に30日間保存しました。ログアウト・履歴削除で消去されます。",
            )
          }
        >
          オフライン用に保存
        </button>
      </div>
      {!items.length && (
        <div className="empty">
          <span>✳</span>
          <h2>今日の復習はありません</h2>
          <p>動画や会話から、また使いたい表現を保存してみましょう。</p>
          <a className="button" href="#/phrases">
            フレーズを探す →
          </a>
        </div>
      )}
      <div className="phrase-grid">
        {items.map((r) => (
          <article className="card phrase-card" key={r.id}>
            <span className="eyebrow">
              {r.source.kind === "material"
                ? "動画から"
                : r.source.kind === "session"
                  ? "会話から"
                  : "場面フレーズ"}{" "}
              · {r.stage ? `${r.stage}回目` : "初めての復習"}
            </span>
            <h2>{r.ja}</h2>
            {revealed.has(r.id) ? (
              <>
                <p className="english" lang="en">
                  {r.en}
                </p>
                <div className="actions">
                  <button
                    disabled={busy}
                    onClick={() =>
                      void run(async () => {
                        await api(`/review-items/${r.id}/attempts`, {
                          remembered: false,
                        });
                        await refresh();
                      }, "明日もう一度、練習しましょう")
                    }
                  >
                    まだ難しい
                  </button>
                  <button
                    className="primary"
                    disabled={busy}
                    onClick={() =>
                      void run(async () => {
                        await api(`/review-items/${r.id}/attempts`, {
                          remembered: true,
                        });
                        await refresh();
                      }, "次の復習日を更新しました")
                    }
                  >
                    思い出せた ✓
                  </button>
                </div>
              </>
            ) : (
              <button
                className="reveal"
                onClick={() => setRevealed(new Set([...revealed, r.id]))}
              >
                答えを見る →
              </button>
            )}
            <p className="muted">
              次回：{new Date(r.dueAt).toLocaleDateString("ja-JP")}
            </p>
            {r.source.kind === "material" && (
              <a href={`#/material/${r.source.id}`}>元の動画へ ↗</a>
            )}
            {r.source.kind === "session" && (
              <a href={`#/practice/${r.source.id}`}>元の会話へ ↗</a>
            )}
          </article>
        ))}
      </div>
    </>
  );
}
function History({ data, run, refresh, busy }: PageProps) {
  return (
    <>
      <Heading
        kicker="LOOK BACK, TRY AGAIN"
        title="振り返り"
        description="正しさだけでなく、知りたいことを聞けたか。"
      />
      {!data.sessions.length && (
        <p className="empty">
          まだ会話はありません。最初の短い練習を始めてみましょう。
        </p>
      )}
      {data.sessions.map((s) => (
        <article className="card history-row" key={s.id}>
          <div>
            <span className="eyebrow">
              {new Date(s.createdAt).toLocaleString("ja-JP")} ·{" "}
              {s.provider === "simulator" ? "操作検証" : "API"}
            </span>
            <h2>{s.goal}</h2>
            <p>
              {s.turns.filter((t) => t.role === "user").length} 発話 · ヒント{" "}
              {s.hintCount} 回 · {s.status === "completed" ? "完了" : s.status}
            </p>
          </div>
          <div className="actions">
            <a className="button" href={`#/practice/${s.id}`}>
              会話を見る →
            </a>
            <button
              disabled={busy}
              onClick={() =>
                void run(async () => {
                  const retry = await api<PracticeSession>(
                    "/practice-sessions",
                    {
                      mode: s.mode,
                      goal: s.goal,
                      packId: s.packId,
                      training: s.training,
                      materialId: s.materialId,
                    },
                  );
                  await refresh();
                  go(`/practice/${retry.id}`);
                }, "同じ目的で再挑戦します")
              }
            >
              再挑戦
            </button>
            <DeleteButton
              label="会話を削除"
              busy={busy}
              onConfirm={() =>
                run(async () => {
                  await api(`/practice-sessions/${s.id}`, undefined, "DELETE");
                  await purgeOffline();
                  await refresh();
                }, "会話と関連カードを削除しました")
              }
            />
          </div>
        </article>
      ))}
    </>
  );
}
function DeleteButton({
  label,
  busy,
  onConfirm,
}: {
  label: string;
  busy: boolean;
  onConfirm: () => Promise<unknown>;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  return (
    <>
      <button
        className="danger quiet"
        disabled={busy}
        onClick={() => ref.current?.showModal()}
      >
        {label}
      </button>
      <dialog ref={ref} aria-label={label}>
        <h2>{label}しますか？</h2>
        <p>関連する復習カードと、この端末のオフライン保存も消去します。</p>
        <div className="actions">
          <button onClick={() => ref.current?.close()}>戻る</button>
          <button
            className="danger"
            disabled={busy}
            onClick={() => {
              void onConfirm().then(() => ref.current?.close());
            }}
          >
            削除する
          </button>
        </div>
      </dialog>
    </>
  );
}
function Settings({ data, run, refresh, refreshUsage, busy }: PageProps) {
  const [p, setP] = useState(data.profile);
  const update = (key: keyof Profile, value: unknown) =>
    setP({ ...p, [key]: value });
  return (
    <>
      <Heading
        kicker="YOUR LAB, YOUR PACE"
        title="設定"
        description="学び方と、使うサービスを確かめる。"
      />
      <div className="two-columns">
        <form
          className="card padded"
          onSubmit={(e) => {
            e.preventDefault();
            void run(async () => {
              await api("/profile", p, "PUT");
              await refresh();
            });
          }}
        >
          <h2>プロフィールと練習</h2>
          <label>
            名前
            <input
              autoComplete="given-name"
              value={p.name}
              onChange={(e) => update("name", e.target.value)}
              maxLength={100}
            />
          </label>
          <label>
            仕事の自己紹介（英語）
            <textarea
              value={p.introduction}
              onChange={(e) => update("introduction", e.target.value)}
              maxLength={3000}
            />
          </label>
          <label>
            興味のある分野
            <input
              value={p.interests}
              onChange={(e) => update("interests", e.target.value)}
              maxLength={500}
            />
          </label>
          <label>
            出発日
            <input
              type="date"
              value={p.departure}
              onChange={(e) => update("departure", e.target.value)}
            />
          </label>
          <div className="form-pair">
            <label>
              1日の練習（分）
              <input
                type="number"
                min="5"
                max="120"
                value={p.dailyMinutes}
                onChange={(e) => update("dailyMinutes", Number(e.target.value))}
              />
            </label>
            <label>
              読み上げ速度
              <select
                value={p.speed}
                onChange={(e) => update("speed", Number(e.target.value))}
              >
                {[0.7, 0.85, 1, 1.15, 1.3].map((s) => (
                  <option key={s} value={s}>
                    {s}×
                  </option>
                ))}
              </select>
            </label>
          </div>
          <label className="check">
            <input
              type="checkbox"
              checked={p.showTranscript}
              onChange={(e) => update("showTranscript", e.target.checked)}
            />
            学習モードで文字起こしを表示
          </label>
          <label className="check">
            <input
              type="checkbox"
              checked={p.showTranslation}
              onChange={(e) => update("showTranslation", e.target.checked)}
            />
            会話の訳を表示
          </label>
          <label>
            配色
            <select
              value={p.theme}
              onChange={(e) => update("theme", e.target.value)}
            >
              <option value="system">端末の設定</option>
              <option value="light">ライト</option>
              <option value="dark">ダーク</option>
            </select>
          </label>
          <button className="primary" disabled={busy}>
            設定を保存
          </button>
        </form>
        <div>
          <section className="card padded">
            <h2>AI接続</h2>
            <p>
              <strong>
                {data.connections.simulator
                  ? "操作検証モード（API費用なし）"
                  : "OpenAI API"}
              </strong>
            </p>
            <p>
              テキスト：{data.connections.textModel}
              <br />
              音声：{data.connections.voiceModel}
            </p>
            <p className="muted">
              ChatGPT利用枠：利用不可。{data.connections.chatgpt.reason}
            </p>
            <button
              disabled={busy}
              onClick={() =>
                void run(
                  async () => {
                    const r = await api("/ai-connections/check", {});
                    if (!r.ok) throw new Error(r.message);
                    return r;
                  },
                  data.connections.simulator
                    ? "検証モードです。実AIには接続していません。"
                    : "モデルへのアクセスを確認しました",
                )
              }
            >
              接続を確認
            </button>
            <details>
              <summary>実APIへ接続するには</summary>
              <p>
                サーバーの.envでOPENAI_API_KEYとAI_PROVIDER=openaiを設定して再起動します。通常キーはブラウザに保存しません。ChatGPT枠への自動切替は行いません。
              </p>
            </details>
          </section>
          <section className="card padded">
            <h2>今月のAPI利用</h2>
            <p className="budget-amount">
              ¥{Math.ceil(data.usage.totalYen)}
              <small> / ¥{data.usage.limitYen}</small>
            </p>
            <p>
              確定：¥{data.usage.confirmedYen.toFixed(2)}
              <br />
              未確定・予約：¥
              {(data.usage.totalYen - data.usage.confirmedYen).toFixed(2)}
            </p>
            <p className="muted">
              1 USD = ¥{data.usage.usdJpy}で推計。単価の基準日：
              {data.usage.rateDate}
              。厳密な請求上限を保証しません。ホスティング：ローカル運用（別計上）。
            </p>
            <details>
              <summary>処理ごとの記録 ({data.usage.events.length})</summary>
              {data.usage.events.map((e: any) => (
                <p key={e.id}>
                  {e.kind} · {e.model}
                  <br />¥{(e.amount / 1000).toFixed(2)} ·{" "}
                  {e.status === "reserved" ? "未確定" : "確定"}
                </p>
              ))}
            </details>
            <BudgetSettings
              data={data}
              refreshUsage={refreshUsage}
              run={run}
              refresh={refresh}
              busy={busy}
            />
            <UsageReconciliation
              data={data}
              refreshUsage={refreshUsage}
              run={run}
              refresh={refresh}
              busy={busy}
            />
            <PerformanceRecords run={run} busy={busy} />
          </section>
          <section className="card padded">
            <h2>学習履歴</h2>
            <p>
              生音声はアプリに保存しません。会話時はOpenAIへ送信します。端末のオフラインカードは30日間有効です。
            </p>
            <DeleteButton
              label="学習履歴をすべて削除"
              busy={busy}
              onConfirm={() =>
                run(async () => {
                  await api("/history", undefined, "DELETE");
                  await purgeOffline();
                  await refresh();
                }, "履歴とこの端末のオフライン保存を削除しました")
              }
            />
            <button
              onClick={() =>
                void run(() => purgeOffline(), "この端末の保存を削除しました")
              }
            >
              この端末のオフライン保存を消去
            </button>
            <p className="muted">
              他の端末のオフライン保存は、その端末で消去してください。
            </p>
            <button
              disabled={busy}
              onClick={() =>
                void run(async () => {
                  await api("/logout", {});
                  await purgeOffline();
                  location.reload();
                }, "ログアウトしました")
              }
            >
              ログアウト
            </button>
          </section>
        </div>
      </div>
    </>
  );
}
function Offline() {
  const [cards, setCards] = useState<ReviewItem[]>([]);
  const [saved, setSaved] = useState(0);
  useEffect(() => {
    void readOffline()
      .then((d) => {
        if (d) {
          setCards(d.items);
          setSaved(d.savedAt);
        }
      })
      .catch(() => {});
  }, []);
  return (
    <main className="offline">
      <p className="eyebrow">OFFLINE NOTEBOOK</p>
      <h1>保存した表現を、もう一度。</h1>
      <p>オフラインです。動画とAI会話はオンラインで使えます。</p>
      {saved > 0 && (
        <p>この端末への保存：{new Date(saved).toLocaleDateString("ja-JP")}</p>
      )}
      {!cards.length && <p>この端末に保存済みの復習カードはありません。</p>}
      {cards.map((c) => (
        <details className="card padded" key={c.id}>
          <summary>{c.ja}</summary>
          <p lang="en" className="english">
            {c.en}
          </p>
        </details>
      ))}
      <h2>旅行・会場のフレーズ</h2>
      {phrases.map((p) => (
        <details key={p.id}>
          <summary>{p.ja}</summary>
          <p lang="en">{p.en}</p>
        </details>
      ))}
    </main>
  );
}
createRoot(document.getElementById("root")!).render(<App />);
