import { existsSync } from "node:fs";
import { join } from "node:path";
import { caseFile, type Exhibit } from "@/content/case";
import { exhibitRange, withoutTodos } from "@/lib/content";
import styles from "@/app/resume/resume.module.css";

const { subject } = caseFile;
const projects = caseFile.exhibits.filter((e) => e.kind === "project");
const research = caseFile.exhibits.filter((e) => e.kind === "research");

/**
 * the case report - my resume as one paper sheet, from content/case.ts. /resume shows (and prints)
 * it. the main page has a print-only copy so ctrl+p prints this instead of a 3D canvas, and the
 * resume window shows it from the drawer (`nested` = h2 and no <main>, since it's inside a dialog
 * on a page that already has one). server only, no client JS
 */
export default function CaseReport({ mainId, nested = false }: { mainId?: string; nested?: boolean }) {
  const Name = nested ? "h2" : "h1";
  const Body = nested ? "div" : "main";
  // the window's copy is on the same page as the print one so ids have to be different
  const at = nested ? "resume-window-" : "";
  const hasPdf = existsSync(join(process.cwd(), "public", subject.resumePdf));
  const github = subject.github.replace(/^https?:\/\//, "");
  const linkedin = subject.linkedin.replace(/^https?:\/\//, "");
  return (
    <div className={styles.sheet}>
      <header className={styles.masthead}>
        <p className={styles.fileLabel}>
          Case file No. {caseFile.caseNumber} <span aria-hidden="true">·</span> Recruiter copy
        </p>
        <Name id={nested ? "resume-window-name" : undefined} className={styles.name}>
          {subject.name}
        </Name>
        <p className={styles.trade}>{subject.trade}</p>
        <p className={styles.stamp}>
          <span className="sr-only">Status: </span>
          {subject.status}
        </p>

        <ul className={styles.contact} aria-label="Contact">
          <li>
            <a href={`mailto:${subject.email}`}>{subject.email}</a>
          </li>
          <li>
            <a href={`tel:${subject.phone.replace(/\s/g, "")}`}>{subject.phone}</a>
          </li>
          <li>
            <a href={subject.github} rel="me">
              {github}
            </a>
          </li>
          <li>
            <a href={subject.linkedin} rel="me">
              {linkedin}
            </a>
          </li>
          <li>{subject.location}</li>
          {hasPdf && (
            <li>
              <a href={subject.resumePdf} download className={styles.pdf}>
                Download PDF
              </a>
            </li>
          )}
        </ul>
      </header>

      <Body id={mainId} className={styles.body}>
        <Section id={`${at}profile`} eyebrow="Subject profile" title="Education">
          <dl className={styles.fields}>
            {caseFile.education.map((e) => (
              <div key={e.school}>
                <dt>{e.when}</dt>
                <dd>
                  <strong>{e.school}</strong>, {e.place}
                  <br />
                  {e.detail}
                </dd>
              </div>
            ))}
          </dl>
        </Section>

        <Section id={`${at}experience`} eyebrow="Cover story" title="Experience">
          <ol className={styles.exhibits}>
            {caseFile.experience.map((job) => (
              <li key={job.org}>
                <article className={styles.exhibit} aria-labelledby={`${at}job-${job.org.toLowerCase()}`}>
                  <p className={styles.exhibitId} aria-hidden="true">
                    {job.when}
                  </p>
                  <h3 id={`${at}job-${job.org.toLowerCase()}`} className={styles.exhibitTitle}>
                    {job.org}
                  </h3>
                  <p className={styles.exhibitTag}>
                    {job.role} <span className="sr-only">({job.when})</span>
                  </p>
                  <ul className={styles.bullets}>
                    {job.points.map((point) => (
                      <li key={point}>{point}</li>
                    ))}
                  </ul>
                  <p className={styles.links}>
                    {[job.link, ...job.links].map((link) => (
                      <a key={link.href} href={link.href}>
                        {link.label}
                      </a>
                    ))}
                  </p>
                </article>
              </li>
            ))}
          </ol>
        </Section>

        <Section id={`${at}projects`} eyebrow={`Exhibits ${exhibitRange(projects)}`} title="Projects">
          <ol className={styles.exhibits}>
            {projects.map((exhibit) => (
              <li key={exhibit.id}>
                <ExhibitEntry exhibit={exhibit} at={at} />
              </li>
            ))}
          </ol>
        </Section>

        <Section id={`${at}research`} eyebrow={`Exhibits ${exhibitRange(research)}`} title="Research">
          <ol className={styles.exhibits}>
            {research.map((exhibit) => (
              <li key={exhibit.id}>
                <ExhibitEntry exhibit={exhibit} at={at} />
              </li>
            ))}
          </ol>
        </Section>

        <Section id={`${at}record`} eyebrow="Prior record" title="Achievements">
          <ul className={styles.bullets}>
            {caseFile.priorRecord.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </Section>

        <Section id={`${at}skills`} eyebrow="Tools found at the scene" title="Skills">
          <ul className={styles.tools}>
            {caseFile.skills.map((skill) => (
              <li key={skill.group}>
                <span className={styles.toolName}>{skill.group}</span>
                <span className={styles.toolNote}>{skill.items.join(", ")}</span>
              </li>
            ))}
          </ul>
        </Section>

        <Section id={`${at}certifications`} eyebrow="Papers on file" title="Certifications & workshops">
          <dl className={styles.fields}>
            {caseFile.certifications.map((c) => (
              <div key={c.title}>
                <dt>{c.when || "Workshops"}</dt>
                <dd>
                  {c.when ? <strong>{c.title}</strong> : null}
                  {c.by ? `, ${c.by}` : null}
                  {c.when ? <br /> : null}
                  {c.detail}
                </dd>
              </div>
            ))}
          </dl>
        </Section>

        <Section id={`${at}associates`} eyebrow="Known associates" title="Leadership & activities">
          <ul className={styles.bullets}>
            {caseFile.knownAssociates.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </Section>
      </Body>

      <footer className={styles.footer}>
        <p>{caseFile.contact.footer}</p>
        <p>
          <a href={`mailto:${subject.email}`}>Email</a> <span aria-hidden="true">·</span>{" "}
          <a href={subject.github}>GitHub</a> <span aria-hidden="true">·</span>{" "}
          <a href={subject.linkedin}>LinkedIn</a>
        </p>
      </footer>
    </div>
  );
}

function Section({
  id,
  eyebrow,
  title,
  children,
}: {
  id: string;
  eyebrow: string;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className={styles.section} aria-labelledby={`${id}-title`}>
      <p className={styles.eyebrow} aria-hidden="true">
        {eyebrow}
      </p>
      <h2 id={`${id}-title`} className={styles.sectionTitle}>
        {title}
      </h2>
      {children}
    </section>
  );
}

function ExhibitEntry({ exhibit, at }: { exhibit: Exhibit; at: string }) {
  const evidence = withoutTodos(exhibit.evidence);
  const stack = withoutTodos(exhibit.stack);
  return (
    <article className={styles.exhibit} aria-labelledby={`${at}exhibit-${exhibit.slug}`}>
      <p className={styles.exhibitId} aria-hidden="true">
        Exhibit {exhibit.id}
      </p>
      <h3 id={`${at}exhibit-${exhibit.slug}`} className={styles.exhibitTitle}>
        {exhibit.title}
      </h3>
      {/* no need to say "Research" again under the Research heading */}
      <p className={styles.exhibitTag}>{exhibit.kind === "research" ? exhibit.tag.replace(/^Research · /, "") : exhibit.tag}</p>
      <p className={styles.exhibitSummary}>{exhibit.summary}</p>
      {evidence.length > 0 && (
        <ul className={styles.bullets}>
          {evidence.map((fact) => (
            <li key={fact}>{fact}</li>
          ))}
        </ul>
      )}
      {stack.length > 0 && (
        <p className={styles.stack}>
          <span className="sr-only">Stack: </span>
          {stack.map((s) => (
            <span key={s} className={styles.chip}>
              {s}
            </span>
          ))}
        </p>
      )}
      {exhibit.links.length > 0 && (
        <p className={styles.links}>
          {exhibit.links.map((link) => (
            <a key={link.href} href={link.href}>
              {link.label}
            </a>
          ))}
        </p>
      )}
    </article>
  );
}
