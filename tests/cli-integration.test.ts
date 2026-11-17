import { it, expect } from "vitest";
import { serve } from "@hono/node-server";
import {
  mkdtempSync,
  writeFileSync,
  rmSync,
  existsSync,
  readdirSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawn } from "node:child_process";
import { Store } from "../server/db.ts";
import { createApp, type AppConfig } from "../server/app.ts";
it("runs the real CLI against the local API and resumes without duplicated steps", async () => {
  const dir = mkdtempSync(join(tmpdir(), "english-cli-"));
  const input = join(dir, "input.srt");
  writeFileSync(
    input,
    "1\n00:00:00,000 --> 00:00:02,000\nHow does this work?\n\n2\n00:00:03,000 --> 00:00:05,000\nCould you give me an example?",
  );
  const store = new Store(":memory:");
  const config: AppConfig = {
    password: "cli-test-password",
    provider: "simulator",
    textModel: "gpt-4.1-mini",
    voiceModel: "gpt-realtime",
    transcriptionModel: "whisper-1",
    monthlyBudget: 3000,
    usdJpy: 150,
    voiceReservationYen: 500,
    maxSeconds: 600,
  };
  const lab = createApp(store, config);
  const server = serve({
    fetch: lab.app.fetch,
    hostname: "127.0.0.1",
    port: 0,
  });
  await new Promise<void>((r) => server.on("listening", r));
  const address = server.address() as { port: number };
  const args = [
    "--import",
    new URL("../node_modules/tsx/dist/loader.mjs", import.meta.url).href,
    resolve("cli/prepare.ts"),
    "--material",
    "demo",
    "--captions",
    input,
    "--source",
    "independent fixture",
    "--permission",
    "original test material",
    "--execute",
  ];
  async function run(extra: string[] = []) {
    return new Promise<{ code: number | null; output: string }>(
      (resolve, reject) => {
        const c = spawn(process.execPath, [...args, ...extra], {
          cwd: dir,
          env: {
            ...process.env,
            LAB_URL: `http://127.0.0.1:${address.port}`,
            LAB_PASSWORD: config.password,
          },
        });
        let output = "";
        c.stdout.on("data", (d) => (output += d));
        c.stderr.on("data", (d) => (output += d));
        c.on("error", reject);
        c.on("exit", (code) => resolve({ code, output }));
      },
    );
  }
  try {
    const first = await run();
    expect(first.code, first.output).toBe(0);
    expect(first.output).not.toContain(config.password);
    expect(store.all("job")).toHaveLength(1);
    expect(store.get<any>("material", "demo").captions.cues).toHaveLength(2);
    const operationCount = store.all("operation").length;
    const second = await run(["--max-yen", "200"]);
    expect(second.code, second.output).toBe(0);
    expect(store.all("operation")).toHaveLength(operationCount);
    const root = join(dir, ".local/preparation");
    const jobDir = join(root, readdirSync(root)[0]);
    expect(existsSync(join(jobDir, "running.lock"))).toBe(false);
    expect(existsSync(join(jobDir, "audio"))).toBe(false);
    expect(lab.budget.snapshot().totalYen).toBe(0);
  } finally {
    await lab.voice.close();
    await new Promise<void>((r) => server.close(() => r()));
    store.close();
    rmSync(dir, { recursive: true, force: true });
  }
}, 20000);
