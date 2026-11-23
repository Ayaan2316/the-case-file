import { expect, test } from "@playwright/test";
import { caseFile } from "../content/case";

test.describe("/resume (recruiter mode)", () => {
  test("renders every section from content/case.ts without WebGL", async ({ page }, info) => {
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));
    page.on("console", (m) => m.type() === "error" && errors.push(m.text()));

    await page.goto("/resume/");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(caseFile.subject.name);
    // the whole resume: every section, projects and research (sealed files stay off it)
    for (const title of ["Education", "Experience", "Projects", "Research", "Achievements", "Skills", "Certifications & workshops", "Leadership & activities"]) {
      await expect(page.getByRole("heading", { level: 2, name: title, exact: true })).toBeVisible();
    }
    for (const exhibit of caseFile.exhibits) {
      const heading = page.getByRole("heading", { level: 3, name: exhibit.title, exact: true });
      await (exhibit.kind === "sealed" ? expect(heading).toHaveCount(0) : expect(heading).toBeVisible());
    }
    await expect(page.getByRole("link", { name: caseFile.subject.phone })).toHaveAttribute("href", /^tel:\+91/);
    await expect(page.getByRole("link", { name: caseFile.subject.email }).first()).toBeVisible();
    await expect(page.getByText("[TODO")).toHaveCount(0);
    expect(await page.locator("canvas").count()).toBe(0);
    expect(errors).toEqual([]);

    await page.evaluate(() => document.fonts.ready);
    await page.screenshot({
      path: `screenshots/phase-1/resume-${info.project.name}-full.png`,
      fullPage: true,
    });
    await page.screenshot({ path: `screenshots/phase-1/resume-${info.project.name}-fold.png` });
  });

  test("has no horizontal scroll", async ({ page }) => {
    await page.goto("/resume/");
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow).toBeLessThanOrEqual(0);
  });

  test("print stylesheet renders a clean case report", async ({ page }, info) => {
    test.skip(info.project.name !== "desktop");
    await page.goto("/resume/");
    await page.emulateMedia({ media: "print" });
    await page.evaluate(() => document.fonts.ready);
    await page.screenshot({ path: "screenshots/phase-1/resume-print.png", fullPage: true });
    await expect(page.getByRole("link", { name: /Open the case file/ })).toBeHidden();
  });

  // ctrl+p on the 3D page prints the same report, not a canvas and 13 screens of scroll
  test("the main page prints the case report", async ({ page }, info) => {
    test.skip(info.project.name !== "desktop");
    await page.goto("/?tier=low");
    await page.emulateMedia({ media: "print" });
    await page.evaluate(() => document.fonts.ready);
    await expect(page.getByRole("heading", { level: 1, name: "Ayaan Bagawan" })).toBeVisible();
    await expect(page.locator("canvas")).toBeHidden();
    const pdf = await page.pdf({ format: "A4" });
    // one page object per printed page
    const pages = (pdf.toString("latin1").match(/\/Type\s*\/Page[^s]/g) ?? []).length;
    expect(pages).toBeGreaterThan(0);
    expect(pages).toBeLessThanOrEqual(5);
  });
});
