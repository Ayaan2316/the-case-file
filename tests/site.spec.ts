import { expect, test } from "@playwright/test";

// stuff around the experience: 404 page, search and share metadata
test.describe("site", () => {
  test("an unknown address gets the case-not-found page", async ({ page }) => {
    const r = await page.goto("/no-such-file/");
    expect(r?.status()).toBe(404);
    await expect(page.getByRole("heading", { level: 1, name: "Case not found" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Open the case file" })).toHaveAttribute("href", "/");
    await expect(page.getByRole("link", { name: "Read the case report" })).toHaveAttribute("href", "/resume/");
  });

  test("search engines and link previews find what they need", async ({ page, request }) => {
    await page.goto("/resume/");
    const meta = (property: string) => page.locator(`meta[property="${property}"]`).getAttribute("content");
    expect(await meta("og:image")).toMatch(/^https?:\/\/.+\/og\.png$/);
    expect(await meta("og:title")).toContain("Ayaan Bagawan");
    await expect(page.locator('link[rel="canonical"]')).toHaveAttribute("href", /\/resume\/$/);
    await expect(page.locator('link[rel="icon"][type="image/svg+xml"]')).toHaveCount(1);
    const ld = JSON.parse((await page.locator('script[type="application/ld+json"]').first().textContent()) ?? "{}");
    expect(ld["@type"]).toBe("Person");

    for (const path of ["/robots.txt", "/sitemap.xml", "/og.png", "/favicon.ico"]) {
      expect((await request.get(path)).status(), path).toBe(200);
    }
    expect(await (await request.get("/sitemap.xml")).text()).toContain("/resume/");
  });
});
