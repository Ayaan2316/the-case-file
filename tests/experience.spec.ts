import { expect, test } from "@playwright/test";

// smoke test for the 3D: it loads, says it's ready, and the GPU never rejects a draw
// (a broken shadow map once made every lit mesh silently disappear)
test.describe("/ (the case file)", () => {
  test.skip(({ isMobile }) => isMobile, "desktop smoke only");
  test.setTimeout(180_000);

  test("loads the scene without page or WebGL errors", async ({ page }) => {
    const problems: string[] = [];
    page.on("pageerror", (e) => problems.push(e.message));
    page.on("console", (m) => {
      const t = m.text();
      if (m.type() === "error" || /GL_INVALID|WebGL: too many errors/.test(t)) problems.push(t);
    });

    await page.goto("/?tier=low");
    await page.waitForFunction(() => document.documentElement.dataset.ready === "true", null, { timeout: 150_000 });
    await expect(page.locator("canvas")).toHaveCount(1);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(/Who is Ayaan Bagawan\?/);
    await expect(page.getByRole("link", { name: "Skip to résumé" }).first()).toBeVisible();
    // office, then the dossier (folder open, page mid flip, page 2), then the evidence board
    for (const p of [0.2, 0.31, 0.335, 0.355, 0.4]) {
      await page.evaluate((v) => window.__caseFile?.scrollTo(v), p);
      await page.waitForTimeout(1200);
    }
    // exhibit C: caption button opens the file as a dialog, escape closes it
    await page.evaluate(() => window.__caseFile?.scrollTo(0.459));
    await page.waitForTimeout(1500);
    await page.getByRole("button", { name: "Open the file" }).click();
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();
    await expect(dialog.getByRole("heading", { level: 2 })).toHaveText("The Case File");
    await expect(page.getByRole("button", { name: "Close the exhibit file" })).toBeFocused();
    await page.keyboard.press("Escape");
    await expect(dialog).toHaveCount(0);
    // exhibit F is sealed - shows the promise but no empty evidence or tool lists
    await page.evaluate(() => window.__caseFile?.scrollTo(0.525));
    await page.waitForTimeout(1500);
    await page.getByRole("button", { name: "Open the file" }).click();
    await expect(dialog.getByRole("heading", { level: 2 })).toHaveText("Sealed");
    await expect(dialog.getByText(/opens when it ships/)).toBeVisible();
    await expect(dialog.getByRole("heading", { level: 3 })).toHaveCount(0);
    await page.keyboard.press("Escape");
    await expect(dialog).toHaveCount(0);
    // cut to the evidence room: loads lazily, captures its probe, log shows up
    for (const p of [0.575, 0.6, 0.63]) {
      await page.evaluate((v) => window.__caseFile?.scrollTo(v), p);
      await page.waitForTimeout(1500);
    }
    await page.waitForFunction(() => window.__caseFile?.store.getState().evidenceProbe === true, null, { timeout: 60_000 });
    await expect(page.getByText(/^EVIDENCE ROOM/)).toBeVisible();
    // cut to the interrogation: transcript types, stamp lands, verdict shows
    await page.waitForFunction(() => window.__caseFile?.store.getState().interroProbe === true, null, { timeout: 60_000 });
    for (const p of [0.7, 0.75]) {
      await page.evaluate((v) => window.__caseFile?.scrollTo(v), p);
      await page.waitForTimeout(1500);
    }
    // captions fade with opacity (playwright counts opacity 0 as visible) so read it directly
    const shown = (text: RegExp) =>
      page.locator("section p", { hasText: text }).first().evaluate((el) => Number(getComputedStyle(el.parentElement!).opacity));
    await expect.poll(() => shown(/^A: /)).toBeGreaterThan(0.9);
    for (const p of [0.8, 0.86]) {
      await page.evaluate((v) => window.__caseFile?.scrollTo(v), p);
      await page.waitForTimeout(1500);
    }
    await expect.poll(() => shown(/^GUILTY$/)).toBeGreaterThan(0.9);
    // stamp ink is on the case file
    const inked = () =>
      page.evaluate(() => {
        const m = window.__caseFile?.scene.getObjectByName("interro_casefile_stamp") as unknown as { material: { opacity: number } } | undefined;
        return m?.material.opacity ?? 0;
      });
    await expect.poll(inked).toBe(1);
    expect(problems).toEqual([]);
  });

  // a tier change re-renders the canvas mid scroll and the scene setup can't run again
  // (it once baked the open door's angle into the leaf so only the glass swung)
  test("the office door survives a tier change while open", async ({ page }) => {
    await page.goto("/?tier=low");
    await page.waitForFunction(() => document.documentElement.dataset.ready === "true", null, { timeout: 150_000 });
    const door = () =>
      page.evaluate(() => {
        const d = window.__caseFile!.scene.getObjectByName("dyn_office_door")!;
        return { geometry: (d as import("three").Mesh).geometry.uuid, rotation: d.rotation.y };
      });
    await page.evaluate(() => window.__caseFile?.scrollTo(0.105));
    await page.waitForTimeout(2000);
    const before = await door();
    expect(before.rotation).toBeGreaterThan(1);
    await page.evaluate(() => window.__caseFile!.store.getState().set({ tier: "medium" }));
    await page.waitForTimeout(1500);
    await page.evaluate(() => window.__caseFile?.scrollTo(0.02));
    await page.waitForTimeout(2000);
    expect((await door()).rotation).toBeCloseTo(0, 3);
    await page.evaluate(() => window.__caseFile?.scrollTo(0.105));
    await page.waitForTimeout(2000);
    const after = await door();
    expect(after.geometry).toBe(before.geometry);
    expect(after.rotation).toBeCloseTo(before.rotation, 2);
  });

  // contact: ringing phone opens the notepad, the form checks its fields, files the tip, admits when
  // it fails, and the resume link on the notepad opens the drawer and downloads
  test("the phone opens the tip form and the drawer hands over the résumé", async ({ page }) => {
    // turnstile and the pages function aren't in the static build, so fake both
    await page.route("https://challenges.cloudflare.com/turnstile/**", (route) =>
      route.fulfill({
        contentType: "application/javascript",
        body: "window.turnstile={render:(el,o)=>{setTimeout(()=>o.callback('test-token'),0);return 'w1'},reset(){},remove(){}};",
      }),
    );
    const sent: unknown[] = [];
    let answer = { status: 200, body: { ok: true } as object };
    await page.route("**/api/tip", async (route) => {
      sent.push(route.request().postDataJSON());
      await route.fulfill({ status: answer.status, contentType: "application/json", body: JSON.stringify(answer.body) });
    });
    await page.goto("/?tier=low");
    await page.waitForFunction(() => document.documentElement.dataset.ready === "true", null, { timeout: 150_000 });
    await page.evaluate(() => window.__caseFile?.scrollTo(0.92));
    await page.waitForTimeout(2500);

    await page.getByRole("button", { name: "Pick up the phone" }).click();
    const pad = page.getByRole("dialog", { name: "Leave a tip" });
    await expect(pad).toBeVisible();
    await expect(pad.getByLabel("Name")).toBeFocused();
    // empty form - fields say what's missing, nothing gets sent
    await pad.getByRole("button", { name: "File the tip" }).click();
    await expect(pad.getByText("Your name, detective.")).toBeVisible();
    expect(sent).toHaveLength(0);

    await pad.getByLabel("Name").fill("Playwright Detective");
    await pad.getByLabel("Email").fill("detective@example.com");
    await pad.getByLabel("The tip").fill("Testing the tip line from the e2e suite.");
    await pad.getByRole("button", { name: "File the tip" }).click();
    await expect(pad.getByText("TIP FILED")).toBeVisible();
    expect(sent[0]).toMatchObject({ name: "Playwright Detective", email: "detective@example.com", token: "test-token" });

    // hang up, pick up again: a failed send gets reported with the email as a fallback
    await page.keyboard.press("Escape");
    await expect(pad).toHaveCount(0);
    answer = { status: 500, body: { ok: false, error: "D1 is down." } };
    await page.getByRole("button", { name: "Leave a tip" }).click();
    await pad.getByLabel("Name").fill("Playwright Detective");
    await pad.getByLabel("Email").fill("detective@example.com");
    await pad.getByLabel("The tip").fill("Testing the failure path of the tip line.");
    await pad.getByRole("button", { name: "File the tip" }).click();
    await expect(pad.getByText(/The line went dead/)).toBeVisible();
    await expect(pad.getByText(/D1 is down\./)).toBeVisible();

    // resume: drawer opens and the pdf downloads
    const download = page.waitForEvent("download");
    await pad.getByRole("button", { name: "Get the résumé" }).click();
    expect((await download).suggestedFilename()).toBe("Ayaan-Bagawan-resume.pdf");
    await expect(page.getByRole("button", { name: "Back to the desk" })).toBeFocused();
    await page.keyboard.press("Escape");
    await expect(page.getByRole("button", { name: "Back to the desk" })).toHaveCount(0);
  });

  // end of the scroll: camera turns from the ringing phone to the cabinet and the RÉSUMÉ drawer slides
  // out with the scroll. nothing downloads until the visitor asks
  test("the scroll ends on the open résumé drawer", async ({ page }) => {
    await page.goto("/?tier=low");
    await page.waitForFunction(() => document.documentElement.dataset.ready === "true", null, { timeout: 150_000 });
    const drawer = () =>
      page.evaluate(() => {
        const s = window.__caseFile!.scene;
        return { x: s.getObjectByName("dyn_cabinet_drawer_resume")!.position.x, shown: s.getObjectByName("fx_resume_drawer_box")!.visible };
      });
    await page.evaluate(() => window.__caseFile?.scrollTo(0.92));
    await page.waitForTimeout(2000);
    const shut = await drawer();
    expect(shut.shown).toBe(false);
    let downloads = 0;
    page.on("download", () => downloads++);
    await page.evaluate(() => window.__caseFile?.scrollTo(1));
    await page.waitForTimeout(2500);
    const out = await drawer();
    expect(out.shown).toBe(true);
    expect(out.x - shut.x).toBeCloseTo(0.34, 2);
    const caption = page.locator("section", { has: page.getByRole("heading", { name: "Résumé" }) });
    await expect(caption.getByRole("link", { name: "Download the PDF" })).toHaveAttribute("href", "/resume.pdf");
    expect(downloads).toBe(0);
    // resume window: the case report with the pdf one click away, escape puts it back
    await caption.getByRole("button", { name: "Open the résumé" }).click();
    const sheet = page.getByRole("dialog", { name: "Ayaan Bagawan" });
    await expect(sheet).toBeVisible();
    await expect(page.getByRole("button", { name: "Close the résumé" })).toBeFocused();
    await expect(sheet.getByRole("link", { name: "Download the PDF" })).toHaveAttribute("href", "/resume.pdf");
    await expect(sheet.getByRole("heading", { level: 2, name: "Education" })).toBeVisible();
    // wheel scrolls the resume, story stays at the drawer
    await page.mouse.move(640, 500);
    await page.mouse.wheel(0, 900);
    await page.waitForTimeout(600);
    expect(await page.evaluate(() => window.__caseFile!.store.getState().progress)).toBeCloseTo(1, 3);
    expect(await sheet.evaluate((el) => el.parentElement!.scrollTop)).toBeGreaterThan(100);
    await page.keyboard.press("Escape");
    await expect(sheet).toHaveCount(0);
    await expect(caption.getByRole("button", { name: "Open the résumé" })).toBeFocused();
    expect(downloads).toBe(0);
  });

  // sound: off until asked, the opening offers it, and someone who had it on gets it back on their
  // first click (browsers only start audio from one)
  test("sound: the opening offers it and the choice is remembered", async ({ page }) => {
    const ready = () => page.waitForFunction(() => document.documentElement.dataset.ready === "true", null, { timeout: 150_000 });
    const soundOn = () => page.evaluate(() => window.__caseFile!.store.getState().soundOn);
    const playing = () =>
      page.evaluate(
        () => (window as unknown as { Howler?: { _howls: { playing(): boolean }[] } }).Howler?._howls.filter((h) => h.playing()).length ?? 0,
      );
    await page.goto("/?tier=low");
    await ready();
    expect(await soundOn()).toBe(false);
    await page.getByRole("button", { name: "Turn the sound on" }).click();
    await expect.poll(playing).toBeGreaterThan(0);
    await expect(page.getByRole("button", { name: "Turn the sound on" })).toHaveCount(0);
    await page.reload();
    await ready();
    expect(await soundOn()).toBe(true);
    expect(await playing()).toBe(0);
    await page.mouse.click(640, 360);
    await expect.poll(playing).toBeGreaterThan(0);
  });
});

// reduced motion: no smooth scroll, each wheel tick goes to the next beat
test.describe("/ with reduced motion", () => {
  test.skip(({ isMobile }) => isMobile, "desktop only");
  test.use({ reducedMotion: "reduce" });
  test("the scroll steps from beat to beat", async ({ page }) => {
    await page.goto("/?tier=low");
    await page.waitForFunction(() => document.documentElement.dataset.ready === "true", null, { timeout: 150_000 });
    expect(await page.evaluate(() => document.documentElement.classList.contains("lenis"))).toBe(false);
    await page.mouse.move(640, 360);
    const progress = () => page.evaluate(() => window.__caseFile!.store.getState().progress);
    await page.mouse.wheel(0, 120);
    await expect.poll(progress).toBeCloseTo(0.13, 2);
    await page.waitForTimeout(500);
    await page.mouse.wheel(0, 120);
    await expect.poll(progress).toBeCloseTo(0.245, 2);
  });
});
