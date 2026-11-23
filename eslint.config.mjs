import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";
import prettier from "eslint-config-prettier/flat";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  prettier,
  {
    // three scene graphs are meant to be mutated - R3F components change objects inside useFrame,
    // outside react's render, which the compiler's immutability rule can't understand
    files: ["components/canvas/**/*.{ts,tsx}"],
    rules: { "react-hooks/immutability": "off" },
  },
  globalIgnores([
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    "assets-src/**",
    "public/**",
    "screenshots/**",
    "blender/**",
    "test-results/**",
    "playwright-report/**",
    "**/.wrangler/**",
  ]),
]);

export default eslintConfig;
