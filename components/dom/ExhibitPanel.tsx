"use client";

import { useEffect, useRef } from "react";
import { caseFile, type Exhibit } from "@/content/case";
import { useStore } from "@/lib/store";
import styles from "./ExhibitPanel.module.css";

/**
 * case study for one exhibit. slides in over the board when a polaroid (or its caption button) is
 * clicked. proper dialog: focus moves in, escape closes, focus goes back where it was
 */
export default function ExhibitPanel() {
  const openId = useStore((s) => s.openExhibit);
  const exhibit: Exhibit | undefined = caseFile.exhibits.find((e) => e.id === openId);
  const closeRef = useRef<HTMLButtonElement>(null);
  const returnTo = useRef<Element | null>(null);

  const close = () => useStore.getState().set({ openExhibit: null, reading: false });

  useEffect(() => {
    if (!exhibit) return;
    returnTo.current = document.activeElement;
    closeRef.current?.focus({ preventScroll: true });
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && close();
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      (returnTo.current as HTMLElement | null)?.focus?.({ preventScroll: true });
    };
  }, [exhibit]);

  if (!exhibit) return null;
  const photos = [exhibit.photo, ...(exhibit.gallery ?? [])];
  return (
    <div className={styles.backdrop} onClick={close}>
      <aside
        className={styles.panel}
        role="dialog"
        aria-modal="true"
        aria-labelledby="exhibit-title"
        onClick={(e) => e.stopPropagation()}
      >
        <button ref={closeRef} type="button" className={styles.close} onClick={close} aria-label="Close the exhibit file">
          ×
        </button>
        <p className={styles.eyebrow}>
          Exhibit {exhibit.id}
          {exhibit.kind === "research" ? " · Research" : exhibit.kind === "sealed" ? " · Sealed" : ""} · Case No.{" "}
          {caseFile.caseNumber}
        </p>
        <h2 id="exhibit-title" className={styles.title}>
          {exhibit.title}
        </h2>
        <p className={styles.tag}>{exhibit.tag}</p>
        <p className={styles.summary}>{exhibit.summary}</p>
        {/* sealed file, nothing to show yet */}
        {exhibit.evidence.length > 0 && (
          <>
            <h3 className={styles.heading}>Evidence</h3>
            <ul className={styles.evidence}>
              {exhibit.evidence.map((e) => (
                <li key={e}>{e}</li>
              ))}
            </ul>
          </>
        )}
        {exhibit.stack.length > 0 && (
          <>
            <h3 className={styles.heading}>Tools at the scene</h3>
            <ul className={styles.stack}>
              {exhibit.stack.map((s) => (
                <li key={s}>{s}</li>
              ))}
            </ul>
          </>
        )}
        <div className={styles.photos}>
          {photos.map((src) => (
            // eslint-disable-next-line @next/next/no-img-element
            <img key={src} src={src} alt={`${exhibit.title}: evidence photo`} loading="lazy" />
          ))}
        </div>
        {exhibit.links.length > 0 && (
          <ul className={styles.links}>
            {exhibit.links.map((l) => (
              <li key={l.href}>
                <a href={l.href} target="_blank" rel="noreferrer">
                  {l.label}
                </a>
              </li>
            ))}
          </ul>
        )}
        <p className={styles.note} aria-label="Note on the back of the polaroid">
          “{exhibit.backNote}”
        </p>
      </aside>
    </div>
  );
}
