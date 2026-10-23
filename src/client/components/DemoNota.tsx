import type { ReactNode } from "react";
import { isDemo } from "../../demo";
import { Banner } from "./ui";

/**
 * Avviso mostrato solo nella demo statica sui moduli che non simulano
 * scritture (contabilità, assemblee, consumi, importazione, documenti).
 */
export function DemoNota({ children }: { children: ReactNode }) {
  if (!isDemo) return null;
  return (
    <Banner tone="warning" title="Modulo dimostrativo in sola lettura">
      {children}
    </Banner>
  );
}
