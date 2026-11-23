"use client";

import { useEffect, useState } from "react";
import { caseFile } from "@/content/case";
import { useStore } from "@/lib/store";
import styles from "./EasterEggs.module.css";

const KONAMI = ["ArrowUp", "ArrowUp", "ArrowDown", "ArrowDown", "ArrowLeft", "ArrowRight", "ArrowLeft", "ArrowRight", "b", "a"];
const AWAY = "Come back, detective…";

// magnifying glass for anyone who opens devtools
const GLASS = String.raw`
      .-"""-.
     /       \
    |  CASE   |
    |  2316   |
     \       /
      '-...-'\
              \\
               \\`;

/**
 * DOM side of the easter eggs: konami code (banker's lamp), fedora brim over the view,
 * tab title while you're away, and a note in the console
 */
export default function EasterEggs() {
  const hatUntil = useStore((s) => s.hatUntil);
  const [hat, setHat] = useState(false);
  const [toast, setToast] = useState("");

  useEffect(() => {
    let at = 0;
    const onKey = (e: KeyboardEvent) => {
      const key = e.key.length === 1 ? e.key.toLowerCase() : e.key;
      at = key === KONAMI[at] ? at + 1 : key === KONAMI[0] ? 1 : 0;
      if (at < KONAMI.length) return;
      at = 0;
      const on = !useStore.getState().lampOn;
      useStore.getState().set({ lampOn: on });
      setToast(on ? "The banker's lamp clicks on." : "The banker's lamp clicks off.");
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(""), 2600);
    return () => clearTimeout(t);
  }, [toast]);

  useEffect(() => {
    const title = document.title;
    const onVisibility = () => (document.title = document.hidden ? AWAY : title);
    document.addEventListener("visibilitychange", onVisibility);
    console.log(
      `%c${GLASS}\n\n%cYou inspected the source. Good instinct.\n%c${caseFile.subject.email}`,
      "color:#c1272d;font-family:monospace",
      "color:#ede4d0;background:#1d1915;font:14px monospace;padding:4px 8px",
      "color:#ffd696;font:13px monospace",
    );
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      document.title = title;
    };
  }, []);

  // hat stays on until hatUntil, then comes off
  useEffect(() => {
    const left = hatUntil - performance.now();
    if (left <= 0) return;
    // brim visibility follows a timestamp the 3D scene sets
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setHat(true);
    const t = setTimeout(() => setHat(false), left);
    return () => clearTimeout(t);
  }, [hatUntil]);

  return (
    <>
      {hat && (
        <div className={styles.hat} aria-hidden="true">
          <svg className={styles.brim} viewBox="0 0 1600 420" preserveAspectRatio="none">
            {/* underside of a felt brim right by your eye: dark, soft edges, ribbon band */}
            <defs>
              <linearGradient id="felt" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0" stopColor="#060504" />
                <stop offset="0.75" stopColor="#15110d" />
                <stop offset="1" stopColor="#241c15" />
              </linearGradient>
            </defs>
            <path d="M-60 0 H1660 V170 C1340 330 260 330 -60 170 Z" fill="url(#felt)" />
            <path d="M-60 150 C260 300 1340 300 1660 150" stroke="#2f241a" strokeWidth="14" fill="none" opacity="0.7" />
          </svg>
        </div>
      )}
      <p className="sr-only" role="status" aria-live="polite">
        {toast}
      </p>
      {toast && (
        <p className={styles.toast} aria-hidden="true">
          {toast}
        </p>
      )}
    </>
  );
}
