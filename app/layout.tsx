import type { Metadata, Viewport } from "next";
import { caseFile } from "@/content/case";
import { OG_IMAGE, SITE_URL } from "@/lib/site";
import { fontVariables } from "./fonts";
import "./globals.css";

const title = `${caseFile.subject.name} — The Case File`;

// title, intro line and the share image (rendered from the office)
export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: { default: title, template: `%s · ${caseFile.subject.name}` },
  description: caseFile.hero.lede,
  authors: [{ name: caseFile.subject.name, url: caseFile.subject.linkedin }],
  alternates: { canonical: "/" },
  openGraph: {
    type: "website",
    url: "/",
    siteName: "The Case File",
    title,
    description: caseFile.hero.lede,
    locale: "en_IN",
    images: [OG_IMAGE],
  },
  twitter: { card: "summary_large_image", title, description: caseFile.hero.lede, images: ["/og.png"] },
};

export const viewport: Viewport = {
  themeColor: "#0d0c0a",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    // mode script tags <html> before react hydrates
    <html lang="en" className={fontVariables} suppressHydrationWarning>
      <body>{children}</body>
    </html>
  );
}
