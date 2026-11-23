import {
  Caveat,
  IBM_Plex_Mono,
  Noto_Sans_Kannada,
  Playfair_Display,
  Special_Elite,
} from "next/font/google";

// fonts are self hosted through next/font. licences are in CREDITS.md

export const playfair = Playfair_Display({
  subsets: ["latin"],
  weight: ["700", "900"],
  variable: "--font-headline",
  display: "swap",
});

export const specialElite = Special_Elite({
  subsets: ["latin"],
  weight: "400",
  variable: "--font-typewriter",
  display: "swap",
});

export const plexMono = IBM_Plex_Mono({
  subsets: ["latin"],
  weight: ["400", "500"],
  variable: "--font-mono",
  display: "swap",
});

// only the 3D uses these two, no point preloading them everywhere
export const caveat = Caveat({
  subsets: ["latin"],
  variable: "--font-hand",
  display: "swap",
  preload: false,
});

export const notoKannada = Noto_Sans_Kannada({
  subsets: ["kannada"],
  variable: "--font-kannada",
  display: "swap",
  preload: false,
});

export const fontVariables = [playfair, specialElite, plexMono, caveat, notoKannada]
  .map((f) => f.variable)
  .join(" ");
