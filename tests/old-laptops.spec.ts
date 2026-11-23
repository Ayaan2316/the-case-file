import { expect, test } from "@playwright/test";

// the site works however old the laptop is: old gpus and software rendering get the lite file
// (lite.spec.ts has the old gpu case), a driver dropping out mid visit hands over to it,
// and the visitor can still ask for the 3D. `?gpu=` fakes the gpu name
test.describe("/ on old laptops", () => {
  test.skip(({ isMobile }) => isMobile, "laptops only");
  test.setTimeout(180_000);

  test("graphics drawn in software get the lite file, and may still open the 3D", async ({ page }) => {
    await page.goto(`/?gpu=${encodeURIComponent("Google SwiftShader")}`);
    await expect(page.locator("html")).toHaveAttribute("data-lite", "software");
    await expect(page.locator("canvas")).toHaveCount(0);
    await expect(page.getByText(/draws graphics without a graphics chip/)).toBeVisible();
    await page.goto(`/?3d&gpu=${encodeURIComponent("Google SwiftShader")}`);
    await page.waitForFunction(() => document.documentElement.dataset.ready === "true", null, { timeout: 150_000 });
    await expect(page.locator("canvas")).toHaveCount(1);
  });

  test("a graphics driver that drops out hands over to the lite file", async ({ page }) => {
    await page.goto("/?tier=low");
    await page.waitForFunction(() => document.documentElement.dataset.ready === "true", null, { timeout: 150_000 });
    await page.evaluate(() => window.__caseFile?.scrollTo(0.2));
    await page.waitForTimeout(1000);
    await page.evaluate(() => document.querySelector("canvas")!.getContext("webgl2")!.getExtension("WEBGL_lose_context")!.loseContext());
    await expect(page.getByText(/graphics driver stopped the 3D case file/)).toBeVisible({ timeout: 10_000 });
    await expect(page.locator("html")).toHaveAttribute("data-mode", "lite");
    await expect(page.locator("canvas")).toHaveCount(0);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(/Ayaan Bagawan/);
    expect(await page.evaluate(() => scrollY)).toBe(0);
  });
});
