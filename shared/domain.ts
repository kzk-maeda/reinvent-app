import { z } from "zod";
export const cueSchema = z.object({
  cueId: z.string().min(1).max(100),
  startMs: z.number().int().nonnegative(),
  endMs: z.number().int().positive(),
  originalText: z.string().min(1).max(4000),
  translation: z.string().max(6000).default(""),
  correctedText: z.string().max(4000).optional(),
});
export type Cue = z.infer<typeof cueSchema>;
export const packageSchema = z
  .object({
    version: z.literal(1),
    sourceUrl: z.string().url(),
    sourceDescription: z.string().min(1).max(2000),
    permission: z.string().min(1).max(2000),
    inputHash: z.string().min(1).max(128),
    model: z.string().max(200),
    generatedAt: z.string().datetime(),
    cues: z.array(cueSchema).min(1).max(12000),
  })
  .superRefine((p, ctx) => {
    const ids = new Set<string>();
    let previousEnd = -1;
    p.cues.forEach((c, i) => {
      if (c.endMs <= c.startMs || c.startMs < previousEnd || ids.has(c.cueId))
        ctx.addIssue({
          code: "custom",
          path: ["cues", i],
          message: "字幕の時刻・重複・順序・IDを確認してください",
        });
      previousEnd = c.endMs;
      ids.add(c.cueId);
    });
  });
export type SubtitlePackage = z.infer<typeof packageSchema>;
export type Material = {
  id: string;
  title: string;
  topic: string;
  url: string;
  youtubeId?: string;
  publisher?: string;
  year?: number;
  difficulty: string;
  reason: string;
  status: string;
  offsetMs: number;
  positionMs: number;
  captions?: SubtitlePackage;
  fixture?: boolean;
};
export type Turn = {
  id: string;
  role: "user" | "assistant";
  text: string;
  at: string;
  heard?: boolean;
  hint?: boolean;
  translation?: string;
  translationProvider?: string;
  translationModel?: string;
};
export type Feedback = {
  positive: string;
  improvements: string[];
  expressions: { en: string; ja: string; turnId: string }[];
  goal: string;
  achieved: boolean;
};
export type PracticeSession = {
  id: string;
  mode: string;
  goal: string;
  packId: string;
  materialId?: string;
  materialVersion?: string;
  materialContext?: { title: string; sourceUrl: string; cues: Cue[] };
  status:
    | "ready"
    | "connecting"
    | "active"
    | "completed"
    | "interrupted"
    | "failed";
  provider: string;
  textModel?: string;
  voiceModel?: string;
  createdAt: string;
  endedAt?: string;
  turns: Turn[];
  feedback?: Feedback;
  hintCount: number;
  training: boolean;
};
export type ReviewItem = {
  id: string;
  en: string;
  ja: string;
  source: {
    kind: string;
    id: string;
    cueId?: string;
    turnId?: string;
    positionMs?: number;
  };
  dueAt: string;
  stage: number;
  attempts: { at: string; remembered: boolean }[];
};
export type Profile = {
  name: string;
  introduction: string;
  interests: string;
  departure: string;
  dailyMinutes: number;
  speed: number;
  showTranscript: boolean;
  showTranslation: boolean;
  theme: "light" | "dark" | "system";
};
export const profileSchema = z.object({
  name: z.string().max(100),
  introduction: z.string().max(3000),
  interests: z.string().max(500),
  departure: z.string().max(10),
  dailyMinutes: z.number().int().min(5).max(120),
  speed: z.number().min(0.5).max(2),
  showTranscript: z.boolean(),
  showTranslation: z.boolean(),
  theme: z.enum(["light", "dark", "system"]),
});
export const defaultProfile: Profile = {
  name: "Kazuki",
  introduction: "I work on SRE and data platforms.",
  interests: "AI・SRE・データ基盤",
  departure: "",
  dailyMinutes: 20,
  speed: 1,
  showTranscript: true,
  showTranslation: false,
  theme: "system",
};
export const now = () => new Date().toISOString();
export function reviewNext(
  item: ReviewItem,
  remembered: boolean,
  at = new Date(),
): ReviewItem {
  const stage = remembered ? Math.min(item.stage + 1, 4) : 0;
  const days = remembered ? [1, 1, 3, 7, 14][stage] : 1;
  return {
    ...item,
    stage,
    dueAt: new Date(at.getTime() + days * 86400000).toISOString(),
    attempts: [...item.attempts, { at: at.toISOString(), remembered }],
  };
}
export function youtubeId(url: string): string | undefined {
  try {
    const u = new URL(url);
    if (u.protocol !== "https:") return;
    const id =
      u.hostname === "youtu.be"
        ? u.pathname.slice(1)
        : ["youtube.com", "www.youtube.com", "m.youtube.com"].includes(
              u.hostname,
            )
          ? u.searchParams.get("v")
          : null;
    return id && /^[\w-]{11}$/.test(id) ? id : undefined;
  } catch {
    return;
  }
}
export function activeCue(
  cues: Cue[],
  timeMs: number,
  offsetMs = 0,
): Cue | undefined {
  const t = timeMs - offsetMs;
  let low = 0,
    high = cues.length - 1;
  while (low <= high) {
    const mid = (low + high) >>> 1;
    if (cues[mid].startMs <= t) low = mid + 1;
    else high = mid - 1;
  }
  return high >= 0 && cues[high].endMs > t ? cues[high] : undefined;
}
export function parseSubtitles(input: string): Cue[] {
  const blocks = input
    .replace(/^\uFEFF/, "")
    .replace(/\r/g, "")
    .split(/\n\s*\n/);
  const cues: Cue[] = [];
  function ms(s: string) {
    if (!/^(?:\d{2,}:)?\d{2}:\d{2}[.,]\d{3}$/.test(s))
      throw new Error("字幕の時刻が不正です");
    const parts = s.replace(",", ".").split(":").map(Number);
    if (
      parts.length < 2 ||
      parts.length > 3 ||
      parts.some((n) => !Number.isFinite(n) || n < 0) ||
      parts.at(-1)! >= 60 ||
      (parts.length === 3 && parts[1] >= 60)
    )
      throw new Error("字幕の時刻が不正です");
    return Math.round(parts.reduce((a, n) => a * 60 + n, 0) * 1000);
  }
  for (const block of blocks) {
    const lines = block.split("\n");
    const n = lines.findIndex((l) => l.includes("-->"));
    if (n < 0) continue;
    const match = lines[n].match(
      /^\s*([\d:.,]+)\s+-->\s+([\d:.,]+)(?:\s+.*)?$/,
    );
    if (!match) throw new Error("字幕形式を確認してください");
    const originalText = lines
      .slice(n + 1)
      .join(" ")
      .replace(/<[^>]*>/g, "")
      .trim();
    if (originalText)
      cues.push({
        cueId: `cue-${cues.length + 1}`,
        startMs: ms(match[1]),
        endMs: ms(match[2]),
        originalText,
        translation: "",
      });
  }
  return packageSchema.parse({
    version: 1,
    sourceUrl: "https://example.com",
    sourceDescription: "import",
    permission: "import",
    inputHash: "import",
    model: "import",
    generatedAt: now(),
    cues,
  }).cues;
}
