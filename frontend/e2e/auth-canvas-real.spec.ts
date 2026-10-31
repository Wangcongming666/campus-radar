import { test, expect } from "@playwright/test";
type CanvasProbe = {
  hiddenGradientFills: number;
  frames: number;
  whitePixels: number;
};
declare global {
  interface Window {
    authCanvasProbe: CanvasProbe;
  }
}
test.use({ deviceScaleFactor: 2, viewport: { width: 1440, height: 900 } });

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    const originalFill = CanvasRenderingContext2D.prototype.fill;
    const originalClear = CanvasRenderingContext2D.prototype.clearRect;
    const probe = { hiddenGradientFills: 0, frames: 0, whitePixels: 0 };
    Object.assign(window, { authCanvasProbe: probe });
    CanvasRenderingContext2D.prototype.fill = function (
      ...args: Parameters<typeof originalFill>
    ) {
      if (
        this.canvas.closest(".login-visual") &&
        this.globalAlpha < 0.001 &&
        this.fillStyle instanceof CanvasGradient
      )
        probe.hiddenGradientFills++;
      return Reflect.apply(originalFill, this, args);
    };
    const sample = document.createElement("canvas");
    sample.width = 220;
    sample.height = 200;
    const pixels = sample.getContext("2d", { willReadFrequently: true })!;
    CanvasRenderingContext2D.prototype.clearRect = function (
      ...args: Parameters<typeof originalClear>
    ) {
      if (this.canvas.closest(".login-visual") && this.canvas.width) {
        pixels.clearRect(0, 0, 220, 200);
        pixels.drawImage(this.canvas, 0, 0, 220, 200);
        const data = pixels.getImageData(0, 0, 220, 200).data;
        let white = 0;
        for (let i = 0; i < data.length; i += 4)
          if (
            data[i] > 235 &&
            data[i + 1] > 235 &&
            data[i + 2] > 235 &&
            data[i + 3] > 128
          )
            white++;
        probe.whitePixels = Math.max(probe.whitePixels, white);
        probe.frames++;
      }
      return Reflect.apply(originalClear, this, args);
    };
  });
});

test("registration does not submit invisible radar gradient fills", async ({
  page,
  browserName,
}) => {
  await page.goto("/register");
  await expect
    .poll(() => page.evaluate(() => window.authCanvasProbe.frames))
    .toBeGreaterThan(8);
  const probe = await page.evaluate(() => window.authCanvasProbe);
  expect(probe.frames).toBeGreaterThan(5);
  expect(probe.hiddenGradientFills).toBe(0);
  expect(probe.whitePixels).toBe(0);
  await page
    .getByRole("textbox", { name: "邮箱", exact: true })
    .fill("canvas-check@example.test");
  await page.waitForTimeout(300);
  await page.screenshot({
    path: `../.data/verification/auth-canvas-fix/${browserName}-register-retina.png`,
  });
});

test("switches, focus and resizing never paint white wedges", async ({
  page,
  browserName,
}) => {
  await page.goto("/login");
  for (let i = 0; i < 6; i++) {
    const registering = i % 2 === 0;
    await page
      .getByRole("navigation", { name: "登录与注册切换" })
      .getByRole("link", { name: registering ? "注册" : "登录", exact: true })
      .click();
    await page
      .getByRole("textbox", { name: "邮箱", exact: true })
      .fill("canvas-check@example.test");
    await page.getByRole("link", { name: "返回首页", exact: true }).focus();
    await page.setViewportSize({
      width: i % 2 ? 1440 : 1080,
      height: i % 2 ? 900 : 720,
    });
    await page.waitForTimeout(500);
  }
  const probe = await page.evaluate(() => window.authCanvasProbe);
  test.info().annotations.push({
    type: "canvas-sample",
    description: JSON.stringify(probe),
  });
  expect(probe.frames).toBeGreaterThan(60);
  expect(probe.whitePixels).toBe(0);
  expect(probe.hiddenGradientFills).toBe(0);
  await page.screenshot({
    path: `../.data/verification/auth-canvas-fix/${browserName}-login-retina.png`,
  });
});

test("mobile pauses the canvas and desktop resumes cleanly", async ({
  page,
}) => {
  await page.goto("/register");
  const frames = () => page.evaluate(() => window.authCanvasProbe.frames);
  await expect.poll(frames).toBeGreaterThan(5);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(100);
  const paused = await frames();
  await page.waitForTimeout(250);
  expect(await frames()).toBe(paused);
  await page.setViewportSize({ width: 1440, height: 900 });
  await expect.poll(frames).toBeGreaterThan(paused + 5);
});
