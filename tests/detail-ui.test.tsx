// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { ToastProvider } from "../src/client/components/ui";
import { CondominioDetail } from "../src/client/pages/CondominioDetail";
import { PeriodoDetail } from "../src/client/pages/PeriodoDetail";
import condominioFixture from "./fixtures/condominio-detail-demo.json";
import periodoFixture from "./fixtures/periodo-demo.json";

const CONDOMINIO_ID = condominioFixture.id;
const PERIODO_ID = periodoFixture.id;

/**
 * Le pagine di dettaglio vengono renderizzate con i payload reali dell'API sui
 * dati dimostrativi: verifica che totali, millesimi e rate arrivino in
 * interfaccia senza valori inventati.
 */
function renderPagina(percorso: string, route: string, element: React.ReactNode) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <ToastProvider>
        <MemoryRouter initialEntries={[percorso]}>
          <Routes>
            <Route path={route} element={element} />
          </Routes>
        </MemoryRouter>
      </ToastProvider>
    </QueryClientProvider>,
  );
}

function mockApi(percorso: string) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string | URL) => {
      const target = String(url);
      const body = target.includes(percorso)
        ? percorso.includes("rendiconti")
          ? periodoFixture
          : condominioFixture
        : { error: "Non trovato" };
      const status = target.includes(percorso) ? 200 : 404;
      return new Response(JSON.stringify(body), {
        status,
        headers: { "content-type": "application/json" },
      });
    }),
  );
}

describe("Scheda condominio con dati dimostrativi", () => {
  beforeEach(() => mockApi(`/api/condomini/${CONDOMINIO_ID}`));
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it("mostra anagrafica, unità e totale millesimi coerente", async () => {
    renderPagina(
      `/condomini/${CONDOMINIO_ID}`,
      "/condomini/:id",
      <CondominioDetail />,
    );
    expect((await screen.findAllByText("Condominio Via delle Rose 12")).length).toBeGreaterThan(0);
    // 16 unità e somma millesimi esattamente 1000
    expect(screen.getAllByText("16").length).toBeGreaterThan(0);
    // total millesimi esattamente 1000 (formattato in italiano)
    expect(screen.getByText(/1[.,]?000/)).toBeTruthy();
    expect(screen.getAllByText(/DEMO-0001/).length).toBeGreaterThan(0);
  });

  it("non dichiara millesimi incompleti quando il totale è calcolabile", async () => {
    renderPagina(
      `/condomini/${CONDOMINIO_ID}`,
      "/condomini/:id",
      <CondominioDetail />,
    );
    await screen.findAllByText("Condominio Via delle Rose 12");
    expect(screen.queryByText(/Millesimi incompleti/)).toBeNull();
  });
});

describe("Dettaglio periodo contabile con dati dimostrativi", () => {
  beforeEach(() => mockApi(`/api/rendiconti/periodi/${PERIODO_ID}`));
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it("mostra spese, rate e incassi derivati dai record", async () => {
    renderPagina(
      `/rendiconti/periodi/${PERIODO_ID}`,
      "/rendiconti/periodi/:id",
      <PeriodoDetail />,
    );
    expect(await screen.findByText(/Esercizio/)).toBeTruthy();
    expect(screen.getByText("12.030,00 €")).toBeTruthy();
    expect(screen.getAllByText(/Rata/).length).toBeGreaterThan(0);
    // 32 rate su 16 unità: il conteggio è mostrato accanto al totale
    expect(screen.getByText(/32 rate/)).toBeTruthy();
  });
});
