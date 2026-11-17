import "dotenv/config";
import { createHash, randomUUID } from "node:crypto";
import {
  readFileSync,
  writeFileSync,
  mkdirSync,
  existsSync,
  rmSync,
  readdirSync,
  statSync,
  openSync,
  closeSync,
  createReadStream,
} from "node:fs";
import { resolve, join } from "node:path";
import { spawnSync } from "node:child_process";
import { parseArgs } from "node:util";
import {
  packageSchema,
  parseSubtitles,
  now,
  type Cue,
  type SubtitlePackage,
} from "../shared/domain.ts";
export function normalizeSegments(
  segments: { start: number; end: number; text: string }[],
  chunkStartMs: number,
  keepStartMs: number,
  keepEndMs: number,
): Cue[] {
  return segments
    .filter(
      (s) =>
        Number.isFinite(s.start) &&
        Number.isFinite(s.end) &&
        s.end > s.start &&
        s.text.trim(),
    )
    .map((s) => ({
      start: chunkStartMs + s.start * 1000,
      end: chunkStartMs + s.end * 1000,
      text: s.text.trim(),
    }))
    .filter((s) => s.end > keepStartMs && s.start < keepEndMs)
    .map((s, i) => ({
      cueId: `cue-${Math.round(chunkStartMs)}-${i}`,
      startMs: Math.max(keepStartMs, Math.round(s.start)),
      endMs: Math.min(keepEndMs, Math.round(s.end)),
      originalText: s.text,
      translation: "",
    }))
    .filter((c) => c.endMs > c.startMs);
}
export function mergeCueChunks(
  previous: Cue[],
  next: Cue[],
  overlapStartMs: number,
): Cue[] {
  const normalize = (s: string) =>
    s
      .toLowerCase()
      .replace(/[^\p{L}\p{N}]+/gu, " ")
      .trim();
  const result = previous.map((c) => ({ ...c }));
  for (const cue of next) {
    const duplicate = result.findLast(
      (c) =>
        c.endMs >= overlapStartMs &&
        Math.abs(c.startMs - cue.startMs) < 8000 &&
        normalize(c.originalText) === normalize(cue.originalText),
    );
    if (duplicate) {
      duplicate.endMs = Math.max(duplicate.endMs, cue.endMs);
      continue;
    }
    const last = result.at(-1);
    if (last && cue.startMs < last.endMs) {
      throw new Error(
        "分割境界の字幕対応を確定できません。保存済みSTT結果を確認し、字幕パッケージを修正して取り込んでください。",
      );
    }
    result.push({ ...cue });
  }
  for (let i = 0; i < result.length - 1; i++) {
    if (result[i].endMs > result[i + 1].startMs)
      throw new Error(
        "分割境界の字幕が重複しています。字幕パッケージを確認してください。",
      );
  }
  return result;
}
const digest = (value: string | Buffer) =>
  createHash("sha256").update(value).digest("hex");
function atomic(path: string, data: unknown) {
  writeFileSync(`${path}.tmp`, JSON.stringify(data, null, 2), { mode: 0o600 });
  rename(`${path}.tmp`, path);
}
import { renameSync as rename } from "node:fs";
type Step = {
  operationId: string;
  status: "pending" | "done" | "unknown";
  result?: any;
};
type Manifest = {
  jobId: string;
  settings: unknown;
  inputHash: string;
  steps: Record<string, Step>;
  package?: SubtitlePackage;
};
async function main() {
  const { values } = parseArgs({
    options: {
      help: { type: "boolean" },
      material: { type: "string" },
      file: { type: "string" },
      captions: { type: "string" },
      source: { type: "string" },
      permission: { type: "string" },
      start: { type: "string", default: "0" },
      duration: { type: "string", default: "180" },
      execute: { type: "boolean" },
      "retry-unknown": { type: "string" },
      "max-yen": { type: "string", default: "100" },
    },
  });
  if (values.help) {
    console.log(
      "npm run prepare-material -- --material ID --file local.mp4 --source 提供元 --permission 許可記録 --start 0 --duration 180 --max-yen 100 --execute\n字幕入力: --captions subtitles.vtt (VTT/SRT/JSON)。生音声のURL取得は行いません。パスワードはLAB_PASSWORDまたは.envのAPP_PASSWORD。--executeなしは費用見積もりのみ。",
    );
    return;
  }
  if (
    !values.material ||
    !(values.file || values.captions) ||
    !values.source ||
    !values.permission
  )
    throw new Error(
      "--material, --file または --captions, --source, --permission が必要です",
    );
  const start = Number(values.start),
    duration = Number(values.duration),
    maxYen = Number(values["max-yen"]);
  if (
    !Number.isFinite(start) ||
    start < 0 ||
    !Number.isFinite(duration) ||
    duration <= 0 ||
    duration > 14400 ||
    !Number.isFinite(maxYen) ||
    maxYen <= 0
  )
    throw new Error("開始時刻・長さ・上限費用を確認してください");
  const path = resolve(values.file || values.captions!);
  if (
    !statSync(path).isFile() ||
    (values.captions && statSync(path).size > 1024 * 1024)
  )
    throw new Error("字幕は1MB以内の通常ファイルを指定してください");
  const sourceHasher = createHash("sha256");
  for await (const part of createReadStream(path)) sourceHasher.update(part);
  const inputHash = sourceHasher.digest("hex");
  const settings = {
    version: 1,
    model: "whisper-1",
    translationModel: "gpt-4.1-mini",
    dictionary: "aws-v1",
    chunkSeconds: 180,
    overlapSeconds: 2,
    start,
    duration,
    source: values.source,
    permission: values.permission,
    kind: values.captions ? "captions" : "audio",
  };
  const subtitleInput = values.captions
    ? readFileSync(path, "utf8")
    : undefined;
  const inputCues = subtitleInput
    ? path.endsWith(".json")
      ? packageSchema.parse(JSON.parse(subtitleInput)).cues
      : parseSubtitles(subtitleInput)
    : undefined;
  const estimate = inputCues
    ? Math.ceil(
        inputCues.filter(
          (c) =>
            !c.translation &&
            c.endMs > start * 1000 &&
            c.startMs < (start + duration) * 1000,
        ).length / 12,
      ) * 5
    : (duration / 60) * 0.006 * Number(process.env.USD_JPY || 150) +
      Math.ceil(duration / 24) * 5;
  console.log(
    `対象 ${start}秒〜${start + duration}秒 / 推定 ¥${estimate.toFixed(2)}（翻訳を含む目安、月間枠と合算）`,
  );
  if (estimate > maxYen)
    throw new Error(
      "--max-yen の上限を超えます。区間を短くするか、上限を見直してください",
    );
  if (!values.execute) {
    console.log(
      "まだ課金処理を開始していません。実行する場合は --execute を付けてください。",
    );
    return;
  }
  const root = resolve(".local/preparation");
  mkdirSync(root, { recursive: true, mode: 0o700 });
  for (const entry of readdirSync(root)) {
    const dir = join(root, entry);
    if (statSync(dir).isDirectory()) {
      const audio = join(dir, "audio");
      if (existsSync(audio) && Date.now() - statSync(audio).mtimeMs > 86400000)
        rmSync(audio, { recursive: true, force: true });
    }
  }
  const base = new URL(process.env.LAB_URL || "http://127.0.0.1:8787");
  if (
    !["http:", "https:"].includes(base.protocol) ||
    base.username ||
    base.password
  )
    throw new Error("LAB_URLを確認してください");
  if (
    base.protocol === "http:" &&
    !["localhost", "127.0.0.1", "[::1]"].includes(base.hostname)
  )
    throw new Error("リモートCLI接続にはhttpsが必要です");
  let cookie = "";
  const password = process.env.LAB_PASSWORD || process.env.APP_PASSWORD;
  if (!password) throw new Error("LAB_PASSWORDを環境変数で設定してください");
  const key = digest(
    JSON.stringify({ inputHash, settings, material: values.material }),
  );
  const dir = join(root, key);
  mkdirSync(dir, { recursive: true, mode: 0o700 });
  const manifestPath = join(dir, "manifest.json");
  const lockPath = join(dir, "running.lock");
  let lock: number;
  try {
    lock = openSync(lockPath, "wx", 0o600);
    writeFileSync(lock, String(process.pid));
  } catch {
    throw new Error(
      `この教材の処理ロックがあります。他のCLIが停止していることを確認してから ${lockPath} を削除してください`,
    );
  }
  async function request(
    route: string,
    body?: any,
    method = body === undefined ? "GET" : "POST",
    id?: string,
  ) {
    const form = body instanceof FormData;
    const response = await fetch(new URL(`/api${route}`, base), {
      method,
      headers: {
        "X-Lab-Request": "1",
        ...(!form ? { "Content-Type": "application/json" } : {}),
        ...(cookie ? { Cookie: cookie } : {}),
        ...(id ? { "Idempotency-Key": id } : {}),
      },
      body: body === undefined ? undefined : form ? body : JSON.stringify(body),
      signal: AbortSignal.timeout(150000),
    });
    if (route === "/login")
      cookie = response.headers.get("set-cookie")?.split(";")[0] || "";
    const data = (await response.json()) as any;
    if (!response.ok) throw new Error(data.error || "サーバーへ同期できません");
    return data;
  }
  let manifest: Manifest | undefined;
  const audioDir = join(dir, "audio");
  let success = false,
    cancelled = false;
  process.once("SIGINT", () => {
    cancelled = true;
  });
  process.once("SIGTERM", () => {
    cancelled = true;
  });
  try {
    await request("/login", { password });
    const catalog = await request("/catalog");
    const material = catalog.materials.find(
      (m: any) => m.id === values.material,
    );
    if (!material) throw new Error("教材IDが見つかりません");
    manifest = existsSync(manifestPath)
      ? JSON.parse(readFileSync(manifestPath, "utf8"))
      : undefined;
    if (!manifest) {
      const job = await request(
        `/materials/${values.material}/preparation-jobs`,
        {
          sourceDescription: values.source,
          permission: values.permission,
          inputHash,
          startMs: start * 1000,
          durationMs: duration * 1000,
          maxYen,
          settings,
        },
      );
      manifest = { jobId: job.id, settings, inputHash, steps: {} };
      atomic(manifestPath, manifest);
    }
    const current = manifest;
    await request(`/preparation-jobs/${current.jobId}`, { maxYen }, "PATCH");
    async function step(
      name: string,
      run: (operationId: string) => Promise<any>,
    ) {
      if (cancelled) throw new Error("キャンセルしました");
      const old = current.steps[name];
      if (old?.status === "done") return old.result;
      if (old) {
        const remote = await request(`/operations/${old.operationId}`);
        if (remote.status === "done") {
          old.result = remote.result;
          old.status = "done";
          atomic(manifestPath, current);
          return old.result;
        }
      }
      if (
        old &&
        (old.status === "pending" || old.status === "unknown") &&
        values["retry-unknown"] !== name
      )
        throw new Error(
          `${name} の前回結果が不明です。二重課金を避けるため停止しました。状況・費用を確認し、追加実行を認める場合だけ --retry-unknown ${name} を指定してください`,
        );
      const item: Step = {
        operationId:
          values["retry-unknown"] === name
            ? randomUUID()
            : old?.operationId || randomUUID(),
        status: "pending",
      };
      current.steps[name] = item;
      atomic(manifestPath, current);
      await request(
        `/preparation-jobs/${current.jobId}`,
        {
          status: name.startsWith("stt") ? "transcribing" : "translating",
          steps: Object.fromEntries(
            Object.entries(current.steps).map(([k, v]) => [
              k,
              { status: v.status },
            ]),
          ),
        },
        "PATCH",
      );
      try {
        const result = await run(item.operationId);
        item.result = result;
        item.status = "done";
        atomic(manifestPath, current);
        return result;
      } catch (error) {
        item.status = "unknown";
        atomic(manifestPath, current);
        throw error;
      }
    }
    let cues: Cue[] = [];
    if (current.package) {
      cues = current.package.cues;
    } else if (values.captions) {
      const text = readFileSync(path, "utf8");
      cues = (
        path.endsWith(".json")
          ? packageSchema.parse(JSON.parse(text)).cues
          : parseSubtitles(text)
      ).filter(
        (c) => c.endMs > start * 1000 && c.startMs < (start + duration) * 1000,
      );
    } else {
      mkdirSync(audioDir, { recursive: true, mode: 0o700 });
      await request(
        `/preparation-jobs/${current.jobId}`,
        { status: "extracting" },
        "PATCH",
      );
      for (let i = 0; i < duration; i += 180) {
        if (cancelled) throw new Error("キャンセルしました");
        const keepStart = start + i,
          keepEnd = start + Math.min(i + 180, duration),
          chunkStart = Math.max(start, keepStart - 2),
          chunkEnd = Math.min(start + duration, keepEnd + 2);
        const chunk = join(audioDir, `chunk-${i}.wav`);
        if (!current.steps[`stt-${i}`]?.result) {
          const result = spawnSync(
            "ffmpeg",
            [
              "-nostdin",
              "-hide_banner",
              "-loglevel",
              "error",
              "-y",
              "-ss",
              String(chunkStart),
              "-i",
              path,
              "-t",
              String(chunkEnd - chunkStart),
              "-vn",
              "-ac",
              "1",
              "-ar",
              "16000",
              "-c:a",
              "pcm_s16le",
              chunk,
            ],
            { encoding: "utf8", maxBuffer: 1024 * 1024 },
          );
          if (result.status !== 0)
            throw new Error(
              "FFmpegで音声を準備できませんでした。ファイル形式・利用区間を確認してください",
            );
        }
        const result = await step(`stt-${i}`, async (operationId) => {
          const bytes = readFileSync(chunk);
          const form = new FormData();
          form.set(
            "file",
            new File([bytes], "audio.wav", { type: "audio/wav" }),
          );
          form.set("duration", String(chunkEnd - chunkStart));
          return request(
            `/preparation-jobs/${current.jobId}/transcribe`,
            form,
            "POST",
            operationId,
          );
        });
        cues = mergeCueChunks(
          cues,
          normalizeSegments(
            result.segments,
            chunkStart * 1000,
            start * 1000,
            (start + duration) * 1000,
          ),
          chunkStart * 1000,
        );
      }
      // Adjacent chunks are clipped at their ownership boundary; normalize STT segment overlaps within a chunk too.
      cues.sort((a, b) => a.startMs - b.startMs);
    }
    for (let i = 0; i < cues.length; i += 12) {
      const group = cues.slice(i, i + 12).filter((c) => !c.translation);
      if (!group.length) continue;
      const result = await step(`translate-${i}`, (id) =>
        request(
          `/preparation-jobs/${current.jobId}/translate`,
          {
            cues: group.map((c) => ({ cueId: c.cueId, text: c.originalText })),
          },
          "POST",
          id,
        ),
      );
      for (const cue of group) {
        const translated = result.translations?.find(
          (t: any) => t.cueId === cue.cueId,
        );
        if (!translated?.ja) throw new Error("翻訳が不足しています");
        cue.translation = translated.ja;
      }
    }
    const pack = packageSchema.parse({
      version: 1,
      sourceUrl: material.url,
      sourceDescription: values.source,
      permission: values.permission,
      inputHash,
      model: values.captions
        ? "imported-subtitles + gpt-4.1-mini"
        : "whisper-1 + gpt-4.1-mini",
      generatedAt: now(),
      cues,
    });
    current.package = pack;
    atomic(manifestPath, current);
    atomic(join(dir, "subtitle-package.json"), pack);
    await request(
      `/preparation-jobs/${current.jobId}`,
      { status: "validating" },
      "PATCH",
    );
    await request(`/materials/${values.material}/subtitle-packages`, pack);
    rmSync(audioDir, { recursive: true, force: true });
    await request(
      `/preparation-jobs/${current.jobId}`,
      { status: "ready", deletedAudio: true },
      "PATCH",
    );
    success = true;
    console.log(
      `字幕 ${cues.length}件を取り込みました。${join(dir, "subtitle-package.json")}\n動画の冒頭・中盤・終盤・分割境界を試聴し、必要なら時刻を補正してください。`,
    );
  } catch (error) {
    if (manifest)
      await request(
        `/preparation-jobs/${manifest.jobId}`,
        {
          status: cancelled ? "cancelled" : "failed",
          failure: error instanceof Error ? error.message : "処理失敗",
          deletedAudio: cancelled,
        },
        "PATCH",
      ).catch(() => {});
    throw error;
  } finally {
    if (success || cancelled)
      rmSync(audioDir, { recursive: true, force: true });
    closeSync(lock);
    rmSync(lockPath, { force: true });
  }
}
if (
  process.argv[1] &&
  resolve(process.argv[1]) === resolve(import.meta.filename)
)
  main().catch((e) => {
    console.error(e instanceof Error ? e.message : "教材準備に失敗しました");
    process.exitCode = 1;
  });
