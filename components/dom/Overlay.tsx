"use client";

import Link from "next/link";
import { useEffect, useRef } from "react";
import { caseFile } from "@/content/case";
import { BEATS, CUTS, EXHIBIT_STEPS, TABLE, within } from "@/lib/cameraPath";
import manifestJson from "@/public/models/scene.json";
import { setSound } from "@/lib/audio";
import { answerPhone, closeDrawer, openResume } from "@/lib/contact";
import { exchangeAt } from "@/lib/content";
import { useStore } from "@/lib/store";
import styles from "./Overlay.module.css";
import QualityMenu from "./QualityMenu";
import SoundToggle from "./SoundToggle";

// where each bag sits along the table (three x), for the "under the camera" mark in the log
const BAG_X = caseFile.tools.map(
  (_, i) =>
    (manifestJson as { table?: { bags: { position: number[] }[] } }).table?.bags[i]?.position[0] ??
    TABLE.x + (i - (caseFile.tools.length - 1) / 2) * 0.18,
);
const SLIDE_X = [1.32, 3.02] as const; // camera look point at the start and end of the slide

const fade = (p: number, [a, b]: readonly [number, number], edge = 0.015) =>
  Math.min(within(p, [a - edge, a + edge]), 1 - within(p, [b - edge, b + edge]));

/** captions synced to the scroll. everything stays in the DOM for screen readers */
export default function Overlay() {
  const progress = useStore((s) => s.progress);
  const corridor = fade(progress, [-0.1, 0.075]);
  const soundOn = useStore((st) => st.soundOn);
  const hero = fade(progress, [0.15, 0.25]);
  const dossier = fade(progress, [BEATS.folderOpen[1], BEATS.dossier[1]]);
  const flipped = progress > (BEATS.pageFlip[0] + BEATS.pageFlip[1]) / 2;
  const s = caseFile.subject;
  const openExhibit = useStore((st) => st.openExhibit);
  // evidence board: intro on the wide shot, then one caption per exhibit as the camera moves in
  const boardIntro = fade(progress, [BEATS.board[0] + 0.022, EXHIBIT_STEPS[0].t - 0.008]);
  const step = EXHIBIT_STEPS.find((st) => Math.abs(progress - st.t) < 0.0095);
  const exhibit = step && caseFile.exhibits[step.index];
  // evidence table: room title, then the log with the bags under the camera marked
  const table = fade(progress, [BEATS.table[0] + 0.006, BEATS.table[1]], 0.008);
  const sliding = progress > BEATS.tableSlide[0] - 0.004 && progress < BEATS.tableSlide[1] + 0.004;
  const lookX = SLIDE_X[0] + (SLIDE_X[1] - SLIDE_X[0]) * within(progress, BEATS.tableSlide);
  // interrogation: the Q/A being typed, then the verdict once the stamp's down
  const room = fade(progress, [BEATS.interrogation[0] + 0.006, BEATS.transcript[0] - 0.004], 0.008);
  const transcript = fade(progress, [BEATS.transcript[0], BEATS.transcript[1] + 0.006], 0.006);
  const line = caseFile.transcript[exchangeAt(within(progress, BEATS.transcript))];
  // contact: ringing phone prompt (keyboard way to the notepad), then the RÉSUMÉ drawer -
  // slid out at the end of the scroll or opened from the notepad
  const contact = fade(progress, [CUTS.contact + 0.006, BEATS.phone[1]], 0.006);
  const cabinet = fade(progress, [BEATS.cabinet[1] - 0.004, 1.2], 0.006);
  const answered = useStore((st) => st.phoneAnswered);
  const notepadOpen = useStore((st) => st.notepadOpen);
  const drawerOpen = useStore((st) => st.drawerOpen);
  const back = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!drawerOpen) return;
    const returnTo = document.activeElement as HTMLElement | null;
    back.current?.focus({ preventScroll: true });
    // escape over the resume window puts the resume back, not the drawer
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && !useStore.getState().resumeOpen && closeDrawer();
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      returnTo?.focus?.({ preventScroll: true });
    };
  }, [drawerOpen]);
  const verdict = fade(progress, [BEATS.stamp[0] + 0.002, CUTS.contact - 0.006], 0.004);
  const sentence = fade(progress, [BEATS.stamp[0] + 0.014, CUTS.contact - 0.006], 0.006);

  return (
    <div className={styles.overlay}>
      <Link href="/resume/" className={styles.recruiter} prefetch={false}>
        Skip to résumé
      </Link>

      <section className={styles.corridor} style={{ opacity: corridor }} aria-label="Case opening">
        <p className={styles.caseNo}>Case No. {caseFile.caseNumber}</p>
        <p className={styles.hint} aria-hidden="true">
          Scroll to investigate
        </p>
        {corridor > 0.01 && !soundOn && (
          <button type="button" className={styles.inspect} onClick={() => setSound(true)}>
            {caseFile.sound.prompt}
          </button>
        )}
      </section>

      <section className={styles.hero} style={{ opacity: hero }} aria-labelledby="hero-title">
        <p className={styles.eyebrow}>{caseFile.hero.eyebrow}</p>
        <h1 id="hero-title" className={styles.headline}>
          {caseFile.hero.headline}
        </h1>
        <p className={styles.lede}>{caseFile.hero.lede}</p>
      </section>

      <section className={styles.dossier} style={{ opacity: dossier }} aria-hidden="true">
        <p className={styles.eyebrow}>{flipped ? "MODUS OPERANDI" : "SUBJECT PROFILE"}</p>
        <p className={styles.dossierLine}>
          {flipped ? `“${caseFile.modusOperandi}”` : `${s.name} · ${s.trade} · ${s.status}`}
        </p>
      </section>

      <section className={styles.dossier} style={{ opacity: openExhibit ? 0 : boardIntro }} aria-hidden="true">
        <p className={styles.eyebrow}>THE EVIDENCE BOARD</p>
        <p className={styles.dossierLine}>
          {caseFile.exhibits.length} exhibits, one red thread.{" "}
          <span className={styles.mouseOnly}>Hover a polaroid; click it to open the file.</span>
          <span className={styles.touchOnly}>Tap a polaroid to open the file.</span>
        </p>
      </section>

      {exhibit && !openExhibit && (
        <section className={styles.exhibit} aria-labelledby={`exhibit-cap-${exhibit.id}`}>
          <p className={styles.eyebrow}>EXHIBIT {exhibit.id}</p>
          <h2 id={`exhibit-cap-${exhibit.id}`} className={styles.exhibitTitle}>
            {exhibit.title}
          </h2>
          <p className={styles.dossierLine}>{exhibit.summary}</p>
          <button
            type="button"
            className={styles.inspect}
            onClick={() => useStore.getState().set({ openExhibit: exhibit.id, reading: true })}
          >
            Open the file
          </button>
        </section>
      )}

      <section className={styles.table} style={{ opacity: table }} aria-hidden="true">
        <p className={styles.eyebrow}>EVIDENCE ROOM · CASE No. {caseFile.caseNumber}</p>
        <h2 className={styles.exhibitTitle}>Tools found at the scene</h2>
        <ol className={styles.log}>
          {caseFile.tools.map((t, i) => (
            <li key={t.name} className={sliding && Math.abs(BAG_X[i] - lookX) < 0.2 ? styles.inView : undefined}>
              <span className={styles.item}>{String(i + 1).padStart(2, "0")}</span>
              <span className={styles.tool}>{t.name}</span>
              <span className={styles.note}>{t.note}</span>
            </li>
          ))}
        </ol>
      </section>

      <section className={styles.dossier} style={{ opacity: room }} aria-hidden="true">
        <p className={styles.eyebrow}>INTERROGATION · CASE No. {caseFile.caseNumber}</p>
        <p className={styles.dossierLine}>{caseFile.subject.name}, on tape.</p>
      </section>

      <section className={styles.transcript} style={{ opacity: transcript }} aria-hidden="true">
        <p className={styles.question}>Q: {line?.q}</p>
        <p className={styles.answer}>A: {line?.a}</p>
      </section>

      <section className={styles.verdict} style={{ opacity: verdict }} aria-hidden="true">
        <p className={styles.stamp}>{caseFile.verdict.stamp}</p>
        <p className={styles.charge}>{caseFile.verdict.charge}</p>
        <p className={styles.sentence} style={{ opacity: sentence }}>
          <span>SENTENCE:</span> {caseFile.verdict.sentence}
        </p>
      </section>

      {contact > 0.01 && !notepadOpen && !drawerOpen && (
        <section className={styles.dossier} style={{ opacity: contact }} aria-labelledby="contact-title">
          <p className={styles.eyebrow}>{answered ? `CASE No. ${caseFile.caseNumber}` : "THE PHONE IS RINGING"}</p>
          <h2 id="contact-title" className={styles.exhibitTitle}>
            {answered ? caseFile.contact.formTitle : caseFile.contact.prompt}
          </h2>
          <p className={styles.dossierLine}>{caseFile.contact.footer}</p>
          <button type="button" className={styles.inspect} onClick={answerPhone}>
            {answered ? caseFile.contact.formTitle : caseFile.contact.prompt}
          </button>
        </section>
      )}

      {/* stays mounted under the resume window so focus comes back to its button */}
      {(drawerOpen || (cabinet > 0.01 && !notepadOpen)) && (
        <section className={styles.dossier} style={drawerOpen ? undefined : { opacity: cabinet }} aria-labelledby="drawer-title">
          <p className={styles.eyebrow}>FILING CABINET · CASE No. {caseFile.caseNumber}</p>
          <h2 id="drawer-title" className={styles.exhibitTitle}>
            Résumé
          </h2>
          <p className={styles.dossierLine}>
            <a href={s.resumePdf} download="Ayaan-Bagawan-resume.pdf">
              Download the PDF
            </a>{" "}
            or{" "}
            <Link href="/resume/" prefetch={false}>
              read it on the page
            </Link>
            .
          </p>
          <p className={styles.actions}>
            <button type="button" className={styles.inspect} onClick={openResume}>
              {caseFile.contact.openResume}
            </button>
            {drawerOpen && (
              <button ref={back} type="button" className={styles.inspect} onClick={closeDrawer}>
                Back to the desk
              </button>
            )}
          </p>
        </section>
      )}

      <div className={styles.controls}>
        <SoundToggle />
        <QualityMenu />
      </div>
    </div>
  );
}
