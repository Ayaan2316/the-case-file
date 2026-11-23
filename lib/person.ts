import { caseFile } from "@/content/case";

/** schema.org Person for search engines, built from content/case.ts */
export function personLd() {
  const { subject } = caseFile;
  return {
    "@context": "https://schema.org",
    "@type": "Person",
    name: subject.name,
    jobTitle: subject.trade,
    email: `mailto:${subject.email}`,
    telephone: subject.phone.replace(/\s/g, ""),
    address: { "@type": "PostalAddress", addressLocality: "Bengaluru", addressCountry: "IN" },
    alumniOf: { "@type": "CollegeOrUniversity", name: "Dayananda Sagar University" },
    sameAs: [subject.github, subject.linkedin],
    knowsAbout: caseFile.tools.map((t) => t.name),
  };
}
