import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
test.beforeEach(async ({ page }) => {
  await page.goto("/");
  await page.getByLabel("本人用パスワード").fill("local-e2e-password");
  await page.getByRole("button", { name: "学習ノートを開く" }).click();
  await expect(
    page.getByRole("heading", { name: /次の質問が、/ }),
  ).toBeVisible();
  await page.request.delete("/api/history", {
    headers: { "X-Lab-Request": "1" },
  });
});
test("completes video, subtitle toggles, conversation feedback and review", async ({
  page,
}) => {
  await page.getByRole("link", { name: "セッション", exact: true }).click();
  await page.getByRole("heading", { name: "字幕操作のサンプル" }).click();
  await page.getByRole("button", { name: "両方", exact: true }).click();
  await expect(
    page.getByText("信頼性の高いAIシステム", { exact: false }),
  ).toBeVisible();
  await page.getByRole("button", { name: "0:06へ移動" }).click();
  await expect(page.locator(".cue.active")).toContainText(
    "Start with a small use case",
  );
  await page.getByRole("button", { name: "この表現を保存" }).click();
  await expect(page.getByRole("status")).toHaveText("保存しました");
  await page.getByRole("button", { name: "このテーマで会話する" }).click();
  await page
    .getByLabel("テキストで話す")
    .fill("Could you explain the last part again?");
  await page.getByRole("button", { name: "送信" }).click();
  await expect(page.locator(".turn.assistant")).toBeVisible();
  await page.getByRole("button", { name: "振り返りを作る" }).click();
  await expect(
    page.getByRole("heading", { name: "次の会話につながる振り返り" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "復習に保存" }).click();
  await page.getByRole("link", { name: "復習ノート", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "復習ノート", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "答えを見る" }).first().click();
  await page.getByRole("button", { name: "思い出せた" }).click();
  await expect(page.getByRole("status")).toContainText("次の復習日");
});
test("preserves server data across devices, deletes history and revokes logout", async ({
  page,
  browser,
}) => {
  await page
    .getByRole("link", { name: "旅行・会場フレーズ", exact: true })
    .click();
  await page.getByRole("button", { name: "復習に保存" }).first().click();
  await expect(page.getByRole("status")).toHaveText("保存しました");
  const other = await browser.newContext();
  const p = await other.newPage();
  await p.goto("/");
  await p.getByLabel("本人用パスワード").fill("local-e2e-password");
  await p.getByRole("button", { name: "学習ノートを開く" }).click();
  await p.goto("/#/review");
  await expect(
    p.getByRole("heading", { name: "手荷物受取所はどこですか" }),
  ).toBeVisible();
  await other.close();
  await page.goto("/#/settings");
  await page
    .getByRole("button", { name: "学習履歴をすべて削除", exact: true })
    .click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "削除する" })
    .click();
  await expect(page.getByRole("status")).toContainText("履歴とこの端末");
  await page.goto("/#/review");
  await expect(
    page.getByRole("heading", { name: "今日の復習はありません" }),
  ).toBeVisible();
});
test("supports 320px width, keyboard focus and accessible main screens", async ({
  page,
}) => {
  await page.setViewportSize({ width: 320, height: 700 });
  for (const route of [
    "/#/",
    "/#/materials",
    "/#/practice",
    "/#/phrases",
    "/#/review",
    "/#/settings",
  ]) {
    await page.goto(route);
    await expect(page.locator("main h1")).toBeVisible();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBeTruthy();
    const results = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
      .analyze();
    expect(results.violations).toEqual([]);
  }
  await page.keyboard.press("Tab");
  expect(await page.evaluate(() => document.activeElement?.tagName)).not.toBe(
    "BODY",
  );
});
test("offline cards load without resuming charged work", async ({
  page,
  context,
}) => {
  await page.goto("/#/phrases");
  await page.getByRole("button", { name: "復習に保存" }).first().click();
  await page.goto("/#/review");
  await page.getByRole("button", { name: "オフライン用に保存" }).click();
  await expect(page.getByRole("status")).toContainText("この端末に30日間保存");
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
  });
  await page.reload();
  await expect(page.locator("main h1")).toBeVisible();
  await context.setOffline(true);
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "保存した表現を、もう一度。" }),
  ).toBeVisible();
  await expect(
    page.getByText("手荷物受取所はどこですか", { exact: true }).first(),
  ).toBeVisible();
  await context.setOffline(false);
});
test("microphone denial leaves text practice available without an AI connection", async ({
  page,
}) => {
  await page.route("**/api/bootstrap", async (route) => {
    const r = await route.fetch();
    const data = await r.json();
    data.connections.voice = true;
    await route.fulfill({ response: r, json: data });
  });
  await page.addInitScript(() => {
    Object.defineProperty(navigator.mediaDevices, "getUserMedia", {
      value: () =>
        Promise.reject(new DOMException("Denied", "NotAllowedError")),
    });
  });
  await page.reload();
  await page.getByRole("link", { name: "ブース会話", exact: true }).click();
  await page.getByRole("button", { name: "会話を準備する" }).click();
  await page.getByRole("button", { name: "音声で話す" }).click();
  await expect(page.getByRole("alert")).toContainText(
    "マイクが許可されていません",
  );
  await expect(page.getByLabel("テキストで話す")).toBeEnabled();
});
test("dark themes and 200 percent text keep primary layouts accessible", async ({
  page,
}) => {
  await page.emulateMedia({ colorScheme: "dark", reducedMotion: "reduce" });
  for (const theme of ["dark", "system"])
    for (const route of [
      "/#/",
      "/#/practice",
      "/#/settings",
      "/#/material/demo",
    ]) {
      await page.goto(route);
      await expect(page.locator("main h1")).toBeVisible();
      await page.evaluate((theme) => {
        document.documentElement.dataset.theme = theme;
        document.documentElement.style.fontSize = "200%";
      }, theme);
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
        `${theme} ${route}`,
      ).toBe(true);
      const results = await new AxeBuilder({ page })
        .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
        .analyze();
      expect(
        results.violations.map((v) => ({
          id: v.id,
          nodes: v.nodes.map((n) => ({
            html: n.html,
            summary: n.failureSummary,
          })),
        })),
        `${theme} ${route}`,
      ).toEqual([]);
    }
});
