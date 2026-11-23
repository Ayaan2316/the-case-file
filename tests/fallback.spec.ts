import { expect, test } from "@playwright/test";

// no webgl: lite file, one headline, no 3D link (it can't open here), tip line and resume reachable.
// launch options are per worker so this file sets them at the top level
test.use({ launchOptions: { args: ["--disable-webgl", "--disable-webgl2", "--disable-3d-apis"] } });

test.describe("/ without WebGL", () => {
  test("shows the lite file, the tip form and the résumé", async ({ page }, info) => {
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.route("https://challenges.cloudflare.com/turnstile/**", (route) =>
      route.fulfill({ contentType: "application/javascript", body: "window.turnstile={render:()=>'w1',reset(){},remove(){}};" }),
    );
    await page.goto("/");
    await expect(page.locator("html")).toHaveAttribute("data-mode", "lite");
    // phones skip the gpu probe, they're on the lite file anyway
    await expect(page.locator("html")).toHaveAttribute("data-lite", info.project.name === "mobile" ? "phone" : "none");
    await expect(page.locator("canvas")).toHaveCount(0);
    await expect(page.getByRole("heading", { level: 1 })).toHaveCount(1);
    if (info.project.name === "desktop") await expect(page.getByRole("link", { name: "Open the 3D case file" })).toHaveCount(0);

    // tip form loads its checks when used, a tip without the robot check gets held back
    const form = page.getByRole("form", { name: "Leave a tip" });
    await form.scrollIntoViewIfNeeded();
    await form.getByLabel("Name").fill("A detective");
    await form.getByLabel("Email").fill("detective@example.com");
    await form.getByLabel("The tip").fill("A tip long enough to file.");
    await form.getByRole("button", { name: "File the tip" }).click();
    await expect(form.getByText("Finish the robot check first.")).toBeVisible();

    const download = page.waitForEvent("download");
    await page.getByRole("link", { name: /Get the résumé/ }).first().click();
    expect((await download).suggestedFilename()).toBe("Ayaan-Bagawan-resume.pdf");
    expect(errors).toEqual([]);
  });
});
