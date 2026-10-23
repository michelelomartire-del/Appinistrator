import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import { installaDemoFetch, isDemo } from "../demo";
import "./styles.css";

// Nella build demo non esiste un server: le chiamate a /api sono servite dai
// dati dimostrativi generati al build (vedi scripts/build-demo-snapshot.ts).
if (isDemo) installaDemoFetch();

// Segnala all'HTML che la demo è pronta (usato per evitare il flash del login).
document.documentElement.dataset.mode = isDemo ? "demo" : "app";

const container = document.getElementById("root");
if (!container) throw new Error("Elemento #root non trovato");

createRoot(container).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
