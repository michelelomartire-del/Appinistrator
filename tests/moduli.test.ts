import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { limiters } from "../src/server/rate-limit.js";
import {
  closeTestContext,
  createTestContext,
  createUser,
  login,
  send,
  type LoggedIn,
  type TestContext,
} from "./helpers.js";

let ctx: TestContext;
let session: LoggedIn;
let condominioId: string;
let unitaId: string;

beforeEach(async () => {
  limiters.login.reset();
  ctx = await createTestContext();
  const user = await createUser(ctx.db);
  session = await login(ctx.app, { email: user.email, password: user.password });
  const condominio = await send(session, "post", "/api/condomini", {
    denominazione: "Condominio Moduli",
    comune: "Bologna",
    stato: "attivo",
  });
  condominioId = condominio.body.id;
  const unita = await send(session, "post", `/api/condomini/${condominioId}/unita`, {
    identificativo: "Int. 1",
    millesimi: 250,
  });
  unitaId = unita.body.unita.id;
});

afterEach(async () => {
  await closeTestContext(ctx);
});

describe("Segnalazioni", () => {
  it("apre una segnalazione, cambia stato e conserva la cronologia", async () => {
    const created = await send(session, "post", "/api/segnalazioni", {
      condominioId,
      titolo: "Perdita dal soffitto",
      descrizione: "Segnalazione sintetica",
      categoria: "guasto",
      priorita: "alta",
      scadenza: "2026-01-10",
      referente: "Sig. Test",
    });
    expect(created.status).toBe(201);
    expect(created.body.codice).toMatch(/^SG-\d{4}$/);

    const cambiato = await send(session, "post", `/api/segnalazioni/${created.body.id}/stato`, {
      stato: "in_corso",
      nota: "Idraulico incaricato",
    });
    expect(cambiato.status).toBe(200);
    expect(cambiato.body.stato).toBe("in_corso");

    const dettaglio = await session.agent.get(`/api/segnalazioni/${created.body.id}`);
    expect(dettaglio.body.storico).toHaveLength(2);
    expect(dettaglio.body.storico[1].nota).toBe("Idraulico incaricato");

    const nuovoStato = await send(session, "post", `/api/segnalazioni/${created.body.id}/stato`, { stato: "chiusa" });
    expect(nuovoStato.body.dataChiusura).toBeTruthy();
  });

  it("rifiuta un cambio di stato verso lo stato corrente", async () => {
    const created = await send(session, "post", "/api/segnalazioni", { condominioId, titolo: "Stato uguale" });
    const response = await send(session, "post", `/api/segnalazioni/${created.body.id}/stato`, { stato: "nuova" });
    expect(response.status).toBe(409);
  });

  it("filtra le segnalazioni scadute", async () => {
    await send(session, "post", "/api/segnalazioni", {
      condominioId,
      titolo: "Scaduta",
      dataApertura: "2025-01-01",
      scadenza: "2025-02-01",
    });
    await send(session, "post", "/api/segnalazioni", {
      condominioId,
      titolo: "Futura",
      scadenza: "2030-01-01",
    });
    const response = await session.agent.get("/api/segnalazioni?scadute=true");
    expect(response.body.total).toBe(1);
    expect(response.body.items[0].titolo).toBe("Scaduta");
  });
});

describe("Rendiconti, rate e pagamenti", () => {
  it("calcola i totali solo da record registrati e blocca i pagamenti oltre il dovuto", async () => {
    const periodo = await send(session, "post", "/api/rendiconti/periodi", {
      condominioId,
      etichetta: "Esercizio test",
      dataInizio: "2025-01-01",
      dataFine: "2025-12-31",
    });
    expect(periodo.status).toBe(201);
    const periodoId = periodo.body.id as string;

    await send(session, "post", `/api/rendiconti/periodi/${periodoId}/spese`, {
      data: "2025-02-01",
      descrizione: "Pulizia scale",
      importo: "1200,50",
      categoria: "Pulizia",
    });
    const rata = await send(session, "post", `/api/rendiconti/periodi/${periodoId}/rate`, {
      unitaId,
      descrizione: "Rata 1",
      scadenza: "2025-03-31",
      importo: "600",
      criteriRipartizione: "Millesimi proprietà",
    });
    expect(rata.status).toBe(201);

    const dettaglio = await session.agent.get(`/api/rendiconti/periodi/${periodoId}`);
    expect(dettaglio.body.totaleSpese).toBe(1200.5);
    expect(dettaglio.body.totaleRate).toBe(600);
    expect(dettaglio.body.incassato).toBe(0);
    expect(dettaglio.body.avvisiCalcolo.length).toBeGreaterThan(0);

    const rataId = dettaglio.body.rate[0].id as string;
    const pagamento = await send(session, "post", `/api/rendiconti/rate/${rataId}/pagamenti`, {
      data: "2025-03-15",
      importo: "300",
      metodo: "bonifico",
    });
    expect(pagamento.status).toBe(201);

    const dopo = await session.agent.get(`/api/rendiconti/periodi/${periodoId}`);
    expect(dopo.body.incassato).toBe(300);
    expect(dopo.body.residuo).toBe(300);
    expect(dopo.body.rate[0].stato).toBe("parziale");

    const eccesso = await send(session, "post", `/api/rendiconti/rate/${rataId}/pagamenti`, {
      data: "2025-03-16",
      importo: "400",
    });
    expect(eccesso.status).toBe(400);
    expect(eccesso.body.errors?.importo).toBeTruthy();

    const chiusura = await send(session, "patch", `/api/rendiconti/periodi/${periodoId}`, { stato: "chiuso" });
    expect(chiusura.status).toBe(200);

    const spesaDopoChiusura = await send(session, "post", `/api/rendiconti/periodi/${periodoId}/spese`, {
      data: "2025-04-01",
      descrizione: "Spesa non ammessa",
      importo: "50",
    });
    expect(spesaDopoChiusura.status).toBe(409);

    const riapertura = await send(session, "patch", `/api/rendiconti/periodi/${periodoId}`, { stato: "bozza" });
    expect(riapertura.status).toBe(200);
  });

  it("evita periodi sovrapposti per lo stesso condominio", async () => {
    await send(session, "post", "/api/rendiconti/periodi", {
      condominioId,
      etichetta: "2025",
      dataInizio: "2025-01-01",
      dataFine: "2025-12-31",
    });
    const overlap = await send(session, "post", "/api/rendiconti/periodi", {
      condominioId,
      etichetta: "Sovrapposto",
      dataInizio: "2025-06-01",
      dataFine: "2026-05-31",
    });
    expect(overlap.status).toBe(409);
  });

  it("espone percentuali di incasso spiegabili nella dashboard", async () => {
    const periodo = await send(session, "post", "/api/rendiconti/periodi", {
      condominioId,
      etichetta: "KPI",
      dataInizio: "2025-01-01",
      dataFine: "2025-12-31",
    });
    const rata = await send(session, "post", `/api/rendiconti/periodi/${periodo.body.id}/rate`, {
      descrizione: "Rata KPI",
      scadenza: "2025-02-28",
      importo: "1000",
    });
    const rataId = rata.body.periodo.rateCount; // sanity: periodo contiene dati
    expect(rataId).toBe(1);

    const dettaglio = await session.agent.get(`/api/rendiconti/periodi/${periodo.body.id}`);
    await send(session, "post", `/api/rendiconti/rate/${dettaglio.body.rate[0].id}/pagamenti`, {
      data: "2025-02-20",
      importo: "250",
    });

    const dashboard = await session.agent.get("/api/dashboard");
    const kpi = (dashboard.body.kpis as Array<{ id: string; value: number | null; available: boolean }>).find(
      (k) => k.id === "percentuale_incassata",
    );
    expect(kpi?.available).toBe(true);
    expect(kpi?.value).toBe(25);
  });
});

describe("Consumi", () => {
  const base = {
    condominioId: "",
    categoria: "acqua",
    unitaMisura: "m3",
    fonte: "Bolletta sintetica",
  };

  it("confronta solo periodi omogenei e consecutivi", async () => {
    const primo = await send(session, "post", "/api/consumi", {
      ...base,
      condominioId,
      periodoDa: "2024-01-01",
      periodoA: "2024-03-31",
      valore: 100,
    });
    expect(primo.status).toBe(201);

    const secondo = await send(session, "post", "/api/consumi", {
      ...base,
      condominioId,
      periodoDa: "2024-04-01",
      periodoA: "2024-06-30",
      valore: 130,
    });
    expect(secondo.status).toBe(201);

    const confronto = await session.agent.get(`/api/consumi/${secondo.body.id}`);
    expect(confronto.body.confronto.stato).toBe("confrontabile");
    expect(confronto.body.confronto.differenza).toBe(30);
    expect(confronto.body.confronto.variazionePercentuale).toBe(30);

    const stimato = await send(session, "post", "/api/consumi", {
      ...base,
      condominioId,
      periodoDa: "2024-07-01",
      periodoA: "2024-09-30",
      valore: 140,
      origine: "stimato",
    });
    const confrontoStimato = await session.agent.get(`/api/consumi/${stimato.body.id}`);
    expect(confrontoStimato.body.confronto.stato).toBe("non_confrontabile");
    expect(confrontoStimato.body.confronto.motivo).toContain("stimato");
  });

  it("rifiuta un consumo duplicato per stesso periodo e categoria", async () => {
    const payload = {
      ...base,
      condominioId,
      periodoDa: "2024-01-01",
      periodoA: "2024-03-31",
      valore: 100,
    };
    await send(session, "post", "/api/consumi", payload);
    const duplicate = await send(session, "post", "/api/consumi", payload);
    expect(duplicate.status).toBe(409);
  });

  it("rifiuta periodi invertiti", async () => {
    const response = await send(session, "post", "/api/consumi", {
      ...base,
      condominioId,
      periodoDa: "2024-06-30",
      periodoA: "2024-01-01",
      valore: 10,
    });
    expect(response.status).toBe(400);
  });
});

describe("Assemblee", () => {
  it("registra ordine del giorno, partecipanti e millesimi presenti", async () => {
    const persona = await send(session, "post", "/api/persone", { nome: "Luca", cognome: "Assemblea" });
    const assemblea = await send(session, "post", "/api/assemblee", {
      condominioId,
      data: "2026-04-15",
      ora: "18:30",
      tipo: "ordinaria",
      modalita: "mista",
      luogo: "Sala condominiale",
      stato: "convocata",
    });
    expect(assemblea.status).toBe(201);
    const assembleaId = assemblea.body.id as string;

    const punto = await send(session, "post", `/api/assemblee/${assembleaId}/punti`, {
      titolo: "Approvazione consuntivo",
      descrizione: "Punto di prova",
    });
    expect(punto.status).toBe(201);

    const partecipante = await send(session, "post", `/api/assemblee/${assembleaId}/partecipanti`, {
      personaId: persona.body.id,
      presente: true,
      millesimi: 250,
    });
    expect(partecipante.status).toBe(201);
    expect(partecipante.body.millesimiPresenti).toBe(250);
    expect(partecipante.body.punti).toHaveLength(1);

    const delibera = await send(session, "patch", `/api/assemblee/${assembleaId}/punti/${punto.body.punti[0].id}`, {
      esito: "approvato",
      delibera: "Delibera sintetica di test",
    });
    expect(delibera.status).toBe(200);
    expect(delibera.body.punti[0].esito).toBe("approvato");
  });

  it("rifiuta partecipanti con unità di un altro condominio", async () => {
    const altro = await send(session, "post", "/api/condomini", { denominazione: "Altro condominio" });
    const altraUnita = await send(session, "post", `/api/condomini/${altro.body.id}/unita`, {
      identificativo: "A1",
    });
    const assemblea = await send(session, "post", "/api/assemblee", {
      condominioId,
      data: "2026-05-01",
    });
    const response = await send(session, "post", `/api/assemblee/${assemblea.body.id}/partecipanti`, {
      nomeEsterno: "Esterno",
      unitaId: altraUnita.body.unita.id,
    });
    expect(response.status).toBe(400);
  });
});
