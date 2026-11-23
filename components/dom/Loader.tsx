"use client";

import { useEffect, useState } from "react";
import { useStore } from "@/lib/store";
import styles from "./Loader.module.css";

/** darkroom loader: the office photo develops in a red lit tray while things load */
export default function Loader() {
  const loaded = useStore((s) => s.loaded);
  const ready = useStore((s) => s.ready);
  const [gone, setGone] = useState(false);

  useEffect(() => {
    if (!ready) return;
    const t = setTimeout(() => setGone(true), 1400);
    return () => clearTimeout(t);
  }, [ready]);

  if (gone) return null;
  const pct = Math.round(loaded * 100);
  return (
    <div className={styles.darkroom} data-ready={ready} role="status" aria-live="polite">
      <div className={styles.tray}>
        <div className={styles.liquid} />
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          className={styles.photo}
          src="/images/darkroom.webp"
          alt=""
          style={{ ["--develop" as string]: loaded }}
        />
      </div>
      <p className={styles.label}>Developing evidence… {pct}%</p>
    </div>
  );
}
