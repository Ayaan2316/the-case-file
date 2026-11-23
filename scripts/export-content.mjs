// writes blender/content.json from content/case.ts so the blender scripts use the same exhibits,
// connections and labels as the site
import { writeFileSync } from "node:fs";
import { caseFile } from "../content/case.ts";

writeFileSync("blender/content.json", JSON.stringify(caseFile, null, 2) + "\n");
console.log(
  `blender/content.json: ${caseFile.exhibits.length} exhibits, ${caseFile.connections.length} connections`,
);
