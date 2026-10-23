// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { cleanup, render, waitFor } from "@testing-library/react";
import { App } from "../src/client/App";
import { installaDemoFetch } from "../src/demo/api";
import { resetDemo, snapshot } from "../src/demo/store";

/**
 * Senza server e senza login, ogni schermata della demo deve raggiungere i dati
 * dello snapshot e non mostrare blocchi di errore di rete.
 */
const errori = /Si è verificato un errore|Impossibile caricare|Endpoint demo non disponibile|non è disponibile/;

const prima = <T,>(elenco: T[] | undefined): T[] => elenco ?? [];

const rotte: Array<{ percorso: string; atteso: RegExp }> = [
  { percorso: "/", atteso: /Condomini attivi/ },
  { percorso: "/condomini", atteso: /Condominio Via delle Rose 12/ },
  { percorso: "/persone", atteso: /Persone/ },
  { percorso: "/segnalazioni", atteso: /Segnalazioni/ },
  { percorso: "/assemblee", atteso: /Assemblee/ },
  { percorso: "/rendiconti", atteso: /Rendiconti/ },
  { percorso: "/consumi", atteso: /Consumi/ },
  { percorso: "/import", atteso: /Importazione/ },
  { percorso: "/impostazioni", atteso: /Sicurezza/ },
];

const dettagli = [
  { prefisso: "/condomini", elenco: () => prima(snapshot.liste.condomini), atteso: /Anagrafica/ },
  { prefisso: "/persone", elenco: () => prima(snapshot.liste.persone), atteso: /Relazioni con i condomìni/ },
  { prefisso: "/segnalazioni", elenco: () => prima(snapshot.liste.segnalazioni), atteso: /Scheda condominio/ },
  { prefisso: "/rendiconti/periodi", elenco: () => prima(snapshot.liste.periodi), atteso: /Spese/ },
  { prefisso: "/assemblee", elenco: () => prima(snapshot.liste.assemblee), atteso: /Dati assemblea/ },
];

async function apri(percorso: string) {
  window.history.pushState({}, "", percorso);
  render(<App />);
  await waitFor(() => expect(document.body.textContent).not.toMatch(/Verifica della sessione/), { timeout: 5000 });
  await waitFor(() => expect(document.querySelector(".loading")).toBeNull(), { timeout: 5000 });
  return document.body.textContent ?? "";
}

describe("Demo statica: tutte le schermate", () => {
  beforeEach(() => {
    window.localStorage.clear();
    resetDemo();
    installaDemoFetch();
  });

  afterEach(() => cleanup());

  for (const { percorso, atteso } of rotte) {
    it(`apre ${percorso} senza backend`, async () => {
      const testo = await apri(percorso);
      expect(testo).toMatch(atteso);
      expect(testo).not.toMatch(errori);
    });
  }

  for (const { prefisso, elenco, atteso } of dettagli) {
    it(`apre una scheda di ${prefisso}`, async () => {
      const record = elenco()[0] as { id: string } | undefined;
      expect(record?.id).toBeTruthy();
      const testo = await apri(`${prefisso}/${record!.id}`);
      expect(testo).toMatch(atteso);
      expect(testo).not.toMatch(errori);
    });
  }
});
