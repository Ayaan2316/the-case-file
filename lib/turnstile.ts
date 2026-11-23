// turnstile robot check for the tip line, used by both the 3D notepad and the lite form

/** cloudflare's always-pass test key until NEXT_PUBLIC_TURNSTILE_SITE_KEY is set */
export const SITE_KEY = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY || "1x00000000000000000000AA";
const TURNSTILE = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";

export type Turnstile = {
  render: (el: HTMLElement, options: Record<string, unknown>) => string;
  reset: (id: string) => void;
  remove: (id: string) => void;
};
declare global {
  interface Window {
    turnstile?: Turnstile;
  }
}

let loading: Promise<Turnstile> | null = null;
/** load the turnstile script the first time a tip form is used, never on first paint */
export function loadTurnstile() {
  loading ??= new Promise<Turnstile>((resolve, reject) => {
    if (window.turnstile) return resolve(window.turnstile);
    const s = document.createElement("script");
    s.src = TURNSTILE;
    s.async = true;
    s.onload = () => (window.turnstile ? resolve(window.turnstile) : reject(new Error("turnstile")));
    s.onerror = () => {
      loading = null;
      reject(new Error("turnstile"));
    };
    document.head.appendChild(s);
  });
  return loading;
}
