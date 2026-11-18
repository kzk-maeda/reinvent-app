import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

test.beforeEach(async ({ page }) => {
  await page.goto("/");
  await page.getByLabel("本人用パスワード").fill("local-e2e-password");
  await page.getByRole("button", { name: "学習ノートを開く" }).click();
  await expect(page.locator("main h1")).toBeVisible();
  await page.request.delete("/api/history", {
    headers: { "X-Lab-Request": "1" },
  });
});

test("practices AI engineering from scenario selection through review and retry", async ({
  page,
}) => {
  await page.getByRole("link", { name: "ブース会話", exact: true }).click();
  await page.getByLabel("題材と相手").selectOption("ai-development");
  await expect(page.getByLabel("会話の場面")).toHaveValue(
    "エンジニアとの情報交換",
  );
  await expect(page.getByLabel("達成したいこと")).toHaveValue(
    /AIの活用範囲・開発基盤・組織や役割の変化/,
  );
  await expect(
    page.getByRole("heading", { name: "AI時代の開発手法を聞く" }),
  ).toBeVisible();
  await expect(
    page.getByText(
      "相手のチーム設定は架空です。実在企業の導入状況を示すものではありません。",
    ),
  ).toBeVisible();
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
  await page.getByRole("button", { name: "会話を準備する" }).click();
  await page.getByText("このシナリオの質問例", { exact: true }).click();
  const tools =
    "Do you use tools like Factory, or have you built your own internal platform?";
  await page.getByRole("button", { name: tools, exact: true }).click();
  await expect(page.getByLabel("テキストで話す")).toHaveValue(tools);
  let release!: () => void;
  let entered!: () => void;
  const waiting = new Promise<void>((resolve) => {
    release = resolve;
  });
  const intercepted = new Promise<void>((resolve) => {
    entered = resolve;
  });
  await page.route(
    "**/api/practice-sessions/*/turns",
    async (route) => {
      entered();
      await waiting;
      await route.continue();
    },
    { times: 1 },
  );
  await page.getByRole("button", { name: "送信 ↑", exact: true }).click();
  await intercepted;
  const roles = "How have engineers' roles changed as you've adopted AI?";
  try {
    await page.getByRole("button", { name: roles, exact: true }).click();
    await expect(page.getByLabel("テキストで話す")).toHaveValue(roles);
  } finally {
    release();
  }
  await expect(page.locator(".turn.assistant").last()).toContainText(
    "thin internal platform",
  );
  await expect(page.getByLabel("テキストで話す")).toHaveValue(roles);
  await page.getByRole("button", { name: "送信 ↑", exact: true }).click();
  await expect(page.locator(".turn.assistant").last()).toContainText(
    "framing problems",
  );
  await page
    .getByRole("button", { name: "Could you give me an example?", exact: true })
    .click();
  await page.getByRole("button", { name: "送信 ↑", exact: true }).click();
  await expect(page.locator(".turn.assistant").last()).toContainText(
    "junior engineer",
  );
  await page
    .getByLabel("日本語で「言いたいこと」")
    .fill("自前の開発基盤があるか聞きたい");
  await page
    .getByRole("button", { name: "英語のヒントを見る", exact: true })
    .click();
  await expect(page.locator(".hint-result")).toContainText(
    "Do you use tools like Factory",
  );
  await page.getByRole("button", { name: "振り返りを作る" }).click();
  await expect(
    page.getByRole("heading", { name: "次の会話につながる振り返り" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "復習に保存" }).click();
  await page.getByRole("link", { name: "復習ノート", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "答えを見る" }).first(),
  ).toBeVisible();
  await page.getByRole("link", { name: "振り返り", exact: true }).click();
  await page.getByRole("button", { name: "再挑戦", exact: true }).click();
  await expect(
    page.getByText("このシナリオの質問例", { exact: true }),
  ).toBeVisible();
  await expect(page.locator(".goal-strip")).toContainText("開発基盤");
});

test("initializes the scenario from a link and resets its defaults when changing partners", async ({
  page,
}) => {
  await page.goto("/#/practice?pack=ai-development");
  await expect(page.getByLabel("題材と相手")).toHaveValue("ai-development");
  await expect(page.getByLabel("会話の場面")).toHaveValue(
    "エンジニアとの情報交換",
  );
  await page.getByLabel("題材と相手").selectOption("networking");
  await expect(page.getByLabel("会話の場面")).toHaveValue("ネットワーキング");
  await expect(page.getByLabel("達成したいこと")).toHaveValue(
    "自分から2つ質問し、聞き返して、会話を終える",
  );
});
