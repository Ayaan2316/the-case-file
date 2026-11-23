import { preload } from "react-dom";
import LiteFile from "@/components/lite/LiteFile";
import CaseReport from "@/components/report/CaseReport";
import { caseFile } from "@/content/case";
import { MODE_SCRIPT } from "@/lib/mode";
import { personLd } from "@/lib/person";
import ThreeGate from "./ThreeGate";

/** lite file hero photo (.heroImg in lite.module.css) */
const LITE_HERO = "/images/stills/office_establishing.webp";

// two versions: 3D for laptops that can handle it, lite file for phones and everything else.
// the mode script runs first, before any of this paints
export default function Page() {
  const { subject } = caseFile;
  // hero photo is a css background so a hidden lite file never loads it. without this preload
  // phones only find it after the stylesheet arrives. the 3D fetches it too but it's 110kb vs 18mb
  preload(LITE_HERO, { as: "image", fetchPriority: "high" });
  return (
    <>
      <script dangerouslySetInnerHTML={{ __html: MODE_SCRIPT }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(personLd()) }} />
      {/* lite file - what you get without JS, on phones and on older computers */}
      <div className="screen-only lite-only">
        <LiteFile />
      </div>
      <div className="screen-only three-only">
        <a className="skip-link" href="/resume/">
          Skip to résumé
        </a>
        {/* same report again for the resume drawer at the end */}
        <ThreeGate resume={<CaseReport nested />} />
        <div className="sr-only">
          <p>
            {subject.name}: {subject.trade}. {subject.institution}. {subject.location}. {subject.status}.
          </p>
          <p>
            Occupation: {caseFile.experience[0].role}, {caseFile.experience[0].org}.
          </p>
          {/* dossier pages are textures in 3D, so the text is here too */}
          <h2>Known associates</h2>
          <ul>
            {caseFile.knownAssociates.map((a) => (
              <li key={a}>{a}</li>
            ))}
          </ul>
          <h2>Prior record</h2>
          <ul>
            {caseFile.priorRecord.map((r) => (
              <li key={r}>{r}</li>
            ))}
          </ul>
          <h2>Modus operandi</h2>
          <p>{caseFile.modusOperandi}</p>
          <h2>Exhibits</h2>
          <ul>
            {caseFile.exhibits.map((e) => (
              <li key={e.id}>
                Exhibit {e.id}, {e.title}: {e.summary}
              </li>
            ))}
          </ul>
          <h2>Tools found at the scene</h2>
          <ul>
            {caseFile.tools.map((t) => (
              <li key={t.name}>
                {t.name}: {t.note}
              </li>
            ))}
          </ul>
          {/* interrogation transcript (typed onto paper in the scene) */}
          <h2>Interrogation transcript</h2>
          <dl>
            {caseFile.transcript.map((l) => (
              <div key={l.q}>
                <dt>Q: {l.q}</dt>
                <dd>A: {l.a}</dd>
              </div>
            ))}
          </dl>
          <h2>Verdict</h2>
          <p>
            {caseFile.verdict.stamp}, {caseFile.verdict.charge} Sentence: {caseFile.verdict.sentence}
          </p>
          {/*
           * plain text on purpose, real links here would grab keyboard focus on something you can't see.
           * the notepad and the case report have the actual links
           */}
          <h2>Contact</h2>
          <p>
            Email {subject.email}. Phone {subject.phone}. GitHub {subject.github.replace(/^https?:\/\//, "")}. LinkedIn{" "}
            {subject.linkedin.replace(/^https?:\/\//, "")}. {caseFile.contact.footer}
          </p>
        </div>
      </div>
      {/* ctrl+p prints the case report in both modes */}
      <div className="print-only">
        <CaseReport />
      </div>
    </>
  );
}
