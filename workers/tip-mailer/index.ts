// tip-mailer worker. only reachable from the pages function through its service binding (no public
// route), emails each tip to me through email routing's send_email binding
import { EmailMessage } from "cloudflare:email";

interface Env {
  TIP_EMAIL: SendEmail;
  /** sender on the email routing domain, e.g. tips@<your domain> */
  TIP_FROM: string;
  /** my verified destination address (the binding only allows that one) */
  TIP_TO: string;
}

/** RFC 2047 for headers that might contain any name */
const word = (s: string) => `=?UTF-8?B?${btoa(String.fromCharCode(...new TextEncoder().encode(s)))}?=`;
const base64 = (s: string) =>
  btoa(String.fromCharCode(...new TextEncoder().encode(s)))
    .match(/.{1,76}/g)!
    .join("\r\n");

const mailer = {
  async fetch(request: Request, env: Env) {
    if (request.method !== "POST") return new Response("POST only", { status: 405 });
    const { name, email, message } = (await request.json()) as { name: string; email: string; message: string };
    // block header injection (the pages function validates too)
    if (/[\r\n]/.test(name + email)) return new Response("bad header", { status: 400 });
    const domain = env.TIP_FROM.split("@")[1];
    const raw = [
      `From: ${word("Case File tip line")} <${env.TIP_FROM}>`,
      `To: <${env.TIP_TO}>`,
      `Reply-To: ${word(name)} <${email}>`,
      `Subject: ${word(`Tip from ${name}`)}`,
      `Message-ID: <${crypto.randomUUID()}@${domain}>`,
      `Date: ${new Date().toUTCString()}`,
      "MIME-Version: 1.0",
      "Content-Type: text/plain; charset=utf-8",
      "Content-Transfer-Encoding: base64",
      "",
      base64(`${message}\n\n— ${name} <${email}>\nFiled from the Case File tip line.`),
    ].join("\r\n");
    await env.TIP_EMAIL.send(new EmailMessage(env.TIP_FROM, env.TIP_TO, raw));
    return new Response("sent");
  },
} satisfies ExportedHandler<Env>;

export default mailer;
