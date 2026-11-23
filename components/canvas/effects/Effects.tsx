"use client";

import { OFF } from "@/lib/debug";
import { settingsFor } from "@/lib/quality";
import { useStore } from "@/lib/store";
import Flashlight from "./Flashlight";
import { DustMotes, LightShafts } from "./LightShafts";
import RainGlass from "./RainGlass";
import { BusHeadlights, Lightning, NeonSign } from "./Weather";

/** live atmosphere on top of the baked scene, scaled per tier */
export default function Effects() {
  // select tier and trim separately, a selector returning a new object re-renders forever
  const tier = useStore((s) => s.tier);
  const trim = useStore((s) => s.trim);
  const t = settingsFor(tier, trim);
  return (
    <>
      {!OFF.has("flashlight") && (
        <Flashlight shadows={t.flashlightShadows && !OFF.has("shadows")} halfRate={t.torchShadowHalfRate ?? false} />
      )}
      {!OFF.has("rain") && <RainGlass refraction={t.rainRefraction} scale={t.rainScale} />}
      {t.shafts && !OFF.has("shafts") && <LightShafts />}
      {t.dust > 0 && !OFF.has("dust") && <DustMotes count={t.dust} />}
      <NeonSign />
      <Lightning />
      <BusHeadlights shadows={t.shadows} />
    </>
  );
}
