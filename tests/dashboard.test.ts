import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { limiters } from "../src/server/rate-limit.js";
import type { DashboardKpi } from "../src/shared/api-types.js";
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

type Kpi = {
  id: string;
  value: number | null;
  available: boolean;
  unavailableReason?: string;
  explanation: string;
};

describe("Dashboard", () => {
  it("senza dati non mostra percentuali inventate ma motiva l’assenza", async () => {
    const response = await session.agent.get("/api/dashboard");
    expect(response.status).toBe(200);
    const kpis = response.body.kpis as DashboardKpi[];

    const incasso = kpis.find((k) => k.id === "percentuale_incassata")!;
    expect(incasso.value).toBeNull();
    expect(incasso.available).toBe(false);
    expect(incasso.unavailableReason).toContain("rate");

    const residuo = kpis.find((k) => k.id === "residuo_scaduto")!;
    expect(residuo.value).toBeNull();
    expect(residuo.available).toBe(false);

    const consumi = kpis.find((k) => k.id === "confronti_consumi")!;
    expect(consumi.available).toBe(false);

    const attivi = kpis.find((k) => k.id === "condomini_attivi")!;
    expect(attivi.value).toBe(0);
    expect(attivi.explanation).toContain("Attivo");

    expect(response.body.datiInsufficienti.length).toBeGreaterThan(0);
    expect(response.body.segnalazioniScadute).toEqual([]);
    expect(response.body.prossimeAssemblee).toEqual([]);
  });

  it("calcola gli indicatori dai record effettivamente presenti", async () => {
    const attivo = await send(session, "post", "/api/condomini", {
      denominazione: "Condominio KPI Attivo",
      stato: "attivo",
    });
    await send(session, "post", "/api/condomini", { denominazione: "Condominio KPI Potenziale", stato: "potenziale" });

    await send(session, "post", "/api/segnalazioni", {
      condominioId: attivo.body.id,
      titolo: "Segnalazione aperta KPI",
    });
    await send(session, "post", "/api/segnalazioni", {
      condominioId: attivo.body.id,
      titolo: "Segnalazione scaduta KPI",
      dataApertura: "2025-01-01",
      scadenza: "2025-01-10",
    });
    await send(session, "post", "/api/assemblee", {
      condominioId: attivo.body.id,
      data: "2030-05-20",
      stato: "convocata",
    });

    const periodo = await send(session, "post", "/api/rendiconti/periodi", {
      condominioId: attivo.body.id,
      etichetta: "2025",
      dataInizio: "2025-01-01",
      dataFine: "2025-12-31",
    });
    const rata = await send(session, "post", `/api/rendiconti/periodi/${periodo.body.id}/rate`, {
      descrizione: "Rata KPI",
      scadenza: "2025-02-01",
      importo: "1000",
    });
    void rata;
    const dettaglio = await session.agent.get(`/api/rendiconti/periodi/${periodo.body.id}`);
    await send(session, "post", `/api/rendiconti/rate/${dettaglio.body.rate[0].id}/pagamenti`, {
      data: "2025-01-20",
      importo: "400",
    });

    const response = await session.agent.get("/api/dashboard");
    const kpis = response.body.kpis as DashboardKpi[];
    const byId = (id: string) => kpis.find((k) => k.id === id)!;

    expect(byId("condomini_attivi").value).toBe(1);
    expect(byId("segnalazioni_aperte").value).toBe(2);
    expect(byId("segnalazioni_scadute").value).toBe(1);
    expect(byId("prossime_assemblee").value).toBe(1);
    expect(byId("percentuale_incassata").value).toBe(40);
    expect(byId("residuo_scaduto").value).toBe(600);
    expect(byId("percentuale_incassata").explanation).toContain("pagamenti");

    // i KPI linkano elenchi filtrati, non pagine statiche
    expect(byId("segnalazioni_scadute").href).toContain("scadute=true");
    expect(response.body.segnalazioniScadute).toHaveLength(1);
    expect(response.body.prossimeAssemblee).toHaveLength(1);
    expect(response.body.scadenzeRate.length).toBeGreaterThanOrEqual(1);
  });

  it("conta i confronti consumi solo se omogenei", async () => {
    const condominio = await send(session, "post", "/api/condomini", { denominazione: "Condominio Consumi KPI" });
    await send(session, "post", "/api/consumi", {
      condominioId: condominio.body.id,
      categoria: "gas",
      periodoDa: "2024-01-01",
      periodoA: "2024-03-31",
      valore: 300,
      unitaMisura: "m3",
    });
    await send(session, "post", "/api/consumi", {
      condominioId: condominio.body.id,
      categoria: "gas",
      periodoDa: "2024-04-01",
      periodoA: "2024-06-30",
      valore: 120,
      unitaMisura: "m3",
    });

    const response = await session.agent.get("/api/dashboard");
    const kpi = (response.body.kpis as Kpi[]).find((k) => k.id === "confronti_consumi")!;
    expect(kpi.available).toBe(true);
    expect(kpi.value).toBe(1);
  });
});
