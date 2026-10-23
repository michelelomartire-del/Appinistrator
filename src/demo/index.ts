/**
 * Modalità demo: l'applicazione gira interamente nel browser, senza backend.
 * Attiva solo con `vite --mode demo` (o `VITE_DEMO=1`); non tocca la build normale.
 */
export const isDemo =
  import.meta.env.MODE === "demo" || import.meta.env.VITE_DEMO === "1";

export { installaDemoFetch } from "./api";
export { resetDemo } from "./store";
