/* eslint-disable @next/next/no-img-element -- a static export has no image optimiser: the small copies come through srcSet (pnpm lite:images). */
import { existsSync } from "node:fs";
import { join } from "node:path";
import { caseFile, type Exhibit } from "@/content/case";
import { liteSrcSet, webpSize } from "@/lib/imageSize";
import { boardLayout } from "./board";
import styles from "./lite.module.css";
import FileKeys from "./FileKeys";
import TipForm from "./TipForm";

const { subject, lite } = caseFile;
const L = lite.sections;

/** section anchors (the print-only report on the same page has its own ids) */
const ID = {
  contents: "contents",
  profile: "subject",
  experience: "cover-story",
  board: "evidence-board",
  log: "evidence-log",
  record: "prior-record",
  interview: "interrogation",
  contact: "tip-line",
} as const;
const exhibitId = (e: Exhibit) => `exhibit-${e.id.toLowerCase()}`;
const bare = (url: string) => url.replace(/^https?:\/\//, "");

/**
 * the lite file - the whole case on paper for phones, older computers and browsers that can't run
 * the 3D (mode.ts decides). server rendered html + css, reads and scrolls with no JS, only the tip
 * form hydrates. all the text comes from content/case.ts
 */
export default function LiteFile() {
  const hasPdf = existsSync(join(process.cwd(), "public", subject.resumePdf));
  const resume = hasPdf ? { href: subject.resumePdf, download: "Ayaan-Bagawan-resume.pdf" } : { href: "/resume/" };
  const tel = `tel:${subject.phone.replace(/\s/g, "")}`;
  const [, who, name] = /^(Who is)\s+(.+)$/.exec(caseFile.hero.headline) ?? [null, "", caseFile.hero.headline];
  const board = boardLayout();
  const office = caseFile.fallback.stills.find((s) => s.src.includes("office_establishing"));

  return (
    <div className={styles.lite}>
      <a className="skip-link" href={`#${ID.contents}`}>
        Skip to the file
      </a>

      <header className={styles.hero} id="top">
        <div className={styles.heroImg} role="img" aria-label={office?.alt} />
        <div className={styles.heroCopy}>
          <p className={styles.eyebrow}>{caseFile.hero.eyebrow}</p>
          <h1>
            {who && <span className={styles.who}>{who}</span>}{" "}
            {name}
          </h1>
          <p className={styles.lede}>{caseFile.hero.lede}</p>
          <div className={styles.actions}>
            <a className={`${styles.btn} ${styles.btnPaper}`} href={`#${ID.contents}`}>
              {lite.open}
            </a>
            <a className={`${styles.btn} ${styles.btnGhost}`} {...resume}>
              {caseFile.contact.resume} <small>PDF</small>
            </a>
          </div>
          <p className={styles.why}>
            <span className={styles.whyDefault}>{lite.notes.default}</span>
            <span className={styles.whyPhone}>{lite.notes.phone}</span>
            <span className={styles.whyOld}>{lite.notes.old}</span>
            <span className={styles.whyNone}>{lite.notes.none}</span>
            <span className={styles.whySoftware}>{lite.notes.software}</span>
            <span className={styles.whySlow}>{lite.notes.slow}</span>
            <span className={styles.whyLost}>{lite.notes.lost}</span>{" "}
            {/* full page load, not <Link>, the mode script needs to run again to pick the 3D */}
            {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
            <a className={styles.open3d} href="/?3d">
              {lite.open3d}
            </a>
          </p>
        </div>
      </header>

      <main>
        <nav className={`${styles.wrap} ${styles.contents}`} id={ID.contents} aria-label={lite.contents}>
          <div className={styles.card} data-tab={`Case No. ${caseFile.caseNumber}`}>
            <p className={`${styles.plain} ${styles.cardLabel}`}>{lite.contents}</p>
            <ul>
              {(Object.keys(L) as (keyof typeof L)[]).map((k) => (
                <li key={k}>
                  <a href={`#${ID[k]}`}>
                    {L[k][0]}
                    <i aria-hidden="true" />
                    <em>{L[k][2]}</em>
                  </a>
                </li>
              ))}
            </ul>
            <a className={styles.cardPdf} {...resume}>
              {caseFile.contact.resume}{" "}
              <em>
                PDF <span aria-hidden="true">↓</span>
              </em>
            </a>
          </div>
        </nav>

        <div className={styles.wrap}>
          <section className={styles.sheet} id={ID.profile} aria-labelledby={`${ID.profile}-h`}>
            <SheetHead id={`${ID.profile}-h`} names={L.profile} />
            <div className={styles.profileGrid}>
              <figure className={styles.polaroid}>
                <img
                  src={subject.photo.replace("/photos/", "/photos/lite/").replace(".webp", "-480.webp")}
                  srcSet={liteSrcSet(subject.photo)}
                  sizes="(min-width: 760px) 220px, 180px"
                  {...webpSize(subject.photo)}
                  alt={subject.name}
                  loading="lazy"
                  decoding="async"
                />
                <figcaption>{lite.photoCaption}</figcaption>
              </figure>
              <dl className={styles.fields}>
                <Field label={lite.fields.name}>{subject.name}</Field>
                <Field label={lite.fields.trade}>{subject.trade}</Field>
                <Field label={lite.fields.institution}>{subject.institution}</Field>
                <Field label={lite.fields.location}>{subject.location}</Field>
                <Field label={lite.fields.status}>
                  <span className={styles.stampSm}>{subject.status}</span>
                </Field>
                <Field label={lite.fields.mo}>{caseFile.modusOperandi}</Field>
              </dl>
            </div>
            <p className={`${styles.plain} ${styles.subhead}`}>{lite.knownAddresses}</p>
            <dl className={styles.lines}>
              <Field label={lite.lines.email}>
                <a href={`mailto:${subject.email}`}>{subject.email}</a>
              </Field>
              <Field label={lite.lines.phone}>
                <a href={tel}>{subject.phone}</a>
              </Field>
              <Field label={lite.lines.github}>
                <a href={subject.github} rel="me">
                  {bare(subject.github)}
                </a>
              </Field>
              <Field label={lite.lines.linkedin}>
                <a href={subject.linkedin} rel="me">
                  {bare(subject.linkedin)}
                </a>
              </Field>
              <Field label={lite.lines.resume}>
                <a {...resume}>{caseFile.contact.resume} (PDF)</a>
              </Field>
            </dl>
          </section>

          <section className={styles.sheet} id={ID.experience} aria-labelledby={`${ID.experience}-h`}>
            <SheetHead id={`${ID.experience}-h`} names={L.experience} />
            {caseFile.experience.map((job) => (
              <article key={job.org} className={styles.entry}>
                <div className={styles.entryTop}>
                  <h3>{job.org}</h3>
                  <p className={styles.when}>{job.when}</p>
                </div>
                <p className={styles.role}>{job.role}</p>
                <ul className={styles.dash}>
                  {job.points.map((p) => (
                    <li key={p}>{p}</li>
                  ))}
                </ul>
                <p className={styles.links}>
                  {[job.link, ...job.links].map((l) => (
                    <a key={l.href} href={l.href}>
                      {l.label}
                    </a>
                  ))}
                </p>
              </article>
            ))}
          </section>
        </div>

        <section className={styles.boardSec} id={ID.board} aria-labelledby={`${ID.board}-h`}>
          <div className={styles.wrapWide}>
            <header className={styles.plateHead}>
              <h2 className={styles.plate} id={`${ID.board}-h`}>
                {L.board[0]}
              </h2>
              <span className={`${styles.plain} ${styles.onDark}`}>{L.board[1]}</span>
            </header>
            <div className={styles.board}>
              <div className={styles.boardIn}>
                {(["phone", "desk"] as const).map((l) => (
                  <svg
                    key={l}
                    className={`${styles.strings} ${l === "phone" ? styles.stringsPhone : styles.stringsDesk}`}
                    viewBox={`0 0 100 ${l === "phone" ? 136 : 60}`}
                    preserveAspectRatio="none"
                    aria-hidden="true"
                  >
                    {board.strings[l].map((d) => (
                      <g key={d}>
                        <path className={styles.shade} d={d} vectorEffect="non-scaling-stroke" />
                        <path d={d} vectorEffect="non-scaling-stroke" />
                      </g>
                    ))}
                  </svg>
                ))}
                {board.polaroids.map(({ exhibit: e, style }) => (
                  <a key={e.id} className={styles.pol} href={`#${exhibitId(e)}`} style={style}>
                    <img
                      src={e.photo.replace("/photos/", "/photos/lite/").replace(".webp", "-240.webp")}
                      srcSet={liteSrcSet(e.photo)}
                      sizes="(min-width: 760px) 180px, 28vw"
                      width={240}
                      height={240}
                      alt=""
                      loading="lazy"
                      decoding="async"
                    />
                    <span className={styles.cap}>{e.board ?? e.title}</span>
                    <span className={styles.ex} aria-hidden="true">
                      {e.id}
                    </span>
                    <span className="sr-only">, exhibit {e.id}</span>
                  </a>
                ))}
                {board.pins.map((p) => (
                  <span key={p.id} className={styles.pin} style={p.style} aria-hidden="true" />
                ))}
                {board.ties.map((t) => (
                  <span key={t.label} className={styles.tie} style={t.style} aria-hidden="true">
                    {t.label}
                  </span>
                ))}
                <p className={styles.hint} style={board.hint}>
                  {lite.boardHint}
                </p>
              </div>
            </div>
          </div>
          {caseFile.exhibits.map((e, i, all) => (
            <ExhibitFile key={e.id} exhibit={e} prev={all[i - 1]} next={all[i + 1]} />
          ))}
          <FileKeys board={ID.board} />
        </section>

        <div className={styles.wrap}>

          <section className={styles.sheet} id={ID.log} aria-labelledby={`${ID.log}-h`}>
            <SheetHead id={`${ID.log}-h`} names={L.log} />
            <table className={styles.ledger}>
              <thead>
                <tr>
                  <th className={styles.plain} scope="col">
                    {lite.logItem}
                  </th>
                  <th className={styles.plain} scope="col">
                    {lite.logWhere}
                  </th>
                </tr>
              </thead>
              <tbody>
                {caseFile.tools.map((t) => (
                  <tr key={t.name}>
                    <td>{t.name}</td>
                    <td>{t.note}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className={`${styles.plain} ${styles.subhead}`}>{lite.inventory}</p>
            <dl className={styles.inv}>
              {caseFile.skills.map((g) => (
                <Field key={g.group} label={g.group}>
                  {g.items.join(" · ")}
                </Field>
              ))}
            </dl>
          </section>

          <section className={styles.sheet} id={ID.record} aria-labelledby={`${ID.record}-h`}>
            <SheetHead id={`${ID.record}-h`} names={L.record} />
            <h3 className={styles.plain}>{lite.achievements}</h3>
            <ul className={styles.record}>
              {caseFile.priorRecord.map((r) => (
                <li key={r}>{r}</li>
              ))}
            </ul>
            <h3 className={`${styles.plain} ${styles.subhead}`}>{lite.education}</h3>
            <dl className={styles.edu}>
              {caseFile.education.map((e) => (
                <div key={e.school}>
                  <dt>{e.when}</dt>
                  <dd>
                    {e.school}
                    <span>
                      {e.detail} · {e.place}
                    </span>
                  </dd>
                </div>
              ))}
            </dl>
            <h3 className={`${styles.plain} ${styles.subhead}`}>{lite.certifications}</h3>
            <dl className={styles.edu}>
              {caseFile.certifications.map((c) => (
                <div key={c.title}>
                  <dt>{c.when || c.title}</dt>
                  <dd>
                    {c.when ? c.title : c.detail}
                    {c.when && <span>{[c.by, c.detail].filter(Boolean).join(" · ")}</span>}
                  </dd>
                </div>
              ))}
            </dl>
            <h3 className={`${styles.plain} ${styles.subhead}`}>{lite.associates}</h3>
            <ul className={styles.record}>
              {caseFile.knownAssociates.map((a) => (
                <li key={a}>{a}</li>
              ))}
            </ul>
          </section>

          <section className={styles.sheet} id={ID.interview} aria-labelledby={`${ID.interview}-h`}>
            <SheetHead id={`${ID.interview}-h`} names={L.interview} />
            <p className={styles.tapeHdr}>
              Transcript · Case No. {caseFile.caseNumber}. Interview with the subject, {subject.name}. Tape 1, side A.
            </p>
            {caseFile.transcript.map((l) => (
              <div key={l.q} className={styles.qa}>
                <p className={styles.q}>Q: {l.q}</p>
                <p>A: {l.a}</p>
              </div>
            ))}
            <div className={styles.verdict}>
              <h3 className={styles.plain}>{lite.verdict}</h3>
              <p className={styles.guilty}>{caseFile.verdict.stamp}</p>
              <p className={styles.charge}>{caseFile.verdict.charge}</p>
              <p className={styles.sentence}>
                <span className={styles.plain}>{lite.sentence}</span>
                {caseFile.verdict.sentence}
              </p>
              <a className={`${styles.btn} ${styles.btnInk}`} {...resume}>
                {caseFile.contact.resume} <small>PDF</small>
              </a>
            </div>
          </section>
        </div>

        <section className={styles.tipline} id={ID.contact} aria-labelledby={`${ID.contact}-h`}>
          <div className={`${styles.wrapWide} ${styles.tipGrid}`}>
            <div>
              <header className={styles.plateHead}>
                <h2 className={styles.plate} id={`${ID.contact}-h`}>
                  {L.contact[0]}
                </h2>
                <span className={`${styles.plain} ${styles.onDark}`}>{L.contact[1]}</span>
              </header>
              <p className={styles.tipLede}>{caseFile.contact.footer}</p>
              <dl className={styles.direct}>
                <Field label={lite.lines.call}>
                  <a href={tel}>{subject.phone}</a>
                </Field>
                <Field label={lite.lines.email}>
                  <a href={`mailto:${subject.email}`}>{subject.email}</a>
                </Field>
                <Field label={lite.lines.github}>
                  <a href={subject.github}>{bare(subject.github)}</a>
                </Field>
                <Field label={lite.lines.linkedin}>
                  <a href={subject.linkedin}>{bare(subject.linkedin)}</a>
                </Field>
                <Field label={lite.lines.resume}>
                  <a {...resume}>{caseFile.contact.resume} (PDF)</a>
                </Field>
              </dl>
            </div>
            <TipForm />
          </div>
        </section>
      </main>

      <footer className={styles.footer}>
        <div className={styles.wrapWide}>
          <p>
            Case No. {caseFile.caseNumber} · {subject.name} · {subject.location}
          </p>
          <p>
            {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
            <a className={styles.open3d} href="/?3d">
              {lite.open3d}
            </a>
            <a href="/resume/">{lite.recruiterCopy}</a>
            <a href="#top">{lite.backToTop}</a>
          </p>
        </div>
      </footer>
    </div>
  );
}

function SheetHead({ id, names }: { id: string; names: readonly string[] }) {
  return (
    <header className={styles.sheetHead}>
      <h2 id={id}>{names[0]}</h2>
      <span className={styles.plain}>{names[1]}</span>
    </header>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <dt>{label}</dt>
      <dd>{children}</dd>
    </div>
  );
}

/**
 * one exhibit's file, opened from its polaroid over the board. shows while the url ends in its
 * anchor (css :target) so it works with no JS and the phone back button closes it.
 * FileKeys adds focus, escape, arrow keys and closing back to where you were
 */
function ExhibitFile({ exhibit: e, prev, next }: { exhibit: Exhibit; prev?: Exhibit; next?: Exhibit }) {
  const lite = caseFile.lite;
  const id = exhibitId(e);
  const name = (x: Exhibit) => x.board ?? x.title;
  return (
    <div className={styles.file} id={id} data-file="" role="dialog" aria-modal="true" aria-labelledby={`${id}-h`}>
      <a className={styles.fileBackdrop} href={`#${ID.board}`} data-close="" tabIndex={-1} aria-hidden="true" />
      <div className={styles.fileBar}>
        <a className={styles.fileButton} href={`#${ID.board}`} data-close="">
          <span aria-hidden="true">← </span>
          {lite.backToBoard}
        </a>
        <span>
          {prev && (
            <a className={styles.fileButton} href={`#${exhibitId(prev)}`} data-step="prev" aria-label={`${lite.prev}: exhibit ${prev.id}, ${name(prev)}`}>
              ‹ {prev.id}
            </a>
          )}
          {next && (
            <a className={styles.fileButton} href={`#${exhibitId(next)}`} data-step="next" aria-label={`${lite.next}: exhibit ${next.id}, ${name(next)}`}>
              {next.id} ›
            </a>
          )}
        </span>
      </div>
      {e.kind === "sealed" ? (
        <section className={styles.envelope} data-tape={Array(5).fill(lite.kinds.sealed).join(" · ")}>
          <span className={styles.plain}>Exhibit {e.id}</span>
          <h3 id={`${id}-h`} tabIndex={-1}>
            {e.tag}
          </h3>
          <p>{e.summary}</p>
        </section>
      ) : (
        <ExhibitSheet exhibit={e} />
      )}
      {next && (
        <a className={styles.fileNext} href={`#${exhibitId(next)}`} data-step="">
          {lite.next}: Exhibit {next.id}, {name(next)} <span aria-hidden="true">→</span>
        </a>
      )}
    </div>
  );
}

/** one project's file: evidence tag, what it is, photos, findings, tools and a note */
function ExhibitSheet({ exhibit: e }: { exhibit: Exhibit }) {
  const lite = caseFile.lite;
  const small = (src: string, w: number) => src.replace("/photos/", "/photos/lite/").replace(".webp", `-${w}.webp`);
  return (
    <article className={`${styles.sheet} ${styles.exhibit}`}>
      <div className={styles.exTag} aria-hidden="true">
        <small>Exhibit</small>
        <b>{e.id}</b>
      </div>
      <p className={styles.kind}>
        <span className={styles.kindStamp}>{lite.kinds[e.kind]}</span>
        <span className="sr-only">, exhibit {e.id}</span>
      </p>
      <p className={styles.context}>{e.tag}</p>
      <h3 id={`${exhibitId(e)}-h`} tabIndex={-1}>
        {e.title}
      </h3>
      <p className={styles.summary}>{e.summary}</p>
      <div className={styles.exGrid}>
        <div>
          <a className={styles.photoMain} href={e.photo}>
            <img
              src={small(e.photo, 480)}
              srcSet={liteSrcSet(e.photo)}
              sizes="(min-width: 760px) 290px, calc(100vw - 86px)"
              {...webpSize(e.photo)}
              alt={e.title}
              loading="lazy"
              decoding="async"
            />
          </a>
          {e.gallery && e.gallery.length > 0 && (
            <div className={styles.thumbs}>
              {e.gallery.map((g, i) => (
                <a key={g} href={g}>
                  <img
                    src={small(g, 240)}
                    srcSet={`${small(g, 240)} 240w, ${small(g, 480)} 480w`}
                    sizes="(min-width: 760px) 90px, 28vw"
                    width={240}
                    height={240}
                    alt={`${e.title}, photo ${i + 2}`}
                    loading="lazy"
                    decoding="async"
                  />
                </a>
              ))}
            </div>
          )}
        </div>
        <div className={styles.exText}>
          {e.evidence.length > 0 && (
            <>
              <span className={styles.plain}>{lite.findings}</span>
              <ul className={styles.dash}>
                {e.evidence.map((f) => (
                  <li key={f}>{f}</li>
                ))}
              </ul>
            </>
          )}
          {e.stack.length > 0 && (
            <>
              <span className={styles.plain}>{lite.toolsRecovered}</span>
              <ul className={styles.chips}>
                {e.stack.map((t) => (
                  <li key={t}>{t}</li>
                ))}
              </ul>
            </>
          )}
          {e.links.length > 0 && (
            <p className={styles.links}>
              {e.links.map((l) => (
                <a key={l.href} href={l.href}>
                  {l.label}
                </a>
              ))}
            </p>
          )}
          <p className={styles.note}>{e.backNote}</p>
        </div>
      </div>
    </article>
  );
}
