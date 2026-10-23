// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AuthProvider } from "../src/client/lib/auth";
import { Login } from "../src/client/pages/Login";
import { Badge, EmptyState } from "../src/client/components/ui";

function renderWithProviders(ui: React.ReactNode) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <AuthProvider>{ui}</AuthProvider>
    </QueryClientProvider>,
  );
}

describe("Interfaccia", () => {
  beforeEach(() => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string | URL) => {
        if (String(url).includes("/api/auth/session")) {
          return new Response(JSON.stringify({ authenticated: false, mfaRequired: false, demoMode: true }), {
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

  it("mostra la pagina di accesso senza registrazione pubblica", async () => {
    renderWithProviders(<Login />);
    expect(await screen.findByText("Accesso riservato")).toBeTruthy();
    expect(screen.getByLabelText("Email")).toBeTruthy();
    expect(screen.getByLabelText("Password")).toBeTruthy();
    expect(screen.queryByText(/registrati/i)).toBeNull();
    expect(screen.getByText(/gli account sono creati dall’amministratore/i)).toBeTruthy();
  });

  it("segnala l’ambiente demo nel login", async () => {
    renderWithProviders(<Login />);
    expect(await screen.findByText("Ambiente dimostrativo.")).toBeTruthy();
    expect(screen.getByText(/I dati presenti sono fittizi/i)).toBeTruthy();
  });

  it("mostra stati vuoti espliciti invece di numeri finti", () => {
    render(<EmptyState title="Nessun periodo contabile" description="Registra un periodo per calcolare i totali." />);
    expect(screen.getByText("Nessun periodo contabile")).toBeTruthy();
  });

  it("applica le varianti di badge agli stati", () => {
    const { container } = render(<Badge value="scaduta" label="Scaduta" />);
    expect(container.querySelector(".badge--danger")).toBeTruthy();
  });
});
