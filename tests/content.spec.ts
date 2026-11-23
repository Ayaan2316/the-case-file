import { existsSync } from "node:fs";
import { join } from "node:path";
import { expect, test } from "@playwright/test";
import { caseFile } from "../content/case";

// catches mistakes when editing content/case.ts by hand, no browser needed
test.describe("content/case.ts", () => {
  test.skip(({ isMobile }) => isMobile, "runs once, on the desktop project");

  const ids = caseFile.exhibits.map((e) => e.id);

  test("has 4–12 exhibits with unique ids and slugs", () => {
    expect(ids.length).toBeGreaterThanOrEqual(4);
    expect(ids.length).toBeLessThanOrEqual(12);
    expect(new Set(ids).size).toBe(ids.length);
    expect(new Set(caseFile.exhibits.map((e) => e.slug)).size).toBe(ids.length);
  });

  test("connections only point at existing exhibits", () => {
    for (const c of caseFile.connections) {
      expect(ids, `${c.from} → ${c.to} (${c.label})`).toContain(c.from);
      expect(ids, `${c.from} → ${c.to} (${c.label})`).toContain(c.to);
    }
  });

  test("photos that are referenced and present live in public/", () => {
    const paths = [
      caseFile.subject.photo,
      ...caseFile.exhibits.flatMap((e) => [e.photo, ...(("gallery" in e && e.gallery) || [])]),
    ];
    for (const p of paths) expect(p.startsWith("/photos/"), p).toBe(true);
    expect(existsSync(join("public", caseFile.subject.photo))).toBe(true);
  });
});
