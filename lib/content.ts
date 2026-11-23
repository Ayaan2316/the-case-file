import { caseFile } from "@/content/case";

/** `[TODO…]` = stuff I haven't filled in yet, never shown to visitors */
export const isTodo = (value: string) => value.trim().startsWith("[TODO");

export const withoutTodos = (values: readonly string[]) => values.filter((v) => !isTodo(v));

/** "A–G" for the exhibits, however many there are */
export function exhibitRange(exhibits: readonly { id: string }[] = caseFile.exhibits) {
  const ids = exhibits.map((e) => e.id);
  return ids.length > 1 ? `${ids[0]}–${ids[ids.length - 1]}` : (ids[0] ?? "");
}

// transcript the way the paper types it: "Q: " / "A: ", each word with its space
const exchangeLengths = caseFile.transcript.map((l) => l.q.length + l.a.length + 8);
const transcriptLength = exchangeLengths.reduce((a, b) => a + b, 0);

/** which Q/A is being typed once `t` of the transcript is on the paper */
export function exchangeAt(t: number) {
  let acc = 0;
  for (let i = 0; i < exchangeLengths.length; i++) {
    acc += exchangeLengths[i] / transcriptLength;
    if (t < acc) return i;
  }
  return exchangeLengths.length - 1;
}
