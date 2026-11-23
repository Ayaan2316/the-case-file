import type { Metadata } from "next";
import Link from "next/link";
import { caseFile } from "@/content/case";
import styles from "./not-found.module.css";

export const metadata: Metadata = { title: caseFile.notFound.title };

/** 404: the file that isn't there + links to the two that are */
export default function NotFound() {
  const c = caseFile.notFound;
  return (
    <main className={styles.desk}>
      <div className={styles.sheet}>
        <p className={styles.eyebrow}>{c.eyebrow}</p>
        <h1 className={styles.title}>{c.title}</h1>
        <p className={styles.stamp} aria-hidden="true">
          MISFILED
        </p>
        <p className={styles.body}>{c.body}</p>
        <ul className={styles.links}>
          <li>
            <Link href="/" prefetch={false}>
              Open the case file
            </Link>
          </li>
          <li>
            <Link href="/resume/" prefetch={false}>
              Read the case report
            </Link>
          </li>
        </ul>
        <p className={styles.case}>CASE No. {caseFile.caseNumber}</p>
      </div>
    </main>
  );
}
