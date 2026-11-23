import { expect, type Page, test } from "@playwright/test";

// lite file: phones and older computers read the case on paper. never fetches the 3D, never scrolls
// sideways, and every path works - board photos, resume, tip line and the 3D for anyone who asks.
// `?gpu=` fakes the gpu name
const OLD_INTEL = "ANGLE (Intel, Intel(R) HD Graphics 4000 Direct3D11 vs_5_0 ps_5_0, D3D11)";

/** scroll every photo into view (they're lazy) and check it loaded. closed exhibit files only load their photos when opened */
async function readThrough(page: Page) {
  for (const img of await page.locator(".lite-only main img:visible").all()) {
    await img.scrollIntoViewIfNeeded();
    await expect.poll(() => img.evaluate((i: HTMLImageElement) => (i.complete ? i.naturalWidth : 0))).toBeGreaterThan(0);
  }
  await page.evaluate(() => scrollTo(0, 0));
  await page.waitForLoadState("networkidle");
}

test.describe("/ as the lite file", () => {
  test("a phone gets the lite file and never downloads the 3D", async ({ page }, info) => {
    test.skip(info.project.name !== "mobile", "phones only");
    const requests: string[] = [];
    const errors: string[] = [];
    page.on("request", (r) => requests.push(r.url()));
    page.on("pageerror", (e) => errors.push(e.message));
    await page.goto("/");
    await expect(page.locator("html")).toHaveAttribute("data-mode", "lite");
    await expect(page.locator("html")).toHaveAttribute("data-lite", "phone");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(/Ayaan Bagawan/);
    await readThrough(page);
    expect(requests.filter((u) => /\/models\/|\.glb|\.ktx2|\/audio\/|\/basis\//.test(u))).toEqual([]);
    await expect(page.locator("canvas")).toHaveCount(0);
    // the 3D app (store + test hooks) never loaded
    expect(await page.evaluate(() => "__caseFile" in window)).toBe(false);
    for (const width of [412, 360, 320]) {
      await page.setViewportSize({ width, height: 800 });
      expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth), `${width} px wide`).toBe(0);
    }
    expect(errors).toEqual([]);
  });

  test("a photo on the board opens its file over the page", async ({ page }, info) => {
    test.skip(info.project.name !== "mobile", "phones only");
    await page.goto("/");
    await page.locator("#evidence-board").scrollIntoViewIfNeeded();
    const before = await page.evaluate(() => scrollY);
    await page.locator('#evidence-board a[href="#exhibit-a"]:visible').first().tap();
    const file = page.getByRole("dialog", { name: "Bumblebee: Robo Soccer Bot" });
    await expect(file).toBeVisible();
    await expect(file.getByRole("heading", { name: "Bumblebee: Robo Soccer Bot" })).toBeFocused();
    // page behind stays where it was
    expect(await page.evaluate(() => scrollY)).toBe(before);
    // next exhibit then back to the board: one step back in history, page where it was
    await file.getByRole("link", { name: /^Next: exhibit B/ }).tap();
    const next = page.getByRole("dialog", { name: "AI Desk Pet" });
    await expect(next).toBeVisible();
    await next.getByRole("link", { name: "Back to the board" }).tap();
    await expect(page.getByRole("dialog")).toHaveCount(0);
    expect(new URL(page.url()).hash).toBe("");
    expect(await page.evaluate(() => scrollY)).toBe(before);
  });

  test("Escape closes a file and the arrows step through them", async ({ page }, info) => {
    test.skip(info.project.name !== "desktop", "laptops only");
    await page.goto(`/?gpu=${encodeURIComponent(OLD_INTEL)}`);
    const photo = page.locator('#evidence-board a[href="#exhibit-b"]:visible').first();
    await photo.click();
    await expect(page.getByRole("dialog", { name: "AI Desk Pet" })).toBeVisible();
    await page.keyboard.press("ArrowRight");
    await expect(page.getByRole("dialog", { name: "The Case File" })).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await expect(photo).toBeFocused();
    // direct link to a file opens it, closing lands on the board
    await page.goto(`/?gpu=${encodeURIComponent(OLD_INTEL)}#exhibit-g`);
    const sealed = page.getByRole("dialog", { name: "Case still open" });
    await expect(sealed).toBeVisible();
    await sealed.getByRole("link", { name: "Back to the board" }).click();
    await expect(page).toHaveURL(/#evidence-board$/);
    await expect(page.getByRole("dialog")).toHaveCount(0);
  });

  test("every résumé link downloads the PDF", async ({ page }) => {
    await page.goto(`/?gpu=${encodeURIComponent(OLD_INTEL)}`);
    const links = page.locator('.lite-only a[href="/resume.pdf"][download]');
    // opening, index card, profile, after the verdict, tip line
    await expect(links).toHaveCount(5);
    const download = page.waitForEvent("download");
    await links.first().click();
    expect((await download).suggestedFilename()).toBe("Ayaan-Bagawan-resume.pdf");
  });

  test("an older laptop gets the lite file, and the 3D when it asks", async ({ page }, info) => {
    test.skip(info.project.name !== "desktop", "laptops only");
    test.setTimeout(180_000);
    await page.goto(`/?gpu=${encodeURIComponent(OLD_INTEL)}`);
    await expect(page.locator("html")).toHaveAttribute("data-lite", "old");
    await expect(page.getByText("The lite file, made for older computers.")).toBeVisible();
    await expect(page.locator("canvas")).toHaveCount(0);
    await expect(page.getByRole("link", { name: "Open the 3D case file" }).first()).toHaveAttribute("href", "/?3d");
    // asking for the 3D (the link drops ?gpu so pass the fake chip again): starts on low at 75% with the
    // full scroll for the wheel, `?3d` gets removed from the address bar
    await page.goto(`/?3d&gpu=${encodeURIComponent(OLD_INTEL)}`);
    await page.waitForFunction(() => document.documentElement.dataset.ready === "true", null, { timeout: 150_000 });
    expect(new URL(page.url()).searchParams.has("3d")).toBe(false);
    const s = await page.evaluate(() => {
      const { tier, renderScale, short, assets, tierLocked } = window.__caseFile!.store.getState();
      return { tier, renderScale, short, assets, tierLocked };
    });
    expect(s).toMatchObject({ tier: "low", short: false, assets: ".low", tierLocked: false });
    expect(s.renderScale).toBeLessThan(1);
    // choice sticks for the visit
    await page.goto(`/?gpu=${encodeURIComponent(OLD_INTEL)}`);
    await expect(page.locator("html")).toHaveAttribute("data-mode", "3d");
  });

  test("a laptop that runs the 3D never shows the lite file", async ({ page }, info) => {
    test.skip(info.project.name !== "desktop", "laptops only");
    await page.goto(`/?gpu=${encodeURIComponent("ANGLE (NVIDIA, NVIDIA GeForce RTX 5070 Laptop GPU Direct3D11 vs_5_0 ps_5_0, D3D11)")}`);
    // on a machine that renders in software (CI with no GPU) it's the software note instead
    const mode = await page.locator("html").getAttribute("data-mode");
    test.skip(mode !== "3d", "this browser has no fast WebGL2");
    await expect(page.locator("#tip-line")).toBeHidden();
    await expect(page.locator("canvas")).toHaveCount(1);
  });
});
