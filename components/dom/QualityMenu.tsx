"use client";

import type { Tier } from "@/lib/quality";
import { useStore } from "@/lib/store";
import styles from "./controls.module.css";

const NEXT: Record<Tier, Tier> = { ultra: "medium", medium: "low", low: "ultra" };

/** manual quality override. clicking cycles tiers and stops the auto switching */
export default function QualityMenu() {
  const tier = useStore((s) => s.tier);
  return (
    <button
      type="button"
      className={styles.control}
      onClick={() => useStore.getState().set({ tier: NEXT[tier], tierLocked: true, renderScale: 1, trim: 0 })}
      aria-label={`Quality: ${tier}. Change quality`}
    >
      Quality: {tier}
    </button>
  );
}
