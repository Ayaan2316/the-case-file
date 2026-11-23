// POST /api/tip (pages function): validate the tip with the notepad's zod schema, check the
// turnstile token, rate limit by a salted IP hash, save it in D1, then ask the tip-mailer worker
// to email me (pages functions don't get the send_email binding)
import { tipSchema, type TipResponse } from "../../lib/tip";

interface Env {
  DB: D1Database;
  /** workers/tip-mailer bound as a service. optional, without it the tip just gets stored */
  MAILER?: Fetcher;
  TURNSTILE_SECRET: string;
  IP_SALT: string;
}

/** max tips per IP hash per hour */
const PER_HOUR = 5;

const reply = (status: number, body: TipResponse) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" } });

async function sha256(text: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  let input: unknown;
  try {
    input = await request.json();
  } catch {
    return reply(400, { ok: false, error: "That wasn't a tip the line could read." });
  }
  const parsed = tipSchema.safeParse(input);
  if (!parsed.success) return reply(400, { ok: false, error: parsed.error.issues[0]?.message ?? "Check the fields." });
  const tip = parsed.data;
  const ip = request.headers.get("CF-Connecting-IP") ?? "";

  const check = new FormData();
  // trim it, a pasted key can come with a stray newline or space
  check.append("secret", (env.TURNSTILE_SECRET ?? "").trim());
  check.append("response", tip.token);
  if (ip) check.append("remoteip", ip);
  const verdict = (await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", { method: "POST", body: check })
    .then((r) => r.json())
    .catch(() => ({ success: false, "error-codes": ["siteverify-unreachable"] }))) as { success: boolean; "error-codes"?: string[] };
  if (!verdict.success) {
    // turnstile's error code for `wrangler pages deployment tail` (never log the key or token).
    // invalid-input-secret = wrong key in pages, timeout-or-duplicate = stale token
    console.error("turnstile rejected the tip:", (verdict["error-codes"] ?? []).join(", ") || "no reason given");
    return reply(403, { ok: false, error: "The robot check didn't pass. Try it once more." });
  }

  const ipHash = await sha256(`${env.IP_SALT}:${ip}`);
  const now = Date.now();
  const recent = await env.DB.prepare("SELECT COUNT(*) AS n FROM tips WHERE ip_hash = ?1 AND created_at > ?2")
    .bind(ipHash, now - 3_600_000)
    .first<{ n: number }>();
  if ((recent?.n ?? 0) >= PER_HOUR) return reply(429, { ok: false, error: "That's a lot of tips for one hour. Try again later." });

  await env.DB.prepare("INSERT INTO tips (name, email, message, created_at, ip_hash) VALUES (?1, ?2, ?3, ?4, ?5)")
    .bind(tip.name, tip.email, tip.message, now, ipHash)
    .run();

  // tip is saved no matter what happens with the email
  if (env.MAILER) {
    try {
      const r = await env.MAILER.fetch("https://tip-mailer/send", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name: tip.name, email: tip.email, message: tip.message }),
      });
      if (!r.ok) console.error("tip-mailer answered", r.status);
    } catch (e) {
      console.error("tip-mailer failed", e);
    }
  }
  return reply(200, { ok: true });
};

/** anything that isn't POST */
export const onRequest: PagesFunction<Env> = async () => reply(405, { ok: false, error: "Tips are filed with POST." });
