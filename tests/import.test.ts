import { afterEach, beforeEach, describe, expect, it } from "vitest";
import ExcelJS from "exceljs";
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
  limiters.import.reset();
  ctx = await createTestContext();
  const user = await createUser(ctx.db);
  session = await login(ctx.app, { email: user.email, password: user.password });
});

afterEach(async () => {
  await closeTestContext(ctx);
});

async function uploadCsv(csv: string, tipo = "condomini", filename = "test.csv") {
  return session.agent
    .post(`/api/import/${tipo}/anteprima`)
    .set("x-csrf-token", session.csrf)
    .attach("file", Buffer.from(csv, "utf8"), filename);
}

describe("Importazione CSV/XLSX", () => {
  it("mostra un’anteprima con errori per riga e rileva i duplicati senza salvarli", async () => {
    await send(session, "post", "/api/condomini", { denominazione: "Condominio Esistente", comune: "Bologna" });

    const csv = [
      "Denominazione;Comune;Provincia;Stato;Data inizio incarico",
      "Condominio Import Uno;Bologna;BO;attivo;01/01/2025",
      "Condominio Import Due;Modena;MO;potenziale;",
      "Condominio Esistente;Bologna;BO;attivo;",
      "Condominio Rotto;Ferrara;FE;stato_inventato;32/13/2025",
    ].join("\n");

    const preview = await uploadCsv(csv);
    expect(preview.status).toBe(201);
    expect(preview.body.riepilogo.totali).toBe(4);
    expect(preview.body.riepilogo.valide).toBe(2);
    expect(preview.body.riepilogo.errori).toBe(1);
    expect(preview.body.riepilogo.duplicate).toBe(1);

    const rotta = preview.body.righe.find((r: { numeroRiga: number }) => r.numeroRiga === 5);
    expect(rotta.esito).toBe("errore");
    expect(rotta.errori.length).toBeGreaterThanOrEqual(2);

    // nessun dato è stato salvato in anteprima
    const lista = await session.agent.get("/api/condomini?q=import");
    expect(lista.body.total).toBe(0);

    const commit = await send(session, "post", `/api/import/${preview.body.batchId}/conferma`, {
      includiDuplicati: false,
    });
    expect(commit.status).toBe(200);
    expect(commit.body.importate).toBe(2);
    expect(commit.body.ignorate).toBe(1);

    const dopo = await session.agent.get("/api/condomini?q=import");
    expect(dopo.body.total).toBe(2);

    const batch = await session.agent.get(`/api/import/${preview.body.batchId}`);
    expect(batch.body.batch.stato).toBe("completato");
    expect(batch.body.righe.some((r: { esito: string }) => r.esito === "ignorata")).toBe(true);
  });

  it("blocca l’importazione se mancano colonne obbligatorie", async () => {
    const preview = await uploadCsv("Comune;Provincia\nBologna;BO");
    expect(preview.status).toBe(400);
    expect(preview.body.code).toBe("colonne_mancanti");
  });

  it("importa persone collegandole a un condominio esistente", async () => {
    const condominio = await send(session, "post", "/api/condomini", {
      denominazione: "Condominio Persone Import",
      comune: "Bologna",
    });
    const codice = condominio.body.codice as string;

    const csv = [
      "Nome;Cognome;Email;Codice condominio;Ruolo nel condominio",
      `Anna;Import Uno;anna.import@example.invalid;${codice};condomino`,
      `Bruno;Import Due;;${codice};consigliere`,
      "Carla;Senza Condominio;;;",
    ].join("\n");

    const preview = await uploadCsv(csv, "persone");
    expect(preview.status).toBe(201);
    const commit = await send(session, "post", `/api/import/${preview.body.batchId}/conferma`, {});
    expect(commit.body.importate).toBe(3);

    const persone = await session.agent.get("/api/persone?q=Import");
    expect(persone.body.total).toBe(2);
    const senzaCondominio = await session.agent.get("/api/persone?q=Carla");
    expect(senzaCondominio.body.total).toBe(1);
    const dettaglio = await session.agent.get(`/api/condomini/${condominio.body.id}`);
    expect(dettaglio.body.relazioni).toHaveLength(2);
  });

  it("importa un file XLSX generato dal template", async () => {
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet("Dati");
    sheet.addRow(["Identificativo", "Codice condominio", "Millesimi"]);
    const condominio = await send(session, "post", "/api/condomini", { denominazione: "Condominio XLSX" });
    sheet.addRow(["Int. 1", condominio.body.codice, "120,5"]);
    sheet.addRow(["Int. 2", condominio.body.codice, "130"]);
    const buffer = Buffer.from(await workbook.xlsx.writeBuffer());

    const preview = await session.agent
      .post("/api/import/unita/anteprima")
      .set("x-csrf-token", session.csrf)
      .attach("file", buffer, "unita.xlsx");
    expect(preview.status).toBe(201);
    expect(preview.body.riepilogo.valide).toBe(2);

    const commit = await send(session, "post", `/api/import/${preview.body.batchId}/conferma`, {});
    expect(commit.body.importate).toBe(2);

    const dettaglio = await session.agent.get(`/api/condomini/${condominio.body.id}`);
    expect(dettaglio.body.unita).toHaveLength(2);
    expect(dettaglio.body.unita[0].millesimi).toBe(120.5);
  });

  it("annulla un’importazione completata e rimuove solo i record creati", async () => {
    const csv = ["Denominazione;Comune", "Condominio Da Annullare;Bologna", "Condominio Da Tenere;Modena"].join("\n");
    const preview = await uploadCsv(csv);
    const commit = await send(session, "post", `/api/import/${preview.body.batchId}/conferma`, {});
    expect(commit.body.importate).toBe(2);

    const rollback = await send(session, "post", `/api/import/${preview.body.batchId}/annulla`, {});
    expect(rollback.status).toBe(200);
    expect(rollback.body.eliminati).toBe(2);

    const lista = await session.agent.get("/api/condomini?q=Da%20Annullare");
    expect(lista.body.total).toBe(0);
  });

  it("impedisce l’annullamento se i condomini importati hanno dati collegati", async () => {
    const csv = ["Denominazione;Comune", "Condominio Con Unità;Roma"].join("\n");
    const preview = await uploadCsv(csv);
    await send(session, "post", `/api/import/${preview.body.batchId}/conferma`, {});

    const lista = await session.agent.get("/api/condomini?q=Con%20Unit%C3%A0");
    const condominioId = lista.body.items[0].id as string;
    await send(session, "post", `/api/condomini/${condominioId}/unita`, { identificativo: "A1" });

    const rollback = await send(session, "post", `/api/import/${preview.body.batchId}/annulla`, {});
    expect(rollback.status).toBe(409);
    expect(rollback.body.code).toBe("dipendenze_presenti");
  });

  it("scarta un’anteprima senza salvare nulla", async () => {
    const csv = ["Denominazione;Comune", "Condominio Anteprima;Torino"].join("\n");
    const preview = await uploadCsv(csv);
    const scarta = await send(session, "post", `/api/import/${preview.body.batchId}/annulla`, {});
    expect(scarta.status).toBe(200);
    const lista = await session.agent.get("/api/condomini?q=Anteprima");
    expect(lista.body.total).toBe(0);
  });

  it("rifiuta importazioni con sessione non autenticata", async () => {
    const anonimo = await session.agent
      .post("/api/import/condomini/anteprima")
      .attach("file", Buffer.from("Denominazione\nX"), "x.csv");
    expect([401, 403]).toContain(anonimo.status);
  });

  it("espone i template con le colonne documentate", async () => {
    const templates = await session.agent.get("/api/import/templates");
    expect(templates.status).toBe(200);
    const condomini = templates.body.items.find((t: { tipo: string }) => t.tipo === "condomini");
    expect(condomini.columns.some((c: { key: string }) => c.key === "denominazione")).toBe(true);
    const xlsx = await session.agent.get("/api/import/template/condomini");
    expect(xlsx.status).toBe(200);
    expect(xlsx.headers["content-type"]).toContain("spreadsheetml");
  });
});
