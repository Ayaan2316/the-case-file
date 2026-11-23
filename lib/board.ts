import { Quaternion, Vector3 } from "three";
import manifestJson from "@/public/models/scene.json";

// evidence board frame, exported by blender/export.py from evidence_board() in furniture.py.
// board-local axes: x out of the cork, y up, z = -across (across = left to right from the room)

type Layout = {
  position: number[];
  quaternion: number[];
  size: number[];
  face: number;
  polaroids: Record<string, { local: number[]; tilt: number }>;
};

const layout = (manifestJson as { board?: Layout }).board;

export const BOARD = {
  position: new Vector3(...((layout?.position ?? [1.6, 1.6, -3.986]) as [number, number, number])),
  quaternion: new Quaternion(...((layout?.quaternion ?? [0, -0.7071, 0, 0.7071]) as [number, number, number, number])),
  size: (layout?.size ?? [1.6, 1.1]) as [number, number],
  face: layout?.face ?? 0.0228,
  polaroids: layout?.polaroids ?? {},
};

/** real polaroid proportions at 1.6x, photo window sits above centre */
export const POLAROID = { w: 0.1408, h: 0.1712, img: 0.1264, imgUp: 0.0147 };

/** point on the board in board space, `out` metres in front of the cork */
export const boardLocal = (across: number, up: number, out = 0) => new Vector3(BOARD.face + out, up, -across);

/** same point in world space */
export const boardWorld = (across: number, up: number, out = 0) =>
  boardLocal(across, up, out).applyQuaternion(BOARD.quaternion).add(BOARD.position);

/** where exhibit `id` hangs (across, up, tilt). falls back to a grid */
export function polaroidSpot(id: string, index: number) {
  const p = BOARD.polaroids[id];
  if (p) return { across: p.local[0], up: p.local[1], tilt: p.tilt };
  return { across: ((index % 4) - 1.5) * 0.32, up: index < 4 ? 0.2 : -0.2, tilt: 0 };
}
