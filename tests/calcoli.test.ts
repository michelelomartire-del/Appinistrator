import { describe, expect, it } from "vitest";
import {
  calcolaRata,
  confrontaConsumi,
  percentuale,
  roundMillesimi,
  sumMillesimi,
} from "../src/server/services/calcoli.js";
import { parseItalianDate, parseNumber, validateRow } from "../src/server/services/import-engine.js";
import {
  IMPORT_TEMPLATES,
  normalizeHeader,
  resolveColumns,
} from "../src/server/services/import-templates.js";
import { base32Encode, currentTotpCounter, totpCode, verifyTotp } from "../src/server/security.js";
import type { ConsumoDto } from "../src/shared/api-types.js";

describe("Calcolo rate", () => {
  const oggi = "2026-06-15";

  it("distingue pagata, parziale, scaduta e aperta", () => {
    expect(calcolaRata(600, 600, "2026-05-01", oggi).stato).toBe("pagata");
    expect(calcolaRata(600, 200, "2026-07-01", oggi).stato).toBe("parziale");
    expect(calcolaRata(600, 0, "2026-05-01", oggi).stato).toBe("scaduta");
    expect(calcolaRata(600, 0, "2026-07-01", oggi).stato).toBe("aperta");
  });

  it("calcola il residuo senza valori negativi", () => {
    expect(calcolaRata(600, 200, "2026-05-01", oggi).residuo).toBe(400);
    expect(calcolaRata(600, 700, "2026-05-01", oggi).residuo).toBe(0);
  });

  it("calcola la percentuale solo con denominatore positivo", () => {
    expect(percentuale(25, 100)).toBe(25);
    expect(percentuale(10, 0)).toBeNull();
    expect(percentuale(0, 0)).toBeNull();
  });
});

describe("Millesimi", () => {
  it("somma senza errori di virgola mobile", () => {
    expect(sumMillesimi([83.3333, 83.3333, 83.3334])).toBe(250);
    expect(roundMillesimi(0.1 + 0.2)).toBe(0.3);
    expect(sumMillesimi([null, 100, "50.5"])).toBe(150.5);
  });
});

function consumo(overrides: Partial<ConsumoDto>): ConsumoDto {
  return {
    id: "c1",
    condominioId: "cond-1",
    condominio: "Demo",
    categoria: "acqua",
    periodoDa: "2024-04-01",
    periodoA: "2024-06-30",
    valore: 130,
    unitaMisura: "m3",
    costo: null,
    fonte: null,
    origine: "inserito",
    dataRilevazione: null,
    note: null,
    createdAt: "2024-07-01T00:00:00.000Z",
    ...overrides,
  };
}

describe("Confronto consumi", () => {
  it("confronta periodi omogenei e consecutivi", () => {
    const corrente = consumo({});
    const precedente = consumo({ id: "c0", periodoDa: "2024-01-01", periodoA: "2024-03-31", valore: 100 });
    const result = confrontaConsumi(corrente, precedente);
    expect(result.stato).toBe("confrontabile");
    expect(result.differenza).toBe(30);
    expect(result.variazionePercentuale).toBe(30);
  });

  it("rifiuta unità di misura diverse", () => {
    const result = confrontaConsumi(consumo({}), consumo({ id: "c0", unitaMisura: "kWh", valore: 10 }));
    expect(result.stato).toBe("non_confrontabile");
    expect(result.motivo).toContain("unità di misura");
  });

  it("rifiuta periodi di durata diversa o non contigui", () => {
    const lunga = confrontaConsumi(
      consumo({}),
      consumo({ id: "c0", periodoDa: "2023-01-01", periodoA: "2023-06-30", valore: 50 }),
    );
    expect(lunga.stato).toBe("non_confrontabile");
    const lontana = confrontaConsumi(
      consumo({}),
      consumo({ id: "c0", periodoDa: "2023-01-01", periodoA: "2023-03-31", valore: 50 }),
    );
    expect(lontana.stato).toBe("non_confrontabile");
  });

  it("non confronta valori stimati", () => {
    const result = confrontaConsumi(
      consumo({}),
      consumo({ id: "c0", periodoDa: "2024-01-01", periodoA: "2024-03-31", origine: "stimato" }),
    );
    expect(result.stato).toBe("non_confrontabile");
    expect(result.motivo).toContain("stimato");
  });

  it("segnala l’assenza di un periodo precedente", () => {
    const result = confrontaConsumi(consumo({}), null);
    expect(result.stato).toBe("non_confrontabile");
    expect(result.motivo).toContain("Nessun dato precedente");
  });
});

describe("Parsing dei dati di importazione", () => {
  it("interpreta date italiane e ISO", () => {
    expect(parseItalianDate("01/02/2025")).toBe("2025-02-01");
    expect(parseItalianDate("2025-02-01")).toBe("2025-02-01");
    expect(parseItalianDate("31/02/2025")).toBeNull();
    expect(parseItalianDate("testo")).toBeNull();
  });

  it("interpreta numeri in formato italiano", () => {
    expect(parseNumber("1.234,56")).toBe(1234.56);
    expect(parseNumber("1234.56")).toBe(1234.56);
    expect(parseNumber("83,333")).toBe(83.333);
    expect(parseNumber("abc")).toBeNull();
  });

  it("riconosce le intestazioni anche con accenti e maiuscole", () => {
    expect(normalizeHeader("Denominazione")).toBe("denominazione");
    expect(normalizeHeader("Codice Fiscale")).toBe("codice_fiscale");
    expect(normalizeHeader("Priorità")).toBe("priorita");
  });

  it("mappa le colonne e segnala quelle mancanti", () => {
    const result = resolveColumns("condomini", ["Denominazione", "Comune", "Colonna Ignota"]);
    expect(result.mancanti).toEqual([]);
    expect(result.ignorate).toContain("Colonna Ignota");
    expect(result.riconosciute).toContain("Denominazione");

    const missing = resolveColumns("condomini", ["Comune"]);
    expect(missing.mancanti).toContain("Denominazione");
  });

  it("valida una riga con errori su enum e date", () => {
    const template = IMPORT_TEMPLATES.condomini;
    const result = validateRow(
      template,
      { denominazione: "X", comune: "Bologna", stato: "inventato", data_inizio_incarico: "32/01/2025" },
      2,
    );
    expect(result.errori.map((e) => e.campo)).toContain("stato");
    expect(result.errori.map((e) => e.campo)).toContain("data_inizio_incarico");
  });
});

describe("TOTP", () => {
  it("genera e verifica un codice, impedendo il riutilizzo", () => {
    const secret = base32Encode(Buffer.from("01234567890123456789"));
    const counter = currentTotpCounter();
    const code = totpCode(secret, counter);
    expect(verifyTotp(secret, code, { now: counter * 30_000 + 1000 })).toEqual({ ok: true, counter });
    const replay = verifyTotp(secret, code, { now: counter * 30_000 + 1000, lastCounter: counter });
    expect(replay).toEqual({ ok: false, reason: "riutilizzato" });
    expect(verifyTotp(secret, "000000", { now: counter * 30_000 + 1000 }).ok).toBe(false);
  });
});
