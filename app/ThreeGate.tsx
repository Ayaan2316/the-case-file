"use client";

import dynamic from "next/dynamic";
import { useSyncExternalStore } from "react";
import { isThree } from "@/lib/mode";

// 3D app is its own chunk so phones on the lite file never download it
const Home = dynamic(() => import("./Home"), { ssr: false });

const subscribe = (change: () => void) => {
  addEventListener("case:lite", change);
  return () => removeEventListener("case:lite", change);
};

/** mounts the 3D when lib/mode.ts picked it, unmounts if we drop to the lite file mid visit (toLite) */
export default function ThreeGate({ resume }: { resume: React.ReactNode }) {
  const three = useSyncExternalStore(subscribe, isThree, () => false);
  return three ? <Home resume={resume} /> : null;
}
