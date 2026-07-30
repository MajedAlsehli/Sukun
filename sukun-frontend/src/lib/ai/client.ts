/**
 * The single import point for every screen: `import { sukunAi } from "@/lib/ai/client"`.
 *
 * ── How to go live ────────────────────────────────────────────────────────
 * Write an object implementing `SaknAi` that calls the real endpoints, then
 * change the one line at the bottom of this file. Nothing else in the app
 * refers to `mockAi`, so no component, prop, or state shape changes.
 *
 *   const liveAi: SaknAi = {
 *     analyzeDefect: async (input) => {
 *       const body = new FormData();
 *       input.images.forEach((f) => body.append("images", f));
 *       if (input.note) body.append("note", input.note);
 *       const res = await fetch(`${API_BASE_URL}/ai/defect-analysis`, { method: "POST", body });
 *       if (!res.ok) throw new ApiError(...);
 *       return res.json() as Promise<DefectAnalysis>;
 *     },
 *     ...
 *   };
 *   export const sukunAi: SaknAi = liveAi;
 *
 * The response bodies are already typed as the wire format in `contract.ts`,
 * so a conforming backend needs no client-side mapping layer at all.
 */

import type { SaknAi } from "./contract";
import { mockAi } from "./mock";
import { liveAi } from "./live";
import { DEMO_MODE } from "@/lib/demo/config";

/**
 * Task 2 made the swap the header above describes — and made it a MODE swap
 * rather than a replacement, because Demo Mode has to keep working:
 *
 *   NEXT_PUBLIC_DEMO_MODE=true   `mockAi`, byte-for-byte as before. `lib/ai/mock.ts`
 *                                and its `DEFECT_LIBRARY` are untouched, no
 *                                Backend call is made, and the Showcase renders
 *                                exactly what it always did.
 *   NEXT_PUBLIC_DEMO_MODE=false  `liveAi` — real private Storage staging, real
 *                                YOLO detection, real OpenAI analysis, real
 *                                server-computed warranty rules. A provider that
 *                                is not configured REJECTS; it never falls back
 *                                to `mockAi`, in either direction.
 *
 * The flag is a build-time constant, so the two are separate bundles rather
 * than a runtime toggle — a production build cannot reach `mockAi` by accident.
 */
export const sukunAi: SaknAi = DEMO_MODE ? mockAi : liveAi;

export * from "./contract";
