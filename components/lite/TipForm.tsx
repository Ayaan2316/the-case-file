"use client";

import { type FormEvent, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { caseFile } from "@/content/case";
import type { TipResponse } from "@/lib/tip";
import { loadTurnstile, SITE_KEY } from "@/lib/turnstile";
import styles from "./lite.module.css";

type Field = "name" | "email" | "message" | "token";
type Status = { state: "idle" | "sending" } | { state: "filed" } | { state: "failed"; detail: string };

const never = () => () => {};
/** true once react runs, before that (or with no JS) the form can't send */
const useHydrated = () =>
  useSyncExternalStore(
    never,
    () => true,
    () => false,
  );

/**
 * lite file tip form, same checks and endpoint as the 3D notepad. none of it loads with the page,
 * turnstile and zod only come in once the form gets near the screen or is touched
 */
export default function TipForm() {
  const c = caseFile.contact;
  const s = caseFile.subject;
  const hydrated = useHydrated();
  const form = useRef<HTMLFormElement>(null);
  const widget = useRef<HTMLDivElement>(null);
  const widgetId = useRef<string | null>(null);
  const [armed, setArmed] = useState(false);
  const [token, setToken] = useState("");
  const [robotCheck, setRobotCheck] = useState<"waiting" | "ready" | "unavailable">("waiting");
  const [errors, setErrors] = useState<Partial<Record<Field, string>>>({});
  const [status, setStatus] = useState<Status>({ state: "idle" });

  // get ready once the form is a screen away
  useEffect(() => {
    const el = form.current;
    if (armed || !el || typeof IntersectionObserver === "undefined") return;
    const io = new IntersectionObserver((entries) => entries.some((e) => e.isIntersecting) && setArmed(true), {
      rootMargin: "600px 0px",
    });
    io.observe(el);
    return () => io.disconnect();
  }, [armed]);

  useEffect(() => {
    if (!armed) return;
    let live = true;
    void import("@/lib/tip");
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
      widgetId.current = null;
    };
  }, [armed]);

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setArmed(true);
    const data = new FormData(e.currentTarget);
    const { tipSchema } = await import("@/lib/tip");
    const parsed = tipSchema.safeParse({ name: data.get("name"), email: data.get("email"), message: data.get("message"), token });
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
    "aria-describedby": errors[name] ? `lite-tip-${name}-error` : undefined,
  });
  const error = (name: Field) =>
    errors[name] && (
      <p id={`lite-tip-${name}-error`} className={styles.error}>
        {errors[name]}
      </p>
    );

  return (
    <div className={styles.pad}>
      <p className={styles.eyebrow}>
        Case No. {caseFile.caseNumber} · {caseFile.lite.sections.contact[0]}
      </p>
      <h3 id="lite-tip-title">{c.formTitle}</h3>
      {status.state === "filed" ? (
        <div className={styles.filed} role="status">
          <p className={styles.filedStamp}>{c.filed}</p>
          <p>{c.filedNote}</p>
        </div>
      ) : (
        <form ref={form} method="post" onSubmit={submit} onFocus={() => setArmed(true)} noValidate aria-labelledby="lite-tip-title">
          <label htmlFor="lite-tip-name">Name</label>
          <input id="lite-tip-name" name="name" autoComplete="name" maxLength={80} required {...field("name")} />
          {error("name")}
          <label htmlFor="lite-tip-email">Email</label>
          <input id="lite-tip-email" name="email" type="email" autoComplete="email" maxLength={120} required {...field("email")} />
          {error("email")}
          <label htmlFor="lite-tip-message">The tip</label>
          <textarea id="lite-tip-message" name="message" rows={4} maxLength={2000} required {...field("message")} />
          {error("message")}
          <div ref={widget} className={styles.turnstile} />
          {robotCheck === "unavailable" && (
            <p className={styles.error}>The robot check didn&apos;t load. Email instead, or try again later.</p>
          )}
          {error("token")}
          <button type="submit" disabled={!hydrated || status.state === "sending"}>
            {status.state === "sending" ? "Filing…" : c.submit}
          </button>
          <div role="status" aria-live="polite">
            {status.state === "failed" && (
              <p className={styles.error}>
                {c.failed} <a href={`mailto:${s.email}`}>{s.email}</a>. ({status.detail})
              </p>
            )}
          </div>
          <noscript>
            <p className={styles.padNote}>{caseFile.lite.noScript}</p>
          </noscript>
        </form>
      )}
    </div>
  );
}
