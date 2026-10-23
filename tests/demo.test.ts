import fs from "node:fs/promises";
import path from "node:path";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { demoRequest, installaDemoFetch } from "../src/demo/api.js";
import { resetDemo, URL_DOCUMENTI, snapshot } from "../src/demo/store.js";

/**
 * La demo statica risponde agli stessi percorsi dell'API e ricalcola gli
 * indicatori dai record: qui verifichiamo letture, filtri, scritture coerenti
 * e i limiti dichiarati (moduli in sola lettura).
 */

const originale = globalThis.fetch;

beforeEach(() => {
  resetDemo();
});

afterAll(() => {
  globalThis.fetch = originale;
});

async function chiama(method: string, percorso: string, body?: unknown) {
  const risposta = await demoRequest(percorso, {
    method,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const testo = await risposta.text();
  return {
    status: risposta.status,
    body: testo ? (JSON.parse(testo) as Record<string, any>) : null,
  };
}

describe("Demo statica: letture", () => {
  it("espone una sessione già autenticata e marcata demo", async () => {
    const { status, body } = await chiama("GET", "/api/auth/session");
    expect(status).toBe(200);
    expect(body?.authenticated).toBe(true);
    expect(body?.demoMode).toBe(true);
    expect(body?.user.email).toBe("demo@effebi.invalid");
  });

  it("calcola gli indicatori dai record", async () => {
    const { body } = await chiama("GET", "/api/dashboard");
    const kpi = (id: string) => body!.kpis.find((k: Record<string, any>) => k.id === id);
    expect(kpi("condomini_attivi").value).toBe(5);
    expect(kpi("segnalazioni_scadute").value).toBeGreaterThan(0);
    expect(kpi("percentuale_incassata").available).toBe(true);
    expect(kpi("percentuale_incassata").value).toBeGreaterThan(0);
    expect(kpi("residuo_scaduto").value).toBeGreaterThan(0);
    expect(body!.datiInsufficienti).toHaveLength(0);
  });

  it("filtra e pagina gli elenchi come l'API", async () => {
    const tutti = await chiama("GET", "/api/condomini?perPage=25&page=1");
    expect(tutti.body?.total).toBe(6);

    const ricerca = await chiama("GET", "/api/condomini?q=verdi");
    expect(ricerca.body?.total).toBe(1);
    expect(ricerca.body?.items[0].denominazione).toContain("Verdi");

    const attivi = await chiama("GET", "/api/condomini?stato=potenziale");
    expect(attivi.body?.items.every((c: Record<string, any>) => c.stato === "potenziale")).toBe(true);

    const pagina2 = await chiama("GET", "/api/condomini?perPage=5&page=2");
    expect(pagina2.body?.items).toHaveLength(1);
  });

  it("restituisce il dettaglio con millesimi che tornano a 1000", async () => {
    const lista = await chiama("GET", "/api/condomini?q=delle%20Rose");
    const id = lista.body!.items[0].id as string;
    const { body } = await chiama("GET", `/api/condomini/${id}`);
    expect(body?.unita.length).toBe(16);
    const totale = body!.unita.reduce((acc: number, u: Record<string, any>) => acc + (u.millesimi ?? 0), 0);
    expect(Math.round(totale * 100) / 100).toBe(1000);
    expect(body?.relazioni.length).toBeGreaterThan(0);
  });

  it("ricerca su tutte le entità", async () => {
    const { body } = await chiama("GET", "/api/ricerca?q=bellandi");
    expect(body?.persone.length).toBeGreaterThan(0);
    expect(body?.persone[0].cognome).toBe("Bellandi");
  });

  it("serve documenti reali per il download", async () => {
    globalThis.fetch = (async (input: RequestInfo | URL) => {
      const url = String(input);
      const file = path.join(process.cwd(), "public", url.replace(/^\//, ""));
      const contenuto = await fs.readFile(file);
      return new Response(contenuto);
    }) as typeof fetch;

    const documenti = await chiama("GET", "/api/documenti?perPage=50");
    expect(documenti.body?.total).toBe(9);
    const documento = documenti.body!.items.find((d: Record<string, any>) => d.nomeFile.endsWith(".pdf"));
    const risposta = await demoRequest(`/api/documenti/${documento.id}/download`);
    expect(risposta.status).toBe(200);
    expect(risposta.headers.get("content-type")).toBe("application/pdf");
    const testo = Buffer.from(await risposta.arrayBuffer()).toString("latin1");
    expect(testo.startsWith("%PDF")).toBe(true);
  });
});

describe("Demo statica: scritture sulle anagrafiche", () => {
  it("crea un condominio con codice progressivo e lo mostra in elenco", async () => {
    const creato = await chiama("POST", "/api/condomini", {
      denominazione: "Condominio Prova Demo 99",
      comune: "Bologna",
      stato: "attivo",
    });
    expect(creato.status).toBe(201);
    expect(creato.body?.codice).toMatch(/^FB-\d{4}$/);

    const elenco = await chiama("GET", "/api/condomini?q=Prova%20Demo%2099");
    expect(elenco.body?.total).toBe(1);
    expect(elenco.body?.items[0].stato).toBe("attivo");
  });

  it("rifiuta un condominio senza denominazione", async () => {
    const risposta = await chiama("POST", "/api/condomini", { denominazione: "" });
    expect(risposta.status).toBe(400);
    expect(risposta.body?.code).toBe("validazione");
  });

  it("blocca i millesimi oltre 1000", async () => {
    const lista = await chiama("GET", "/api/condomini?q=delle%20Rose");
    const id = lista.body!.items[0].id as string;
    const risposta = await chiama("POST", `/api/condomini/${id}/unita`, {
      identificativo: "Soffitta 1",
      millesimi: 50,
    });
    expect(risposta.status).toBe(400);
    expect(risposta.body?.errors?.millesimi).toContain("1000");
  });

  it("aggiunge un'unità e mantiene il totale dei millesimi", async () => {
    const creato = await chiama("POST", "/api/condomini", { denominazione: "Condominio Nuovo Demo" });
    const id = creato.body!.id as string;
    const unita = await chiama("POST", `/api/condomini/${id}/unita`, {
      identificativo: "Int. 1",
      millesimi: 600,
      categoria: "Appartamento",
    });
    expect(unita.status).toBe(201);

    const centrale = await chiama("GET", "/api/condomini?q=delle%20Rose");
    const esistente = centrale.body!.items[0].id as string;
    const rifiutata = await chiama("POST", `/api/condomini/${esistente}/unita`, {
      identificativo: "Soffitta 2",
      millesimi: 10,
    });
    expect(rifiutata.status).toBe(400);
  });

  it("collega una persona a un condominio senza duplicare il ruolo", async () => {
    const condomini = await chiama("GET", "/api/condomini?q=Gelsi");
    const condominioId = condomini.body!.items[0].id as string;
    const nuova = await chiama("POST", "/api/persone", {
      nome: "Luca",
      cognome: "Prova",
      email: "luca.prova@example.invalid",
    });
    expect(nuova.status).toBe(201);

    const legame = await chiama("POST", `/api/condomini/${condominioId}/persone`, {
      personaId: nuova.body!.id,
      ruolo: "condomino",
    });
    expect(legame.status).toBe(201);

    const doppio = await chiama("POST", `/api/condomini/${condominioId}/persone`, {
      personaId: nuova.body!.id,
      ruolo: "condomino",
    });
    expect(doppio.status).toBe(409);

    const dettaglio = await chiama("GET", `/api/condomini/${condominioId}`);
    const relazione = dettaglio.body!.relazioni.find(
      (r: Record<string, any>) => r.persona.id === nuova.body!.id,
    );
    expect(relazione.ruolo).toBe("condomino");

    const elenco = await chiama("GET", "/api/persone?q=prova");
    expect(elenco.body?.total).toBe(1);
  });

  it("crea una segnalazione e ne aggiorna lo stato con storico", async () => {
    const condomini = await chiama("GET", "/api/condomini?q=delle%20Rose");
    const condominioId = condomini.body!.items[0].id as string;
    const prima = await chiama("GET", "/api/dashboard");
    const apertePrima = prima.body!.kpis.find((k: Record<string, any>) => k.id === "segnalazioni_aperte").value;

    const creata = await chiama("POST", "/api/segnalazioni", {
      condominioId,
      titolo: "Prova demo: perdita dal tetto",
      categoria: "guasto",
      priorita: "alta",
    });
    expect(creata.status).toBe(201);
    expect(creata.body?.codice).toMatch(/^SG-\d{4}$/);
    expect(creata.body?.stato).toBe("nuova");

    const dopo = await chiama("GET", "/api/dashboard");
    const aperteDopo = dopo.body!.kpis.find((k: Record<string, any>) => k.id === "segnalazioni_aperte").value;
    expect(aperteDopo).toBe(apertePrima + 1);

    const cambio = await chiama("POST", `/api/segnalazioni/${creata.body!.id}/stato`, {
      stato: "risolta",
      nota: "Intervento completato (demo).",
    });
    expect(cambio.status).toBe(200);
    expect(cambio.body?.stato).toBe("risolta");
    expect(cambio.body?.storico.at(-1).nota).toContain("Intervento");

    const dopoChiusura = await chiama("GET", "/api/dashboard");
    const aperteFinali = dopoChiusura.body!.kpis.find(
      (k: Record<string, any>) => k.id === "segnalazioni_aperte",
    ).value;
    expect(aperteFinali).toBe(apertePrima);
  });

  it("archivia un condominio e aggiorna la dashboard", async () => {
    const lista = await chiama("GET", "/api/condomini?q=Silvani");
    const id = lista.body!.items[0].id as string;
    await chiama("POST", `/api/condomini/${id}/archivia`, { archiviato: true });

    const visibili = await chiama("GET", "/api/condomini");
    expect(visibili.body!.items.some((c: Record<string, any>) => c.id === id)).toBe(false);

    const archiviati = await chiama("GET", "/api/condomini?archiviato=true");
    expect(archiviati.body!.items.some((c: Record<string, any>) => c.id === id)).toBe(true);
  });

  it("conta le attività e le restituisce arricchite", async () => {
    const lista = await chiama("GET", "/api/attivita?completata=false");
    expect(lista.body!.items.length).toBeGreaterThan(0);
    expect(lista.body!.items.every((a: Record<string, any>) => a.completata === false)).toBe(true);

    const condomini = await chiama("GET", "/api/condomini?q=delle%20Rose");
    const nuova = await chiama("POST", "/api/attivita", {
      condominioId: condomini.body!.items[0].id,
      titolo: "Richiamare il fornitore (demo)",
      tipo: "telefonata",
    });
    expect(nuova.status).toBe(201);
    expect(nuova.body?.condominio).toContain("Rose");
  });
});

describe("Demo statica: limiti dichiarati", () => {
  it("segnala la sola lettura dei moduli contabili e di importazione", async () => {
    for (const [metodo, percorso] of [
      ["POST", "/api/consumi"],
      ["POST", "/api/assemblee"],
      ["POST", "/api/rendiconti/periodi"],
      ["POST", "/api/import/condomini/anteprima"],
      ["POST", "/api/documenti"],
    ] as Array<[string, string]>) {
      const risposta = await chiama(metodo, percorso, {});
      expect(risposta.status).toBe(403);
      expect(String(risposta.body?.error)).toMatch(/demo|sola lettura/i);
    }
  });

  it("serve i template XLSX già pronti", async () => {
    const risposta = await demoRequest("/api/import/templates");
    const body = (await risposta.json()) as { items: Array<{ tipo: string }> };
    expect(body.items.map((i) => i.tipo)).toEqual([
      "condomini",
      "persone",
      "unita",
      "segnalazioni",
      "consumi",
    ]);
  });
});

describe("Demo statica: integrità degli asset", () => {
  it("ogni documento della demo ha un file pubblico", async () => {
    for (const [id, meta] of Object.entries(URL_DOCUMENTI)) {
      expect(meta.url.startsWith("/demo-docs/")).toBe(true);
      const file = path.join(process.cwd(), "public", meta.url.replace(/^\//, ""));
      const stat = await fs.stat(file);
      expect(stat.size).toBe(meta.dimensione);
      expect(id.length).toBeGreaterThan(0);
    }
  });

  it("lo snapshot non contiene dati diversi da quelli dimostrativi", () => {
    const testo = JSON.stringify(snapshot);
    expect(testo).toContain("[DEMO]");
    expect(testo).not.toMatch(/@(gmail|libero|virgilio|tiscali)\./i);
  });

  it("installa il finto fetch solo per i percorsi /api", async () => {
    const finto: Array<{ input: unknown }> = [];
    const base = vi.fn(async () => new Response("ok", { status: 200 }));
    vi.stubGlobal("window", {
      ...globalThis,
      fetch: base,
      location: { origin: "http://localhost" },
    } as unknown as Window & typeof globalThis);
    try {
      installaDemoFetch();
      const risposta = await window.fetch("/api/dashboard");
      expect(risposta.status).toBe(200);
      const corpo = (await risposta.json()) as { kpis: unknown[] };
      expect(corpo.kpis).toHaveLength(7);
      expect(base).not.toHaveBeenCalled();
      finto.push({ input: "ok" });
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
