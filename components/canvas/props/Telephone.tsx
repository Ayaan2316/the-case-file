"use client";

import { useFrame } from "@react-three/fiber";
import { useEffect, useMemo } from "react";
import { MathUtils, type Object3D, Quaternion, Vector3 } from "three";
import { setLevel, setLoop } from "@/lib/audio";
import { BEATS, CUTS, camera as shot, within } from "@/lib/cameraPath";
import { answerPhone } from "@/lib/contact";
import { useStore } from "@/lib/store";
import { registerClick } from "../scenes/interactions";

/** ring cadence - phone-ring.ogg is one 6s cycle, 2.1s of it ringing */
const CYCLE = 6;
const BELL = 2.1;
// off the cradle: up and past your right shoulder, out of frame like it's held to your ear.
// left in view it just looked like a handset floating over the desk
const LIFT = new Vector3(0.42, 0.42, 0.62);
const TIP = new Quaternion().setFromAxisAngle(new Vector3(1, 0, 0), -0.85);

/**
 * rotary phone: rings when you're back at the desk, handset rattling on the cradle with the bell,
 * until you click it (or "Pick up the phone"). then it lifts and the notepad opens, goes back down
 * when the notepad closes
 */
export default function Telephone({ roots }: { roots: Object3D[] }) {
  const parts = useMemo(() => {
    let handset: Object3D | undefined;
    for (const r of roots) handset ??= r.getObjectByName("dyn_telephone_handset");
    return handset && { handset, position: handset.position.clone(), quaternion: handset.quaternion.clone() };
  }, [roots]);
  const rig = useMemo(() => ({ ringStart: -1, lift: 0, q: new Quaternion() }), []);

  useEffect(() => registerClick(/^dyn_telephone/, answerPhone), []);

  useFrame((state, delta) => {
    const { phoneAnswered, notepadOpen, reducedMotion } = useStore.getState();
    const t = state.clock.elapsedTime;
    const ringing = shot.p >= CUTS.contact && !phoneAnswered;
    if (!ringing) rig.ringStart = -1;
    else if (rig.ringStart < 0) rig.ringStart = t;
    // bell and rattle share a clock, restart it whenever the sound starts
    if (setLoop("phone", ringing)) rig.ringStart = t;
    // at the filing cabinet the bell is across the room
    setLevel("phone", 1 - 0.45 * within(shot.p, [BEATS.phone[1], BEATS.cabinet[1]]));
    if (!parts) return;
    const bell = ringing && (t - rig.ringStart) % CYCLE < BELL;
    rig.lift = MathUtils.damp(rig.lift, notepadOpen ? 1 : 0, 5, delta);
    const e = rig.lift * rig.lift * (3 - 2 * rig.lift);
    const { handset } = parts;
    handset.position.copy(parts.position).addScaledVector(LIFT, e);
    handset.quaternion.copy(parts.quaternion).slerp(rig.q.copy(parts.quaternion).premultiply(TIP), e);
    if (bell && !reducedMotion) {
      // the clapper shakes the whole handset, a few mm of jitter at bell speed
      const s = t * 31;
      handset.position.y += Math.abs(Math.sin(s)) * 0.0016;
      handset.rotateX(Math.sin(s * 1.7) * 0.012);
      handset.rotateZ(Math.sin(s * 1.3 + 1) * 0.01);
    }
  });
  return null;
}
