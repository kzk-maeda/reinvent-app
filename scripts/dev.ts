import "dotenv/config";
import { spawn } from "node:child_process";
const children = [
  spawn("node", ["--import", "tsx", "server/index.ts"], {
    stdio: "inherit",
    env: { ...process.env, PORT: "8787", HOST: "127.0.0.1" },
  }),
  spawn(
    "node",
    [
      "node_modules/vite/bin/vite.js",
      "--host",
      process.env.HOST || "127.0.0.1",
      "--port",
      process.env.PORT || "5173",
    ],
    { stdio: "inherit" },
  ),
];
let ending = false;
function stop(code = 0) {
  if (ending) return;
  ending = true;
  children.forEach((child) => child.kill("SIGTERM"));
  process.exitCode = code;
}
children.forEach((child) => child.on("exit", (code) => stop(code ?? 1)));
process.on("SIGINT", () => stop());
process.on("SIGTERM", () => stop());
