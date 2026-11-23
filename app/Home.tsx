"use client";

import dynamic from "next/dynamic";
import { useEffect, useRef, useState } from "react";
import Loader from "@/components/dom/Loader";
import SlowNotice from "@/components/dom/SlowNotice";
import EasterEggs from "@/components/dom/EasterEggs";
import ExhibitPanel from "@/components/dom/ExhibitPanel";
import Overlay from "@/components/dom/Overlay";
import ResumeWindow from "@/components/dom/ResumeWindow";
import { restoreSound, silence } from "@/lib/audio";
import { REDUCED_MOTION_STOPS } from "@/lib/cameraPath";
import { type LiteReason, toLite } from "@/lib/mode";
import {
  force3d,
  guessTier,
  isBudgetPhone,
  isPhone,
  phoneStartScale,
  prefersReducedMotion,
  rendererName,
  webglSupport,
} from "@/lib/quality";
import { refreshScroll, useMasterScroll } from "@/lib/scroll";
import { useStore } from "@/lib/store";
import styles from "./home.module.css";

const Experience = dynamic(() => import("@/components/canvas/Experience"), { ssr: false });
// tip form (zod + turnstile) only loads once the phone gets picked up
const Notepad = dynamic(() => import("@/components/dom/Notepad"), { ssr: false });

/** why we fell back to the lite file */
const LITE_REASON: Record<NonNullable<ReturnType<typeof useStore.getState>["flat"]>, LiteReason> = {
  unsupported: "none",
  software: "software",
  slow: "slow",
  lost: "lost",
};

export default function Home({ resume }: { resume: React.ReactNode }) {
  const scroller = useRef<HTMLDivElement>(null);
  // can't check the GPU until mount, there's no window in the static export.
  // 3D waits for that. if it bails (store `flat`), ThreeGate swaps in the lite file
  const [checked, setChecked] = useState(false);
  const flat = useStore((s) => s.flat);
  const three = checked && !flat;
  const notepadOpen = useStore((s) => s.notepadOpen);
  const reduced = useStore((s) => s.reducedMotion);
  const short = useStore((s) => s.short);
  // runway height changed, re-measure for ScrollTrigger
  useEffect(() => {
    if (short) requestAnimationFrame(refreshScroll);
  }, [short]);
  useEffect(() => {
    document.documentElement.classList.toggle("snap", reduced);
    return () => document.documentElement.classList.remove("snap");
  }, [reduced]);
  useMasterScroll(scroller);

  useEffect(() => {
    // ?tier=ultra|medium|low forces a tier, handy for screenshots and fps tests
    const forced = new URLSearchParams(location.search).get("tier");
    const tier = forced === "ultra" || forced === "medium" || forced === "low" ? forced : guessTier();
    const gpu = rendererName();
    // low tier = half size textures. phones (and ?tier=low) also get a shorter scroll.
    // old intel laptops on low keep the full length so the mouse wheel still feels right
    useStore.getState().set({
      tier,
      tierLocked: !!forced,
      reducedMotion: prefersReducedMotion(),
      assets: tier === "low" ? ".low" : "",
      short: isPhone() || forced === "low",
      phone: isPhone(),
      hsr: /Apple GPU|PowerVR/i.test(gpu),
      // budget phones: lock to 30fps, no bloom, FXAA. set before the scene builds so nothing recompiles
      budget: !forced && isBudgetPhone(gpu),
      fps30: !forced && isBudgetPhone(gpu),
      // laptops we guess as low start at 75% scale instead of stepping down during the corridor,
      // same for phones based on their GPU. goes back up if the fps holds
      renderScale: forced ? 1 : isPhone() ? phoneStartScale(gpu) : tier === "low" ? 0.75 : 1,
    });
    restoreSound();
    // no webgl2 -> lite file. software rendering -> lite file too, unless they forced 3D
    // or pinned a tier (CI has no GPU). lib/mode.ts usually catches both before we get here
    const support = webglSupport();
    if (support === "none") useStore.getState().set({ flat: "unsupported" });
    else if (support === "software" && !force3d() && !forced) useStore.getState().set({ flat: "software" });
    // run the check once after mount (no window during static export)
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setChecked(true);
  }, []);
  // 3D died mid visit (too slow / lost the driver). mute, scroll to top, show the lite file
  useEffect(() => {
    if (!flat) return;
    silence();
    scrollTo(0, 0);
    toLite(LITE_REASON[flat]);
  }, [flat]);

  return (
    <>
      <div className={styles.stage} aria-hidden="true">
        {three && <Experience />}
      </div>
      {three && <Loader />}
      <Overlay />
      {three && <ExhibitPanel />}
      {three && <SlowNotice />}
      {notepadOpen && <Notepad />}
      <ResumeWindow>{resume}</ResumeWindow>
      <EasterEggs />
      <div ref={scroller} className={styles.scroller} data-short={short || undefined}>
        {/* reduced motion: snap to each beat (html.snap in globals.css) */}
        {reduced &&
          REDUCED_MOTION_STOPS.map((p) => (
            <span key={p} className={styles.stop} style={{ "--p": p } as React.CSSProperties} aria-hidden="true" />
          ))}
      </div>
    </>
  );
}
