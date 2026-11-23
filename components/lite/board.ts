import { caseFile } from "@/content/case";

/**
 * lite evidence board: where each polaroid hangs and the strings between them, worked out at build
 * time (no JS on the page). positions are % of the board width, x across and y down, for the phone
 * layout (three across, tall board) and laptop (four across). connections come from content/case.ts,
 * strings go pin to pin with a little sag
 */
type Spot = [x: number, y: number, turn: number];
type Layout = "phone" | "desk";

// strings only join neighbours (A-B, B-C, B-D, D-E, C-F, F-G). Coco (D) hangs under the desk pet (B)
// with Data Privacy (E) next to her so no string crosses a photo
const SPOTS: Record<string, Record<Layout, Spot>> = {
  A: { phone: [5, 8, -3], desk: [5, 7, 2.5] },
  B: { phone: [36, 4, 2], desk: [28, 5, -2] },
  C: { phone: [67, 9, -1.5], desk: [51, 8, 2] },
  D: { phone: [37, 53, -2.5], desk: [28, 35, 2] },
  E: { phone: [7, 50, 2], desk: [5, 33, -2] },
  F: { phone: [67, 48, 1.5], desk: [75, 6, -1.5] },
  G: { phone: [62, 93, -1], desk: [75, 34, 1.5] },
};

/** board height (same units), polaroid width, polaroid height, hint card position */
export const BOARD: Record<Layout, { height: number; width: number; tall: number; hint: Spot }> = {
  phone: { height: 136, width: 28, tall: 36, hint: [6, 100, -2] },
  desk: { height: 60, width: 17, tall: 19.5, hint: [52, 38, -1] },
};

/** css custom props for something placed on both layouts */
export const place = (phone: Spot | [number, number], desk: Spot | [number, number]) =>
  ({
    "--px": phone[0],
    "--py": phone[1],
    "--pr": phone[2] ?? 0,
    "--dx": desk[0],
    "--dy": desk[1],
    "--dr": desk[2] ?? 0,
  }) as React.CSSProperties;

const pinOf = (s: Spot, l: Layout): [number, number] => [s[0] + BOARD[l].width / 2, s[1] + (l === "phone" ? 0.9 : 0.6)];

export function boardLayout() {
  const pinned = caseFile.exhibits.filter((e) => SPOTS[e.id]);
  const strings: Record<Layout, string[]> = { phone: [], desk: [] };
  const ties = caseFile.connections
    .filter((c) => SPOTS[c.from] && SPOTS[c.to])
    .map((c) => {
      const at = {} as Record<Layout, [number, number]>;
      for (const l of ["phone", "desk"] as const) {
        const a = pinOf(SPOTS[c.from][l], l);
        const b = pinOf(SPOTS[c.to][l], l);
        const sag = Math.abs(b[0] - a[0]) * 0.07 + 0.4;
        const ctrl = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2 + sag];
        strings[l].push(`M${a[0]},${a[1]} Q${ctrl[0]},${ctrl[1]} ${b[0]},${b[1]}`);
        // label goes mid string, or for strings between rows in the gap between them
        // (over a photo it'd cover the caption)
        let t = 0.5;
        if (Math.abs(b[1] - a[1]) > BOARD[l].tall * 0.6) {
          const [top, bottom] = a[1] < b[1] ? [a, b] : [b, a];
          const gap = (top[1] + BOARD[l].tall + bottom[1]) / 2;
          const k = (gap - top[1]) / (bottom[1] - top[1]);
          t = a[1] < b[1] ? k : 1 - k;
        }
        const u = 1 - t;
        at[l] = [u * u * a[0] + 2 * u * t * ctrl[0] + t * t * b[0], u * u * a[1] + 2 * u * t * ctrl[1] + t * t * b[1]];
      }
      const turn = (c.label.length % 3) - 1;
      return { label: c.label, style: place([...at.phone, turn * 3], [...at.desk, turn * 3]) };
    });
  return {
    polaroids: pinned.map((e) => ({ exhibit: e, style: place(SPOTS[e.id].phone, SPOTS[e.id].desk) })),
    pins: pinned.map((e) => ({ id: e.id, style: place(pinOf(SPOTS[e.id].phone, "phone"), pinOf(SPOTS[e.id].desk, "desk")) })),
    strings,
    ties,
    hint: place(BOARD.phone.hint, BOARD.desk.hint),
  };
}
