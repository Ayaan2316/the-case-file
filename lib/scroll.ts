"use client";

import { useGSAP } from "@gsap/react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import Lenis from "lenis";
import { type RefObject, useEffect } from "react";
import { REDUCED_MOTION_STOPS } from "./cameraPath";
import { prefersReducedMotion } from "./quality";
import { useStore } from "./store";

gsap.registerPlugin(ScrollTrigger, useGSAP);
// phone address bar hiding resizes the viewport, not worth re-measuring every trigger for that
ScrollTrigger.config({ ignoreMobileResize: true });

/**
 * lenis smooth scroll feeding one ScrollTrigger over the whole scroll container.
 * its 0-1 progress is the master timeline every scene reads from the store
 */
export function useMasterScroll(container: RefObject<HTMLElement | null>) {
  useEffect(() => {
    // read the media query directly - this runs before Home puts the flag in the store
    // (lenis smoothing stayed on under reduced motion and fought the snapping)
    const reduced = prefersReducedMotion();
    const lenis = reduced ? null : new Lenis({ lerp: 0.075, smoothWheel: true, wheelMultiplier: 0.8 });
    const raf = (time: number) => lenis?.raf(time * 1000);
    if (lenis) {
      lenis.on("scroll", ScrollTrigger.update);
      gsap.ticker.add(raf);
      gsap.ticker.lagSmoothing(0);
    }
    // reduced motion: css snaps keyboard/touch scroll between stops, but one wheel tick is smaller
    // than the gap and snaps straight back. so each tick moves one stop
    let last = 0;
    const onWheel = (e: WheelEvent) => {
      if ((e.target as Element | null)?.closest?.("[role=dialog]")) return; // notepad scrolls on its own
      e.preventDefault();
      const now = performance.now();
      if (now - last < 450 || Math.abs(e.deltaY) < 4) return;
      last = now;
      const p = useStore.getState().progress;
      const stops = REDUCED_MOTION_STOPS;
      const next = e.deltaY > 0 ? stops.find((s) => s > p + 0.002) : [...stops].reverse().find((s) => s < p - 0.002);
      if (next !== undefined) scrollToProgress(next);
    };
    if (reduced) window.addEventListener("wheel", onWheel, { passive: false });
    return () => {
      gsap.ticker.remove(raf);
      lenis?.destroy();
      window.removeEventListener("wheel", onWheel);
    };
  }, []);

  useGSAP(
    () => {
      if (!container.current) return;
      ScrollTrigger.create({
        trigger: container.current,
        start: "top top",
        end: "bottom bottom",
        // read it from the page, not self.progress. ScrollTrigger caches the runway height and with
        // mandatory scroll-snap its refresh kept the old one when the phone runway got shorter
        // (0.13 showed as 0.08). runway = whole page so it's the same mapping
        onUpdate: () => {
          const max = document.documentElement.scrollHeight - window.innerHeight;
          useStore.getState().set({ progress: max > 0 ? Math.min(1, Math.max(0, window.scrollY / max)) : 0 });
        },
      });
    },
    { scope: container },
  );
}

/** re-measure the runway after its height changes */
export function refreshScroll() {
  ScrollTrigger.refresh();
}

/** jump to a progress value (tests + dev panel) */
export function scrollToProgress(p: number) {
  const max = document.documentElement.scrollHeight - window.innerHeight;
  window.scrollTo({ top: p * max, behavior: "instant" as ScrollBehavior });
}
