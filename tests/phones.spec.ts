import { expect, type Page, test } from "@playwright/test";

// phones are half the visitors. they get the lite file (lite.spec.ts), these are for a phone that
// asks for the 3D (`?3d`): loads on the phone path (low tier, own resolution, no mouse-only passes),
// a swipe moves the story, tapping a polaroid opens its file, and sideways every tool stays on screen.
// uses chrome's pixel 7 emulation
test.describe("/ on a phone, in 3D", () => {
  test.skip(({ isMobile }) => !isMobile, "phones only");
  test.setTimeout(180_000);

  const ready = (page: Page) =>
    page.waitForFunction(() => document.documentElement.dataset.ready === "true", null, { timeout: 150_000 });

  test("loads on the phone path and scrolls with a thumb", async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.goto(`/?3d&gpu=${encodeURIComponent("Adreno (TM) 740")}`);
    await ready(page);
    const s = await page.evaluate(() => {
      const { phone, tier, short, assets, renderScale } = window.__caseFile!.store.getState();
      const c = document.querySelector("canvas")!;
      return { phone, tier, short, assets, renderScale, ratio: c.width / innerWidth };
    });
    expect(s).toMatchObject({ phone: true, tier: "low", short: true, assets: ".low" });
    // flagships start sharp, 1.5 canvas px per css px (PHONE_DPR), not 1
    expect(s.ratio).toBeGreaterThan(1.3);

    // thumb swipe up (raw touch events so it's the browser's own touch scrolling)
    const cdp = await page.context().newCDPSession(page);
    let y = 650;
    await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x: 200, y }] });
    for (let i = 0; i < 12; i++) {
      y -= 30;
      await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x: 200, y }] });
      await page.waitForTimeout(16);
    }
    await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
    await expect.poll(() => page.evaluate(() => window.__caseFile!.store.getState().progress)).toBeGreaterThan(0.02);
    expect(errors).toEqual([]);
  });

  test("a budget phone gets the light path at a steady 30", async ({ page }) => {
    await page.goto(`/?3d&gpu=${encodeURIComponent("Mali-G57 MC2")}`);
    await ready(page);
    const s = await page.evaluate(() => {
      const { budget, fps30, renderScale } = window.__caseFile!.store.getState();
      return { budget, fps30, renderScale };
    });
    expect(s).toMatchObject({ budget: true, fps30: true });
    expect(s.renderScale).toBeLessThan(0.7);
    await page.evaluate(() => window.__caseFile?.scrollTo(0.2));
    // office shaders for this path compile on the way (other tests in the same browser warm different
    // ones), let them finish before measuring the steady rate
    await page.waitForTimeout(5000);
    const { fps } = await page.evaluate(() => window.__caseFile!.measure(2000));
    expect(fps).toBeGreaterThan(26);
    expect(fps).toBeLessThan(34);
  });

  test("a tapped polaroid opens its file", async ({ page }) => {
    await page.goto("/?3d");
    await ready(page);
    await page.evaluate(() => window.__caseFile?.scrollTo(0.45));
    await page.waitForTimeout(3000);
    await expect(page.getByText("Tap a polaroid to open the file.")).toBeAttached();
    // tap around the board until a polaroid responds
    let opened: string | null = null;
    for (let y = 120; y < 640 && !opened; y += 40)
      for (let x = 40; x < 400 && !opened; x += 40) {
        await page.touchscreen.tap(x, y);
        opened = await page.evaluate(() => window.__caseFile!.store.getState().openExhibit);
      }
    expect(opened).toBeTruthy();
    await expect(page.getByRole("dialog")).toBeVisible();
  });

  test("held sideways, the evidence room's tools all fit", async ({ page }) => {
    await page.setViewportSize({ width: 839, height: 412 });
    await page.goto("/?3d");
    await ready(page);
    await page.evaluate(() => window.__caseFile?.scrollTo(0.62));
    await page.waitForFunction(() => window.__caseFile?.store.getState().evidenceProbe === true, null, { timeout: 60_000 });
    await page.waitForTimeout(2000);
    const box = await page.evaluate(() => {
      const r = document.querySelector("ol")!.closest("section")!.getBoundingClientRect();
      return { top: r.top, bottom: r.bottom, height: innerHeight };
    });
    expect(box.top).toBeGreaterThanOrEqual(0);
    expect(box.bottom).toBeLessThanOrEqual(box.height);
  });
});
