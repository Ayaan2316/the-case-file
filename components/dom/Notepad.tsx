"use client";

import { type FormEvent, useEffect, useRef, useState } from "react";
import { caseFile } from "@/content/case";
import { closeNotepad, openDrawer } from "@/lib/contact";
import { type TipResponse, tipSchema } from "@/lib/tip";
import { loadTurnstile, SITE_KEY } from "@/lib/turnstile";
import styles from "./Notepad.module.css";

type Field = "name" | "email" | "message" | "token";
type Status = { state: "idle" | "sending" } | { state: "filed" } | { state: "failed"; detail: string };

/**
 * the notepad. opens when you pick up the phone - tip form (name, email, message, turnstile) plus
 * the other ways to reach me. proper dialog: focus moves in and stays in, escape hangs up,
 * focus goes back where it was
 */
export default function Notepad() {
  const c = caseFile.contact;
  const s = caseFile.subject;
  const dialog = useRef<HTMLDivElement>(null);
  const first = useRef<HTMLInputElement>(null);
  const widget = useRef<HTMLDivElement>(null);
  const widgetId = useRef<string | null>(null);
  const [token, setToken] = useState("");
  const [robotCheck, setRobotCheck] = useState<"loading" | "ready" | "unavailable">("loading");
  const [errors, setErrors] = useState<Partial<Record<Field, string>>>({});
  const [status, setStatus] = useState<Status>({ state: "idle" });

  useEffect(() => {
    const returnTo = document.activeElement as HTMLElement | null;
    first.current?.focus({ preventScroll: true });
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") return closeNotepad();
      if (e.key !== "Tab" || !dialog.current) return;
      // keep tab inside the pad
      const items = [...dialog.current.querySelectorAll<HTMLElement>("a[href], button:not([disabled]), input, textarea, iframe")];
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
  }, []);

  useEffect(() => {
    let live = true;
    loadTurnstile()
      .then((t) => {
        if (!live || !widget.current) return;
        widgetId.current = t.render(widget.current, {
          sitekey: SITE_KEY,
          theme: "light",
          callback: (v: string) => setToken(v),
          "expired-callback": () => setToken(""),
          "error-callback": () => setToken(""),
        });
        setRobotCheck("ready");
      })
      .catch(() => live && setRobotCheck("unavailable"));
    return () => {
      live = false;
      if (widgetId.current) window.turnstile?.remove(widgetId.current);
    };
  }, []);

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const parsed = tipSchema.safeParse({ name: form.get("name"), email: form.get("email"), message: form.get("message"), token });
    if (!parsed.success) {
      const next: Partial<Record<Field, string>> = {};
      for (const issue of parsed.error.issues) next[issue.path[0] as Field] ??= issue.message;
      setErrors(next);
      return;
    }
    setErrors({});
    setStatus({ state: "sending" });
    try {
      const r = await fetch("/api/tip", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(parsed.data) });
      const body = (await r.json().catch(() => null)) as TipResponse | null;
      if (r.ok && body?.ok) setStatus({ state: "filed" });
      else setStatus({ state: "failed", detail: body && !body.ok ? body.error : `The server answered ${r.status}.` });
    } catch {
      setStatus({ state: "failed", detail: "No connection." });
    }
    // turnstile tokens only work for one check
    if (widgetId.current) window.turnstile?.reset(widgetId.current);
    setToken("");
  }

  const field = (name: Field) => ({
    "aria-invalid": errors[name] ? true : undefined,
    "aria-describedby": errors[name] ? `tip-${name}-error` : undefined,
  });

  return (
    <div className={styles.backdrop}>
      <div ref={dialog} className={styles.pad} role="dialog" aria-modal="true" aria-labelledby="tip-title">
        <button type="button" className={styles.close} onClick={closeNotepad} aria-label="Hang up and close the notepad">
          ×
        </button>
        <p className={styles.eyebrow}>CASE No. {caseFile.caseNumber} · TIP LINE</p>
        <h2 id="tip-title" className={styles.title}>
          {c.formTitle}
        </h2>

        {status.state === "filed" ? (
          <div className={styles.filed} role="status">
            <p className={styles.stamp}>{c.filed}</p>
            <p>{c.filedNote}</p>
          </div>
        ) : (
          <form className={styles.form} onSubmit={submit} noValidate>
            <label htmlFor="tip-name">Name</label>
            <input ref={first} id="tip-name" name="name" autoComplete="name" maxLength={80} required {...field("name")} />
            {errors.name && <p id="tip-name-error" className={styles.error}>{errors.name}</p>}

            <label htmlFor="tip-email">Email</label>
            <input id="tip-email" name="email" type="email" autoComplete="email" maxLength={120} required {...field("email")} />
            {errors.email && <p id="tip-email-error" className={styles.error}>{errors.email}</p>}

            <label htmlFor="tip-message">The tip</label>
            <textarea id="tip-message" name="message" rows={5} maxLength={2000} required {...field("message")} />
            {errors.message && <p id="tip-message-error" className={styles.error}>{errors.message}</p>}

            <div ref={widget} className={styles.turnstile} />
            {robotCheck === "unavailable" && (
              <p className={styles.error}>The robot check didn&apos;t load. Email instead, or try again later.</p>
            )}
            {errors.token && <p id="tip-token-error" className={styles.error}>{errors.token}</p>}

            <button type="submit" className={styles.submit} disabled={status.state === "sending"}>
              {status.state === "sending" ? "Filing…" : c.submit}
            </button>
            <div role="status" aria-live="polite" className={styles.status}>
              {status.state === "failed" && (
                <p className={styles.error}>
                  {c.failed} <a href={`mailto:${s.email}`}>{s.email}</a>. ({status.detail})
                </p>
              )}
            </div>
          </form>
        )}

        <h3 className={styles.heading}>Other lines</h3>
        <ul className={styles.lines}>
          <li>
            <a href={s.github} target="_blank" rel="noreferrer">
              GitHub
            </a>
          </li>
          <li>
            <a href={s.linkedin} target="_blank" rel="noreferrer">
              LinkedIn
            </a>
          </li>
          <li>
            <a href={`tel:${s.phone.replace(/\s/g, "")}`}>{s.phone}</a>
          </li>
          <li>
            <a href={`mailto:${s.email}`}>{s.email}</a>
          </li>
          <li>
            <button type="button" className={styles.link} onClick={openDrawer}>
              {c.resume}
            </button>
          </li>
        </ul>
        <p className={styles.footer}>{c.footer}</p>
      </div>
    </div>
  );
}
