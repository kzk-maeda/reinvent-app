import "dotenv/config";
import { serve } from "@hono/node-server";
import { serveStatic } from "@hono/node-server/serve-static";
import { Store } from "./db.ts";
import { createApp, type AppConfig } from "./app.ts";
const number = (key: string, fallback: number) => {
  const n = Number(process.env[key] || fallback);
  if (!Number.isFinite(n) || n <= 0)
    throw new Error(`${key} の数値設定が不正です`);
  return n;
};
if (
  !process.env.APP_PASSWORD ||
  process.env.APP_PASSWORD.length < 12 ||
  process.env.APP_PASSWORD.startsWith("change-this")
)
  throw new Error(
    "npm run setup で .env を生成するか、12文字以上のAPP_PASSWORDを設定してください",
  );
if (
  process.env.AI_PROVIDER &&
  !["simulator", "openai"].includes(process.env.AI_PROVIDER)
)
  throw new Error("AI_PROVIDER が不正です");
const config: AppConfig = {
  password: process.env.APP_PASSWORD,
  cliToken: process.env.CLI_TOKEN,
  origin: process.env.APP_ORIGIN,
  provider: process.env.AI_PROVIDER === "openai" ? "openai" : "simulator",
  apiKey: process.env.OPENAI_API_KEY,
  textModel: process.env.TEXT_MODEL || "gpt-4.1-mini",
  voiceModel: process.env.VOICE_MODEL || "gpt-realtime",
  transcriptionModel: "whisper-1",
  monthlyBudget: number("MONTHLY_BUDGET_YEN", 3000),
  usdJpy: number("USD_JPY", 150),
  voiceReservationYen: number("VOICE_RESERVATION_YEN", 500),
  maxSeconds: Math.min(number("VOICE_MAX_SECONDS", 600), 600),
};
const store = new Store(process.env.DATABASE_PATH || ".local/lab.sqlite");
for (const s of store.all<any>("session"))
  if (["active", "connecting"].includes(s.status))
    store.put("session", s.id, { ...s, status: "interrupted" });
const { app, voice } = createApp(store, config);
await voice.recover();
app.use("*", async (c, next) => {
  c.header("X-Content-Type-Options", "nosniff");
  c.header("Referrer-Policy", "same-origin");
  c.header(
    "Permissions-Policy",
    "camera=(), geolocation=(), microphone=(self)",
  );
  await next();
});
app.use("/*", serveStatic({ root: "./dist" }));
app.get("*", serveStatic({ path: "./dist/index.html" }));
const server = serve(
  {
    fetch: app.fetch,
    port: number("PORT", 8787),
    hostname: process.env.HOST || "127.0.0.1",
  },
  (info) =>
    console.log(
      `English Lab API: http://${process.env.HOST || "127.0.0.1"}:${info.port} [${config.provider}]`,
    ),
);
let closing = false;
async function close() {
  if (closing) return;
  closing = true;
  await voice.close();
  server.close(() => {
    store.close();
    process.exit();
  });
}
process.on("SIGINT", () => void close());
process.on("SIGTERM", () => void close());
