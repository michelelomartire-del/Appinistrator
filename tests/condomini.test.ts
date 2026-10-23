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

beforeEach(async () => {
  limiters.login.reset();
  ctx = await createTestContext();
  const user = await createUser(ctx.db);
  session = await login(ctx.app, { email: user.email, password: user.password });
});

afterEach(async () => {
  await closeTestContext(ctx);
});

describe("Anagrafica condomini, persone e unità", () => {
  it("crea, modifica, cerca e archivia un condominio", async () => {
    const created = await send(session, "post", "/api/condomini", {
      denominazione: "Condominio Aurora",
      indirizzo: "Via Prova 1",
      cap: "40121",
      comune: "Bologna",
      provincia: "bo",
      stato: "attivo",
      dataInizioIncarico: "2025-01-01",
      note: "Nota sintetica di test",
    });
    expect(created.status).toBe(201);
    expect(created.body.codice).toMatch(/^FB-\d{4}$/);
    const id = created.body.id as string;

    const list = await session.agent.get("/api/condomini?q=aurora");
    expect(list.status).toBe(200);
    expect(list.body.total).toBe(1);
    expect(list.body.items[0].denominazione).toBe("Condominio Aurora");

    const patched = await send(session, "patch", `/api/condomini/${id}`, { stato: "cessato" });
    expect(patched.status).toBe(200);
    expect(patched.body.stato).toBe("cessato");

    const archived = await send(session, "post", `/api/condomini/${id}/archivia`, { archiviato: true });
    expect(archived.status).toBe(200);

    const activeOnly = await session.agent.get("/api/condomini");
    expect(activeOnly.body.total).toBe(0);
    const all = await session.agent.get("/api/condomini?archiviato=tutti");
    expect(all.body.total).toBe(1);
  });

  it("impedisce duplicati di denominazione e comune", async () => {
    const first = await send(session, "post", "/api/condomini", { denominazione: "Condominio Bis", comune: "Modena" });
    expect(first.status).toBe(201);
    const duplicate = await send(session, "post", "/api/condomini", { denominazione: "condominio bis", comune: "MODENA" });
    expect(duplicate.status).toBe(409);
    expect(duplicate.body.error).toContain("Esiste già");
  });

  it("collega persone senza duplicare l’anagrafica", async () => {
    const condominio = await send(session, "post", "/api/condomini", { denominazione: "Condominio Persone" });
    const id = condominio.body.id as string;

    const persona = await send(session, "post", "/api/persone", {
      nome: "Mario",
      cognome: "Prova",
      codiceFiscale: "PRVMRA00A01A944X",
      email: "mario.prova@example.invalid",
    });
    expect(persona.status).toBe(201);

    const link1 = await send(session, "post", `/api/condomini/${id}/persone`, {
      personaId: persona.body.id,
      ruolo: "consigliere",
    });
    expect(link1.status).toBe(201);
    expect(link1.body.condominio.relazioni).toHaveLength(1);

    // lo stesso collegamento non crea un duplicato
    await send(session, "post", `/api/condomini/${id}/persone`, {
      personaId: persona.body.id,
      ruolo: "consigliere",
    });
    const detail = await session.agent.get(`/api/condomini/${id}`);
    expect(detail.body.relazioni).toHaveLength(1);

    // stessa persona con ruolo diverso è una relazione distinta
    const link2 = await send(session, "post", `/api/condomini/${id}/persone`, {
      personaId: persona.body.id,
      ruolo: "referente",
    });
    expect(link2.body.condominio.relazioni).toHaveLength(2);

    const duplicatePersona = await send(session, "post", "/api/persone", {
      nome: "Mario",
      cognome: "Prova",
      codiceFiscale: "PRVMRA00A01A944X",
    });
    expect(duplicatePersona.status).toBe(409);
  });

  it("collega unità, persone e millesimi rispettando il totale di 1000", async () => {
    const condominio = await send(session, "post", "/api/condomini", { denominazione: "Condominio Millesimi" });
    const id = condominio.body.id as string;
    const persona = await send(session, "post", "/api/persone", { nome: "Anna", cognome: "Unità" });

    const unita = await send(session, "post", `/api/condomini/${id}/unita`, {
      identificativo: "Int. 1",
      piano: "1",
      millesimi: 350,
    });
    expect(unita.status).toBe(201);

    const seconda = await send(session, "post", `/api/condomini/${id}/unita`, {
      identificativo: "Int. 2",
      millesimi: 500,
    });
    expect(seconda.status).toBe(201);

    const eccesso = await send(session, "post", `/api/condomini/${id}/unita`, {
      identificativo: "Int. 3",
      millesimi: 200,
    });
    expect(eccesso.status).toBe(400);
    expect(eccesso.body.errors?.millesimi).toBeTruthy();

    const link = await send(session, "post", `/api/condomini/${id}/unita/${unita.body.unita.id}/persone`, {
      personaId: persona.body.id,
      titolo: "proprietario",
    });
    expect(link.status).toBe(201);
    const updated = link.body.unita as { persone: unknown[] };
    expect(updated.persone).toHaveLength(1);

    const detail = await session.agent.get(`/api/condomini/${id}`);
    expect(detail.body.millesimiTotali).toBe(850);
  });

  it("registra le modifiche rilevanti nell’audit log", async () => {
    const created = await send(session, "post", "/api/condomini", { denominazione: "Condominio Audit" });
    await send(session, "patch", `/api/condomini/${created.body.id}`, { note: "modifica tracciata" });

    const audit = await session.agent.get("/api/admin/audit?entitaTipo=condominio");
    expect(audit.status).toBe(200);
    const azioni = (audit.body.items as Array<{ azione: string; descrizione: string }>).map((i) => i.azione);
    expect(azioni).toContain("condominio_creato");
    expect(azioni).toContain("condominio_modificato");
  });

  it("valida i campi e restituisce errori per campo", async () => {
    const response = await send(session, "post", "/api/condomini", { cap: "abc" });
    expect(response.status).toBe(400);
    expect(response.body.errors).toMatchObject({ denominazione: expect.any(String), cap: expect.any(String) });
  });

  it("rifiuta date incoerenti", async () => {
    const response = await send(session, "post", "/api/condomini", {
      denominazione: "Condominio Date",
      dataInizioIncarico: "2025-06-01",
      dataFineIncarico: "2025-01-01",
    });
    expect(response.status).toBe(400);
  });
});
