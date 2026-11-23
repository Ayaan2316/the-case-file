import { caseFile } from "@/content/case";
import { useStore } from "./store";

// contact actions, shared by the 3D props and the DOM so they don't import each other

/** pick up the phone - stops ringing, opens the notepad with the tip form */
export const answerPhone = () => useStore.getState().set({ phoneAnswered: true, notepadOpen: true, drawerOpen: false, reading: true });

export const closeNotepad = () => useStore.getState().set({ notepadOpen: false, reading: false });

/**
 * open the RÉSUMÉ drawer: camera turns to it and the pdf downloads. if there's no scene
 * (no webgl or still loading) just download it
 */
export function openDrawer() {
  if (!useStore.getState().ready) return downloadResume(caseFile.subject.resumePdf);
  useStore.getState().set({ drawerOpen: true, notepadOpen: false, reading: true });
}

export const closeDrawer = () => useStore.getState().set({ drawerOpen: false, reading: false });

/** resume window - the case report, out of the drawer */
export const openResume = () => useStore.getState().set({ resumeOpen: true, notepadOpen: false, reading: true });

/** back to the drawer (still out if the notepad opened it) */
export const closeResume = () => useStore.getState().set({ resumeOpen: false, reading: useStore.getState().drawerOpen });

/** start the pdf download. the drawer calls this once it's out, the DOM link is the fallback */
export function downloadResume(href: string) {
  const a = document.createElement("a");
  a.href = href;
  a.download = "Ayaan-Bagawan-resume.pdf";
  document.body.appendChild(a);
  a.click();
  a.remove();
}
