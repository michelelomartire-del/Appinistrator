// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { App } from "../src/client/App";
import { installaDemoFetch } from "../src/demo/api";
import { resetDemo } from "../src/demo/store";

/**
 * La demo si apre senza login e mostra i dati dimostrativi: nessuna schermata
 * di accesso, banner di avviso, indicatori calcolati.
 */
describe("Demo statica: interfaccia", () => {
  beforeEach(() => {
    window.localStorage.clear();
    resetDemo();
    installaDemoFetch();
    window.history.pushState({}, "", "/");
  });

  afterEach(() => {
    cleanup();
    window.localStorage.clear();
  });

  it("entra direttamente nella dashboard senza chiedere credenziali", async () => {
    render(<App />);
    expect(await screen.findByText("Panoramica")).toBeTruthy();
    expect(screen.queryByLabelText("Password")).toBeNull();
    expect(screen.queryByText("Accesso riservato")).toBeNull();
  });

  it("mostra il banner con l'avviso sui dati inventati", async () => {
    render(<App />);
    expect(await screen.findByText(/Dati inventati e marcati \[DEMO\]/i)).toBeTruthy();
    expect(screen.getByRole("button", { name: /Ripristina dati demo/i })).toBeTruthy();
  });

  it("mostra gli indicatori derivati e le sezioni collegate", async () => {
    render(<App />);
    expect(await screen.findByText("Condomini attivi")).toBeTruthy();
    expect(screen.getByText("Rate incassate")).toBeTruthy();
    expect(screen.getByText("Residuo scaduto")).toBeTruthy();

    const link = screen.getByRole("link", { name: /Condomini attivi/i });
    expect(link.getAttribute("href")).toBe("/condomini?stato=attivo");
  });

  it("salva le modifiche nel browser così sopravvivono al ricaricamento", async () => {
    const risposta = await window.fetch("/api/condomini", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ denominazione: "Condominio Persistente Demo" }),
    });
    expect(risposta.status).toBe(201);

    const salvato = window.localStorage.getItem("effebi-crm-demo-v1");
    expect(salvato).toContain("Condominio Persistente Demo");
  });

  it("permette di aprire l'elenco dei condomìni e la scheda di dettaglio", async () => {
    render(<App />);
    const elenco = await screen.findByRole("link", { name: /Condomìni/i });
    elenco.click();
    expect(await screen.findByText("Condominio Via delle Rose 12")).toBeTruthy();
    expect(screen.getByText("DEMO-0001")).toBeTruthy();
  });
});
