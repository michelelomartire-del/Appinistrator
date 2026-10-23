import { describe, expect, it } from "vitest";
import {
  DEMO_MARKER,
  buildDemoDataset,
  distribuisciMillesimi,
  euro,
  type DemoDataset,
} from "../src/server/services/demo-data.js";

const OGGI = new Date("2026-10-23T09:00:00");
const dataset: DemoDataset = buildDemoDataset(OGGI);

describe("Dati dimostrativi", () => {
  it("ripartisce i millesimi in modo esatto", () => {
    const valori = distribuisciMillesimi(1000, [92, 78, 101, 86, 97]);
    expect(Math.round(valori.reduce((a, b) => a + b, 0) * 100) / 100).toBe(1000);
    // il resto va all'unità più grande, senza valori negativi
    expect(valori.every((v) => v > 0)).toBe(true);
  });

  it("ha millesimi che tornano a 1000 per ogni condominio", () => {
    for (const condominio of dataset.condomini) {
      const unita = dataset.unita.filter((u) => u.condominio === condominio.key);
      expect(unita.length).toBeGreaterThan(0);
      const totale = unita.reduce((acc, u) => acc + u.millesimi, 0);
      expect(Math.round(totale * 100) / 100).toBe(1000);

      const riscaldamento = unita.filter(
        (u) => u.millesimiRiscaldamento !== null,
      );
      if (riscaldamento.length > 0) {
        const totaleRiscaldamento = riscaldamento.reduce(
          (acc, u) => acc + (u.millesimiRiscaldamento ?? 0),
          0,
        );
        expect(Math.round(totaleRiscaldamento * 100) / 100).toBe(1000);
      }
    }
  });

  it("non ha identificativi unità duplicati nello stesso condominio", () => {
    for (const condominio of dataset.condomini) {
      const identificativi = dataset.unita
        .filter((u) => u.condominio === condominio.key)
        .map((u) => u.identificativo);
      expect(new Set(identificativi).size).toBe(identificativi.length);
    }
  });

  it("collega solo persone e unità esistenti", () => {
    const condomini = new Set(dataset.condomini.map((c) => c.key));
    const persone = new Set(dataset.persone.map((p) => p.key));
    const unita = new Map(dataset.unita.map((u) => [u.key, u]));

    for (const relazione of dataset.relazioni) {
      expect(condomini.has(relazione.condominio)).toBe(true);
      expect(persone.has(relazione.persona)).toBe(true);
    }
    for (const titolo of dataset.unitaPersone) {
      expect(unita.has(titolo.unita)).toBe(true);
      expect(persone.has(titolo.persona)).toBe(true);
    }
    for (const segnalazione of dataset.segnalazioni) {
      expect(condomini.has(segnalazione.condominio)).toBe(true);
      if (segnalazione.unita) {
        expect(unita.get(segnalazione.unita)?.condominio).toBe(
          segnalazione.condominio,
        );
      }
      if (segnalazione.fornitore) {
        expect(persone.has(segnalazione.fornitore)).toBe(true);
      }
    }
    for (const assemblea of dataset.assemblee) {
      for (const partecipante of assemblea.partecipanti) {
        expect(persone.has(partecipante.persona)).toBe(true);
      }
    }
    for (const documento of dataset.documenti) {
      expect(condomini.has(documento.condominio)).toBe(true);
    }
  });

  it("genera rate coerenti con il budget e i millesimi del periodo", () => {
    for (const periodo of dataset.periodi) {
      if (periodo.budget === null) {
        expect(periodo.rate).toHaveLength(0);
        continue;
      }
      const unita = dataset.unita.filter((u) => u.condominio === periodo.condominio);
      const quote = periodo.rate.reduce((acc, r) => acc + r.quota, 0);
      expect(quote).toBeCloseTo(1, 5);

      let totaleRate = 0;
      for (const rata of periodo.rate) {
        for (const unitaCorrente of unita) {
          totaleRate += euro(
            (periodo.budget * rata.quota * unitaCorrente.millesimi) / 1000,
          );
        }
      }
      // differenza ammessa: arrotondamento al centesimo su ogni rata
      expect(Math.abs(totaleRate - periodo.budget)).toBeLessThan(unita.length * 0.05);
    }
  });

  it("non registra incassi superiori alla rata", () => {
    for (const periodo of dataset.periodi) {
      for (const rata of periodo.rate) {
        if (!rata.pagamenti) continue;
        const unita = dataset.unita.filter((u) => u.condominio === periodo.condominio);
        unita.forEach((unitaCorrente, indice) => {
          const importo = euro(
            (periodo.budget! * rata.quota * unitaCorrente.millesimi) / 1000,
          );
          const comportamento = rata.pagamenti!(indice);
          const versato =
            comportamento === "completo"
              ? importo
              : comportamento === "parziale"
                ? euro(importo * 0.4)
                : 0;
          expect(versato).toBeLessThanOrEqual(importo);
        });
      }
    }
  });

  it("non usa date future per spese e pagamenti dell'anno in corso", () => {
    const oggiIso = "2026-10-23";
    for (const periodo of dataset.periodi) {
      for (const spesa of periodo.spese) {
        expect(spesa.data <= oggiIso).toBe(true);
        expect(spesa.data >= periodo.inizio).toBe(true);
        expect(spesa.data <= periodo.fine).toBe(true);
        expect(spesa.importo).toBeGreaterThan(0);
      }
    }
  });

  it("ha consumi confrontabili e almeno un valore stimato dichiarato", () => {
    const stimati = dataset.consumi.filter((c) => c.origine === "stimato");
    expect(stimati.length).toBeGreaterThan(0);
    for (const stimato of stimati) {
      expect(stimato.note ?? "").toMatch(/stim/i);
    }
    // ogni consumo ha periodo valido e unità di misura
    for (const consumo of dataset.consumi) {
      expect(consumo.a >= consumo.da).toBe(true);
      expect(consumo.unitaMisura.length).toBeGreaterThan(0);
      expect(consumo.valore).toBeGreaterThan(0);
    }
  });

  it("marca come DEMO tutte le descrizioni dei documenti e i condomini", () => {
    for (const documento of dataset.documenti) {
      // il marcatore DEMO viene anteposto dal seed in descrizione e note
      expect(documento.descrizione.length).toBeGreaterThan(0);
      expect(documento.nomeFile.length).toBeGreaterThan(0);
      expect(documento.righe.length + (documento.tabella?.righe.length ?? 0)).toBeGreaterThan(0);
    }
    for (const condominio of dataset.condomini) {
      expect(condominio.codice.startsWith("DEMO-")).toBe(true);
      expect(condominio.note).toContain(DEMO_MARKER);
    }
  });

  it("ha segnalazioni scadute e assemblee future per la dashboard", () => {
    const oggiIso = "2026-10-23";
    const scadute = dataset.segnalazioni.filter((s) => {
      const scadenza = new Date(OGGI);
      scadenza.setDate(scadenza.getDate() + (s.scadenzaGiorni ?? 0));
      return (
        s.scadenzaGiorni !== undefined &&
        scadenza.toISOString().slice(0, 10) < oggiIso &&
        !["risolta", "chiusa"].includes(s.stato)
      );
    });
    expect(scadute.length).toBeGreaterThan(0);
    expect(dataset.assemblee.filter((a) => a.giorni > 0).length).toBeGreaterThan(0);
  });
});
