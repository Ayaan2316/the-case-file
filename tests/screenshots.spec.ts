import { expect, test } from "@playwright/test";
import { meanLuma } from "./png";

// screenshot suite: every scene at the standard scroll positions (docs/DEVELOPMENT.md), attached to
// the report. a frame has to be lit (not black/blank), under 150 draw calls, and nothing throws
const POSITIONS = [0.04, 0.12, 0.2, 0.3, 0.45, 0.62, 0.72, 0.85, 0.95];

test.describe("screenshot suite", () => {
  test.skip(({ isMobile }) => isMobile, "desktop walk; the phone tier has its own run");
  test.setTimeout(300_000);

  test("every scene renders within budget", async ({ page }, info) => {
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.goto("/?tier=low");
    await page.waitForFunction(() => document.documentElement.dataset.ready === "true", null, { timeout: 150_000 });
    for (const p of POSITIONS) {
      await page.evaluate((v) => window.__caseFile?.scrollTo(v), p);
      // later rooms load lazily, wait until the one at p has captured its probe
      const probe = p >= 0.665 && p < 0.885 ? "interroProbe" : p >= 0.58 && p < 0.665 ? "evidenceProbe" : null;
      if (probe)
        await page.waitForFunction((k) => (window.__caseFile?.store.getState() as unknown as Record<string, boolean>)[k], probe, {
          timeout: 90_000,
        });
      await page.waitForTimeout(1800);
      const { calls } = await page.evaluate(() => window.__caseFile!.measure(600));
      const shot = await page.screenshot();
      await info.attach(`p${p.toFixed(2)}`, { body: shot, contentType: "image/png" });
      const luma = meanLuma(shot);
      expect.soft(luma, `p${p} is lit`).toBeGreaterThan(6);
      expect.soft(luma, `p${p} isn't blank`).toBeLessThan(235);
      expect.soft(calls, `p${p} draw calls`).toBeLessThan(150);
    }
    expect(errors).toEqual([]);
  });
});
