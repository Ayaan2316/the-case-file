"use client";

import { useEffect } from "react";

/**
 * exhibit files on the lite board open by anchor (css :target) so they work with zero JS. this adds
 * the dialog stuff once JS is running: focus moves into the file and back to its photo after,
 * closing (links, escape) goes back in history so the page stays put, prev/next (links, arrow keys)
 * replace the entry so closing goes back to the board and not the last exhibit, and tab stays inside
 */
export default function FileKeys({ board }: { board: string }) {
  useEffect(() => {
    if (document.documentElement.getAttribute("data-mode") === "3d") return;
    /** file was opened from this page, going back closes it */
    let openedHere = false;
    let returnTo: HTMLElement | null = null;

    const open = () => {
      const id = decodeURIComponent(location.hash.slice(1));
      const el = id ? document.getElementById(id) : null;
      return el?.hasAttribute("data-file") ? el : null;
    };
    const step = (href: string | null) => href && location.replace(href);
    const close = () => {
      if (!open()) return;
      if (openedHere) history.back();
      else location.replace(`#${board}`);
    };
    const sync = () => {
      const file = open();
      if (file) {
        file.scrollTop = 0;
        file.querySelector<HTMLElement>("h3")?.focus({ preventScroll: true });
        return;
      }
      openedHere = false;
      returnTo?.focus({ preventScroll: true });
      returnTo = null;
    };
    const onClick = (e: MouseEvent) => {
      const a = (e.target as Element | null)?.closest?.("a");
      if (!a) return;
      if (a.hasAttribute("data-close")) {
        e.preventDefault();
        close();
      } else if (a.hasAttribute("data-step") && open()) {
        e.preventDefault();
        step(a.getAttribute("href"));
      } else if (!open() && document.getElementById((a.getAttribute("href") ?? "").slice(1))?.hasAttribute("data-file")) {
        openedHere = true;
        returnTo = a;
      }
    };
    const onKey = (e: KeyboardEvent) => {
      const file = open();
      if (!file) return;
      if (e.key === "Escape") {
        e.preventDefault();
        close();
      } else if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
        const link = file.querySelector(`[data-step="${e.key === "ArrowLeft" ? "prev" : "next"}"]`);
        if (link) {
          e.preventDefault();
          step(link.getAttribute("href"));
        }
      } else if (e.key === "Tab") {
        const items = [...file.querySelectorAll<HTMLElement>("a[href]:not([tabindex='-1'])")];
        if (!items.length) return;
        const [first, last] = [items[0], items[items.length - 1]];
        const inside = file.contains(document.activeElement);
        if (e.shiftKey && (document.activeElement === first || !inside)) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && (document.activeElement === last || !inside)) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    addEventListener("hashchange", sync);
    document.addEventListener("click", onClick);
    addEventListener("keydown", onKey);
    // came in on a direct link to a file
    sync();
    return () => {
      removeEventListener("hashchange", sync);
      document.removeEventListener("click", onClick);
      removeEventListener("keydown", onKey);
    };
  }, [board]);
  return null;
}
