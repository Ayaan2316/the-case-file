"use client";

import { type ReactNode, useEffect, useRef } from "react";
import { caseFile } from "@/content/case";
import { closeResume } from "@/lib/contact";
import { useStore } from "@/lib/store";
import styles from "./ResumeWindow.module.css";

/**
 * resume window - the case report itself (same sheet as /resume, server rendered and passed in as
 * `children`), taken out of the RÉSUMÉ drawer at the end. proper dialog: focus moves in and stays,
 * escape puts it back, focus returns. the backdrop is its own scroller so the wheel scrolls the
 * resume instead of the story
 */
export default function ResumeWindow({ children }: { children: ReactNode }) {
  const open = useStore((s) => s.resumeOpen);
  const dialog = useRef<HTMLDivElement>(null);
  const close = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    const returnTo = document.activeElement as HTMLElement | null;
    close.current?.focus({ preventScroll: true });
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") return closeResume();
      if (e.key !== "Tab" || !dialog.current) return;
      const items = [...dialog.current.querySelectorAll<HTMLElement>("a[href], button:not([disabled])")];
      if (!items.length) return;
      const [a, z] = [items[0], items[items.length - 1]];
      if (e.shiftKey && document.activeElement === a) {
        e.preventDefault();
        z.focus();
      } else if (!e.shiftKey && document.activeElement === z) {
        e.preventDefault();
        a.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      returnTo?.focus?.({ preventScroll: true });
    };
  }, [open]);

  if (!open) return null;
  const c = caseFile.contact;
  return (
    <div className={styles.backdrop} data-lenis-prevent onClick={(e) => e.target === e.currentTarget && closeResume()}>
      <div ref={dialog} className={styles.window} role="dialog" aria-modal="true" aria-labelledby="resume-window-name">
        <div className={styles.bar}>
          <p className={styles.label}>RÉSUMÉ · CASE No. {caseFile.caseNumber}</p>
          <a className={styles.download} href={caseFile.subject.resumePdf} download="Ayaan-Bagawan-resume.pdf">
            Download the PDF
          </a>
          <button ref={close} type="button" className={styles.close} aria-label={c.closeResume} onClick={closeResume}>
            ×
          </button>
        </div>
        <div className={styles.paper}>{children}</div>
      </div>
    </div>
  );
}
