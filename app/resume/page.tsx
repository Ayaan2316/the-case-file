import type { Metadata } from "next";
import Link from "next/link";
import CaseReport from "@/components/report/CaseReport";
import { caseFile } from "@/content/case";
import { personLd } from "@/lib/person";
import { OG_IMAGE } from "@/lib/site";
import styles from "./resume.module.css";

const { subject } = caseFile;

export const metadata: Metadata = {
  title: "Résumé",
  description: `${subject.name}: ${subject.trade}. ${subject.institution}. ${subject.status}.`,
  alternates: { canonical: "/resume/" },
  // a child's openGraph replaces the layout's completely, so repeat everything
  openGraph: {
    type: "profile",
    url: "/resume/",
    siteName: "The Case File",
    title: `Résumé · ${subject.name}`,
    description: `${subject.name}: ${subject.trade}. ${subject.status}.`,
    images: [OG_IMAGE],
  },
};

// recruiter version: plain html, no webgl, none of our own client JS
export default function ResumePage() {
  return (
    <div className={styles.desk}>
      <a className="skip-link" href="#main">
        Skip to content
      </a>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(personLd()) }}
      />

      <nav className={styles.topNav} aria-label="Site">
        <Link href="/" className={styles.backLink} prefetch={false}>
          <span aria-hidden="true">←</span>{" "}
          <span className={styles.backText}>Open the case file</span>
        </Link>
      </nav>

      <CaseReport mainId="main" />
    </div>
  );
}
