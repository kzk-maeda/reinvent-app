import { test, expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    const data = window as any;
    data.spoken = [];
    data.cancelled = 0;
    data.played = 0;
    let ready = false;
    const listeners = new Set<() => void>();
    const voices = [
      {
        name: "Japanese default",
        voiceURI: "ja",
        lang: "ja-JP",
        localService: true,
      },
      {
        name: "Basic English",
        voiceURI: "basic",
        lang: "en-US",
        localService: true,
      },
      {
        name: "English Natural",
        voiceURI: "natural",
        lang: "en-US",
        localService: false,
      },
    ];
    data.showEnglishVoices = () => {
      ready = true;
      listeners.forEach((fn) => fn());
    };
    Object.defineProperty(window, "speechSynthesis", {
      value: {
        getVoices: () => (ready ? voices : []),
        addEventListener: (_: string, fn: () => void) => listeners.add(fn),
        removeEventListener: (_: string, fn: () => void) =>
          listeners.delete(fn),
        speak: (u: any) =>
          data.spoken.push({
            text: u.text,
            voice: u.voice?.voiceURI,
            rate: u.rate,
            pitch: u.pitch,
          }),
        cancel: () => {
          data.cancelled++;
        },
      },
    });
    Object.defineProperty(window, "SpeechSynthesisUtterance", {
      value: class {
        constructor(public text: string) {}
      },
    });
    HTMLMediaElement.prototype.play = function () {
      data.played++;
      return Promise.resolve();
    };
    HTMLMediaElement.prototype.pause = function () {};
  });
  await page.goto("/");
  await page.getByLabel("本人用パスワード").fill("local-e2e-password");
  await page.getByRole("button", { name: "学習ノートを開く" }).click();
  await expect(page.locator("main h1")).toBeVisible();
  await page.request.delete("/api/history", {
    headers: { "X-Lab-Request": "1" },
  });
});
async function companyConversation(page: Page) {
  await page.goto("/#/practice?pack=confluent");
  await page.getByLabel("会話の場面").selectOption("企業デモ");
  await page.getByRole("button", { name: "会話を準備する" }).click();
  await page
    .getByLabel("テキストで話す")
    .fill(
      "What is your company name? I'd like to know some demos of your latest products.",
    );
  await page.getByRole("button", { name: "送信 ↑", exact: true }).click();
  await expect(page.locator(".turn.assistant")).toContainText(
    "I'm Alex from Confluent",
  );
  await expect(page.locator(".turn.assistant")).toContainText("Tableflow");
}

test("keeps the booth role, translates without the display checkbox, and selects an English voice", async ({
  page,
}) => {
  let translated = 0;
  await page.route("**/turns/*/translation", (route) => {
    translated++;
    const turnId = route.request().url().split("/").at(-2);
    return route.fulfill({
      json: {
        turnId,
        text: "I'm Alex from Confluent. Today I can walk you through Tableflow and its Databricks integration: bringing Kafka data into Delta tables and Unity Catalog. Would you like a quick overview or a step-by-step walkthrough?",
        translation:
          "Confluentのアレックスです。TableflowとDatabricksの連携デモをご案内します。",
        provider: "openai",
        model: "mock",
      },
    });
  });
  await companyConversation(page);
  const partner = page.locator(".turn.assistant");
  await expect(page.getByLabel("日本語訳（必要時に取得）")).not.toBeChecked();
  await partner.getByRole("button", { name: "日本語訳", exact: true }).click();
  await expect(partner.locator('[lang="ja"]')).toContainText(
    "Confluentのアレックスです",
  );
  await page.getByLabel("日本語訳（必要時に取得）").uncheck();
  await expect(partner.locator('[lang="ja"]')).toHaveCount(0);
  await partner.getByRole("button", { name: "日本語訳", exact: true }).click();
  await expect(partner.locator('[lang="ja"]')).toBeVisible();
  expect(translated).toBe(1);
  await page.evaluate(() => (window as any).showEnglishVoices());
  await expect(page.getByLabel("端末の英語音声", { exact: true })).toHaveValue(
    "natural",
  );
  await partner.getByRole("button", { name: "聞く", exact: true }).click();
  expect(
    await page.evaluate(() => (window as any).spoken.at(-1)),
  ).toMatchObject({ voice: "natural", pitch: 1 });
  await page
    .getByRole("button", { name: "読み上げを停止", exact: true })
    .click();
  await page
    .getByLabel("端末の英語音声", { exact: true })
    .selectOption("basic");
  await partner.getByRole("button", { name: "聞く", exact: true }).click();
  expect(await page.evaluate(() => (window as any).spoken.at(-1).voice)).toBe(
    "basic",
  );
  await page.setViewportSize({ width: 320, height: 700 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  expect(
    (
      await new AxeBuilder({ page })
        .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
        .analyze()
    ).violations,
  ).toEqual([]);
});

test("shows the cost of AI reading and plays generated audio without using the device voice", async ({
  page,
}) => {
  await page.route("**/api/bootstrap", async (route) => {
    const response = await route.fetch(),
      json = await response.json();
    json.connections.speech = true;
    json.connections.speechReservationYen = 44;
    await route.fulfill({ response, json });
  });
  let generated = 0;
  await page.route("**/turns/*/speech", (route) => {
    generated++;
    return route.fulfill({
      json: {
        audio: Buffer.from("RIFF-mock-audio").toString("base64"),
        cached: false,
      },
    });
  });
  await page.reload();
  await companyConversation(page);
  await expect(page.getByLabel("読み上げ方法")).toHaveValue("ai");
  await expect(page.getByText(/生成時に最大¥44/)).toBeVisible();
  await page
    .locator(".turn.assistant")
    .getByRole("button", { name: "聞く", exact: true })
    .click();
  await expect(
    page.getByLabel("読み上げ音声", { exact: true }),
  ).toHaveAttribute("src", /^data:audio\/wav;base64,/);
  await expect.poll(() => page.evaluate(() => (window as any).played)).toBe(1);
  expect(generated).toBe(1);
  expect(await page.evaluate(() => (window as any).spoken)).toEqual([]);
  await page
    .getByRole("button", { name: "読み上げを停止", exact: true })
    .click();
});
test("does not restore private screens when a reading cost response arrives after logout", async ({
  page,
}) => {
  await page.route("**/api/bootstrap", async (route) => {
    const response = await route.fetch(),
      json = await response.json();
    json.connections.speech = true;
    json.connections.speechReservationYen = 44;
    await route.fulfill({ response, json });
  });
  await page.route("**/turns/*/speech", (route) =>
    route.fulfill({
      json: { audio: Buffer.from("RIFF-mock-audio").toString("base64") },
    }),
  );
  await page.reload();
  await companyConversation(page);
  let release!: () => void, started!: () => void;
  const held = new Promise<void>((resolve) => {
    release = resolve;
  });
  const waiting = new Promise<void>((resolve) => {
    started = resolve;
  });
  await page.route("**/api/usage", async (route) => {
    const response = await route.fetch();
    started();
    await held;
    await route.fulfill({ response });
  });
  await page
    .locator(".turn.assistant")
    .getByRole("button", { name: "聞く", exact: true })
    .click();
  await waiting;
  const usageResponse = page.waitForResponse("**/api/usage");
  try {
    await page.setViewportSize({ width: 1280, height: 900 });
    await page
      .locator(".sidebar")
      .getByRole("button", { name: "ログアウト" })
      .click();
    await expect(page.getByLabel("本人用パスワード")).toBeVisible();
  } finally {
    release();
  }
  await (await usageResponse).finished();
  await page.evaluate(
    () =>
      new Promise<void>((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
      ),
  );
  await expect(page.getByLabel("本人用パスワード")).toBeVisible();
  await expect(page.locator(".shell")).toHaveCount(0);
});
