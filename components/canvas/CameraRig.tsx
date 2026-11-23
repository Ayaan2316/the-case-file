"use client";

import { useFrame, useThree } from "@react-three/fiber";
import { useMemo } from "react";
import { MathUtils, type PerspectiveCamera, Vector3 } from "three";
import { boardWorld, polaroidSpot } from "@/lib/board";
import { caseFile } from "@/content/case";
import { CABINET_VIEW, camera as shot, impact, sampleCamera, updateCameraState } from "@/lib/cameraPath";
import { CAM, OFF } from "@/lib/debug";
import { useStore } from "@/lib/store";

/** scroll progress -> camera position, look target, fov and focus, plus a bit of handheld shake */
export default function CameraRig({ onFocus }: { onFocus?: (distance: number) => void }) {
  const camera = useThree((s) => s.camera) as PerspectiveCamera;
  const tmp = useMemo(() => ({ position: new Vector3(), target: new Vector3(), look: new Vector3() }), []);
  const smoothed = useMemo(() => ({ p: 0, open: 0, closeUp: { position: new Vector3(), target: new Vector3(), fov: 32, focus: 0.43 } }), []);

  useFrame((state, delta) => {
    const { progress, reducedMotion, reading } = useStore.getState();
    // lenis already smooths the scroll, a little extra damping makes the dolly feel more filmic
    smoothed.p = reducedMotion ? progress : MathUtils.damp(smoothed.p, progress, 6, delta);
    updateCameraState(smoothed.p);
    const k = sampleCamera(smoothed.p, tmp);
    if (CAM) {
      tmp.position.set(...CAM.position);
      tmp.target.set(...CAM.target);
      Object.assign(k, { fov: CAM.fov, focusDistance: CAM.focus, shake: 0 });
    }
    // SinCityRed comes from the keyframes' grade (evidence board, interrogation)
    if (OFF.has("grade")) k.grade = 0;
    const store = useStore.getState();
    if (Math.abs(store.sinCityRed - k.grade) > 0.002) store.set({ sinCityRed: k.grade });
    // open exhibit: dolly in to its polaroid (pulled off the board, flipped), left of centre so the
    // case file panel gets the right side. RÉSUMÉ drawer: turn to the cabinet
    const open = store.openExhibit;
    smoothed.open = MathUtils.damp(smoothed.open, open || store.drawerOpen ? 1 : 0, 3.5, delta);
    if (open) {
      const i = caseFile.exhibits.findIndex((e) => e.id === open);
      const { across, up } = polaroidSpot(open, Math.max(i, 0));
      smoothed.closeUp.target.copy(boardWorld(across + 0.075, up, 0.07));
      smoothed.closeUp.position.copy(boardWorld(across + 0.075, up, 0.5));
      smoothed.closeUp.fov = 32;
      smoothed.closeUp.focus = 0.43;
    } else if (store.drawerOpen) {
      smoothed.closeUp.target.copy(CABINET_VIEW.target);
      smoothed.closeUp.position.copy(CABINET_VIEW.position);
      smoothed.closeUp.fov = CABINET_VIEW.fov;
      smoothed.closeUp.focus = CABINET_VIEW.focus;
    }
    if (smoothed.open > 0.001) {
      const e = smoothed.open * smoothed.open * (3 - 2 * smoothed.open);
      tmp.position.lerp(smoothed.closeUp.position, e);
      tmp.target.lerp(smoothed.closeUp.target, e);
      k.fov = MathUtils.lerp(k.fov, smoothed.closeUp.fov, e);
      k.focusDistance = MathUtils.lerp(k.focusDistance, smoothed.closeUp.focus, e);
    }
    // on an upright phone close ups lose their sides (folder pages, transcript). widening the fov alone
    // would need a fisheye, so close shots also step back along their line of sight, up to ~40% on a
    // phone. wide shots and landscape don't
    if (camera.aspect < 1) {
      const close = 1 - MathUtils.smoothstep(tmp.position.distanceTo(tmp.target), 0.6, 1.6);
      const back = 1 + 0.8 * (1 - camera.aspect) * close;
      tmp.position.sub(tmp.target).multiplyScalar(back).add(tmp.target);
      k.focusDistance *= back;
    }
    camera.position.copy(tmp.position);
    tmp.look.copy(tmp.target);
    if (!reducedMotion) {
      // handheld shake - two slow sines per axis that don't line up, calmer while reading
      const t = state.clock.elapsedTime;
      const amp = 0.006 * k.shake * (reading ? 0.25 : 1);
      tmp.look.x += (Math.sin(t * 0.83) + Math.sin(t * 1.91) * 0.5) * amp;
      tmp.look.y += (Math.sin(t * 0.67 + 1.3) + Math.sin(t * 1.37) * 0.5) * amp;
      // stamp landing jolt: sharp drop that settles in a few tenths of a second
      const since = t - impact.at;
      if (since >= 0 && since < 0.6) {
        const j = impact.strength * Math.exp(-since * 9);
        camera.position.y -= j * 0.006 * Math.cos(since * 42);
        tmp.look.x += j * 0.004 * Math.sin(since * 57);
        tmp.look.y -= j * 0.008 * Math.cos(since * 42);
      }
    }
    camera.lookAt(tmp.look);
    // shots are framed for landscape and fov is vertical, so on a tall phone the sides get cut
    // (phone on the desk, half the transcript). widen as the screen gets narrower
    if (camera.aspect < 1) k.fov = Math.min(80, k.fov * (1 + 1.1 * (1 - camera.aspect)));
    if (Math.abs(camera.fov - k.fov) > 0.01) {
      camera.fov = k.fov;
      camera.updateProjectionMatrix();
    }
    shot.focus = k.focusDistance; // shine.ts ranks lights by what they give this point
    onFocus?.(k.focusDistance);
  });
  return null;
}
