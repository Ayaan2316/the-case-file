"use client";

import { caseFile } from "@/content/case";
import { force3d } from "@/lib/quality";
import { useStore } from "@/lib/store";
import styles from "./SlowNotice.module.css";

/**
 * 3D can't keep up on this computer (medium at its lowest res, or forced 3D crawling on low),
 * so offer the lite file. nothing changes until they pick. keeping the 3D stops asking for this
 * visit (and lets it drop to low)
 */
export default function SlowNotice() {
  const show = useStore((s) => s.slowPrompt && !s.flat);
  if (!show) return null;
  const f = caseFile.fallback;
  return (
    <div className={styles.notice} role="status">
      <p>{f.slowPrompt}</p>
      <button type="button" onClick={() => useStore.getState().set({ flat: "slow", slowPrompt: false })}>
        {f.switchToLite}
      </button>
      <button
        type="button"
        onClick={() => {
          force3d(true);
          useStore.getState().set({ slowPrompt: false });
        }}
      >
        {f.keep3d}
      </button>
    </div>
  );
}
