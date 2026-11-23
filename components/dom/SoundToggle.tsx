"use client";

import { setSound } from "@/lib/audio";
import { useStore } from "@/lib/store";
import styles from "./controls.module.css";

/** sound is off until the visitor turns it on, the radio in the office does the same thing */
export default function SoundToggle() {
  const on = useStore((s) => s.soundOn);
  return (
    <button type="button" className={styles.control} aria-pressed={on} onClick={() => setSound(!on)}>
      Sound: {on ? "on" : "off"}
    </button>
  );
}
