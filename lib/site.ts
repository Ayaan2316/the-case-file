/**
 * site url for absolute links (share previews, sitemap, canonical). set NEXT_PUBLIC_SITE_URL
 * at build time, otherwise falls back to the pages.dev address
 */
export const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL || "https://case-file.pages.dev").replace(/\/$/, "");

/** share image (scripts/brand-images.mjs on top of blender/og_image.py) */
export const OG_IMAGE = {
  url: "/og.png",
  width: 1200,
  height: 630,
  alt: "A detective's desk at night, the case folder caught in a flashlight beam",
};
