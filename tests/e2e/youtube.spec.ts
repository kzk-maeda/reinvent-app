import { test, expect } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  await page.goto("/");
  await page.getByLabel("本人用パスワード").fill("local-e2e-password");
  await page.getByRole("button", { name: "学習ノートを開く" }).click();
  await expect(page.locator("main h1")).toBeVisible();
});

test("opens official selections with a Referer and preserves YouTube controls and error fallback", async ({
  page,
}) => {
  let referer: string | undefined;
  await page.route(
    "https://www.youtube-nocookie.com/embed/**",
    async (route) => {
      referer = (await route.request().allHeaders()).referer;
      await route.fulfill({
        contentType: "text/html",
        body: "<html><body>Mock YouTube</body></html>",
      });
    },
  );
  await page.route("https://www.youtube.com/iframe_api", (route) =>
    route.fulfill({
      contentType: "text/javascript",
      body: `window.YT = { Player: function(frame, options) {
      let current = Number(new URL(frame.src).searchParams.get('start'));
      this.playVideo = () => options.events.onStateChange({data: 1});
      this.pauseVideo = () => options.events.onStateChange({data: 2});
      this.seekTo = (seconds) => { current = seconds; };
      this.getCurrentTime = () => current;
      this.getAvailablePlaybackRates = () => [0.75, 1, 1.25];
      this.setPlaybackRate = () => {};
      this.destroy = () => frame.remove();
      window.youtubeTestError = () => options.events.onError({data: 101});
      setTimeout(() => options.events.onReady(), 0);
    }}; window.onYouTubeIframeAPIReady();`,
    }),
  );
  const html = await page.request.get("/");
  expect(html.headers()["referrer-policy"]).toBe(
    "strict-origin-when-cross-origin",
  );
  const saved = await page.request.patch("/api/materials/aws-2025-aim3305", {
    headers: { "X-Lab-Request": "1" },
    data: { positionMs: 70000 },
  });
  expect(saved.status()).toBe(200);
  // Hash navigation preserves the loaded bootstrap; reload to read the saved position.
  await page.reload();
  await page.goto("/#/materials");
  for (const [topic, code] of [
    ["AI", "AIM3305"],
    ["SRE", "ANT341"],
    ["データ基盤", "AIM244"],
  ]) {
    await page.getByRole("button", { name: topic, exact: true }).click();
    await expect(
      page.getByRole("heading", { name: new RegExp(code) }),
    ).toBeVisible();
  }
  await page.getByRole("button", { name: "AI", exact: true }).click();
  await page.getByRole("heading", { name: /AIM3305/ }).click();
  const frame = page.locator(".video-frame iframe");
  await expect(frame).toHaveAttribute("title", /AIM3305/);
  await expect(frame).toHaveAttribute(
    "referrerpolicy",
    "strict-origin-when-cross-origin",
  );
  const url = new URL((await frame.getAttribute("src"))!);
  expect(url.origin + url.pathname).toBe(
    "https://www.youtube-nocookie.com/embed/b0qdrFi7MCw",
  );
  expect(url.searchParams.get("enablejsapi")).toBe("1");
  expect(url.searchParams.get("origin")).toBe("http://127.0.0.1:8787");
  expect(url.searchParams.get("start")).toBe("70");
  await expect.poll(() => referer).toBe("http://127.0.0.1:8787/");
  await expect(page.getByText(/アプリの英日字幕は未準備です/)).toBeVisible();
  await page.setViewportSize({ width: 320, height: 700 });
  expect((await frame.boundingBox())!.height).toBeGreaterThanOrEqual(200);
  const layout = await page.evaluate(() => ({
    width: innerWidth,
    scrollWidth: document.documentElement.scrollWidth,
    overflow: [...document.querySelectorAll("main *")]
      .filter((el) => el.getBoundingClientRect().right > innerWidth + 1)
      .slice(0, 12)
      .map((el) => ({
        tag: el.tagName,
        class: el.className,
        right: el.getBoundingClientRect().right,
      })),
  }));
  expect(layout.scrollWidth, JSON.stringify(layout)).toBe(layout.width);
  await page.getByRole("button", { name: "再生 ▷", exact: true }).click();
  await expect(page.getByRole("button", { name: "一時停止 Ⅱ" })).toBeVisible();
  await page.getByRole("button", { name: "10秒戻す" }).click();
  await expect(page.getByRole("timer")).toHaveText("1:00");
  await page.evaluate(() => (window as any).youtubeTestError());
  await expect(page.getByRole("alert")).toContainText("埋め込み再生できません");
  await expect(
    page.getByRole("alert").getByRole("link", { name: "元動画" }),
  ).toHaveAttribute("href", "https://www.youtube.com/watch?v=b0qdrFi7MCw");
  await expect(
    page.getByRole("button", { name: "再生 ▷", exact: true }),
  ).toBeDisabled();
});

test("keeps the native iframe and original link when the helper API cannot load", async ({
  page,
}) => {
  await page.route("https://www.youtube-nocookie.com/embed/**", (route) =>
    route.fulfill({
      contentType: "text/html",
      body: "<html><body>Mock native player</body></html>",
    }),
  );
  await page.route("https://www.youtube.com/iframe_api", (route) =>
    route.abort(),
  );
  await page.goto("/#/material/aws-2024-ant341");
  await expect(page.getByRole("alert")).toContainText(
    "補助操作を読み込めませんでした",
  );
  await expect(page.locator(".video-frame iframe")).toHaveAttribute(
    "src",
    /youtube-nocookie\.com\/embed\/l5SdPKqOLHU/,
  );
  await expect(
    page.getByRole("link", { name: "YouTubeで開く" }),
  ).toHaveAttribute("href", "https://www.youtube.com/watch?v=l5SdPKqOLHU");
});
