// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { Dashboard } from "../src/client/pages/Dashboard";
import dashboardFixture from "./fixtures/dashboard-demo.json";

/**
 * Rendering della dashboard con il payload reale dell'API sui dati dimostrativi:
 * verifica che gli indicatori derivati arrivino in interfaccia formattati in
 * italiano e che ogni KPI porti al proprio elenco filtrato.
 */
function renderDashboard() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <Dashboard />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("Dashboard con dati dimostrativi", () => {
  beforeEach(() => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string | URL) => {
        const target = String(url);
        if (target.includes("/api/dashboard")) {
          return new Response(JSON.stringify(dashboardFixture), {
            status: 200,
            headers: { "content-type": "application/json" },
          });
        }
        return new Response(JSON.stringify({ error: "Non trovato" }), {
          status: 404,
          headers: { "content-type": "application/json" },
        });
      }),
    );
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it("mostra i KPI calcolati con i valori dei record", async () => {
    renderDashboard();
    expect(await screen.findByText("Panoramica")).toBeTruthy();
    expect(await screen.findByText("Condomini attivi")).toBeTruthy();
    expect(screen.getByText("Segnalazioni aperte")).toBeTruthy();
    expect(screen.getByText("Rate incassate")).toBeTruthy();
    expect(screen.getByText("Residuo scaduto")).toBeTruthy();
    expect(screen.getByText("67,2%")).toBeTruthy();
  });

  it("elenca assemblee e scadenze collegate ai record", async () => {
    renderDashboard();
    expect((await screen.findAllByText("Prossime assemblee")).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Condominio Via delle Rose 12/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/SG-DEMO-/).length).toBeGreaterThan(0);
  });

  it("collega ogni indicatore all'elenco filtrato corrispondente", async () => {
    const { container } = renderDashboard();
    await screen.findByText("Condomini attivi");
    const links = Array.from(container.querySelectorAll("a")).map((a) =>
      a.getAttribute("href"),
    );
    expect(links).toContain("/condomini?stato=attivo");
    expect(links).toContain("/segnalazioni?scadute=true");
    expect(links).toContain("/assemblee?prossime=true");
  });

  it("non mostra dati insufficienti quando la demo è popolata", async () => {
    renderDashboard();
    await screen.findByText("Condomini attivi");
    expect(screen.queryByText(/Dati non ancora sufficienti/i)).toBeNull();
  });
});
