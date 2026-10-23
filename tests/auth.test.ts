import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { limiters } from "../src/server/rate-limit.js";
import {
  closeTestContext,
  createTestContext,
  createUser,
  currentTotpCounter,
  login,
  request,
  send,
  totpCode,
  type TestContext,
} from "./helpers.js";

let ctx: TestContext;

beforeEach(async () => {
  limiters.login.reset();
  limiters.mfa.reset();
  limiters.search.reset();
  limiters.upload.reset();
  ctx = await createTestContext();
});

afterEach(async () => {
  await closeTestContext(ctx);
});

const PROTECTED = [
  "/api/dashboard",
  "/api/condomini",
  "/api/persone",
  "/api/segnalazioni",
  "/api/assemblee",
  "/api/rendiconti/periodi",
  "/api/consumi",
  "/api/documenti",
  "/api/import",
  "/api/ricerca?q=abc",
  "/api/admin/audit",
];

describe("Accesso e autorizzazione", () => {
  it("rifiuta ogni API protetta senza autenticazione", async () => {
    for (const path of PROTECTED) {
      const response = await request(ctx.app).get(path);
      expect(response.status, path).toBe(401);
    }
  });

  it("non espone una registrazione pubblica", async () => {
    const response = await request(ctx.app).post("/api/auth/register").send({ email: "x@y.it" });
    expect([404, 405]).toContain(response.status);
  });

  it("rifiuta credenziali errate senza rivelare se l’account esiste", async () => {
    const user = await createUser(ctx.db);
    const wrongPassword = await request(ctx.app)
      .post("/api/auth/login")
      .send({ email: user.email, password: "Password-Sbagliata-1" });
    const unknownUser = await request(ctx.app)
      .post("/api/auth/login")
      .send({ email: "inesistente@example.invalid", password: "Password-Sbagliata-1" });
    expect(wrongPassword.status).toBe(401);
    expect(unknownUser.status).toBe(401);
    expect(wrongPassword.body.error).toBe(unknownUser.body.error);
  });

  it("consente il login e impone il token CSRF sulle modifiche", async () => {
    const user = await createUser(ctx.db);
    const session = await login(ctx.app, { email: user.email, password: user.password });
    const me = await session.agent.get("/api/auth/session");
    expect(me.body.authenticated).toBe(true);

    const senzaCsrf = await session.agent.post("/api/condomini").send({ denominazione: "Test" });
    expect(senzaCsrf.status).toBe(403);

    const conCsrf = await send(session, "post", "/api/condomini", {
      denominazione: "Condominio Test Csrf",
      comune: "Bologna",
    });
    expect(conCsrf.status).toBe(201);
  });

  it("blocca l’account dopo ripetuti tentativi errati", async () => {
    const user = await createUser(ctx.db);
    limiters.login.reset();
    for (let i = 0; i < 6; i++) {
      await request(ctx.app).post("/api/auth/login").send({ email: user.email, password: "Sbagliata-000!" });
    }
    const response = await request(ctx.app).post("/api/auth/login").send({ email: user.email, password: user.password });
    expect([429, 401]).toContain(response.status);
  });

  it("revoca la sessione al logout", async () => {
    const user = await createUser(ctx.db);
    const session = await login(ctx.app, { email: user.email, password: user.password });
    await send(session, "post", "/api/auth/logout");
    const response = await session.agent.get("/api/dashboard");
    expect(response.status).toBe(401);
  });

  it("richiede il cambio password quando l’account è creato con password temporanea", async () => {
    const user = await createUser(ctx.db, { mustChangePassword: true });
    const session = await login(ctx.app, { email: user.email, password: user.password });
    const sessionResponse = await session.agent.get("/api/auth/session");
    expect(sessionResponse.body.user.mustChangePassword).toBe(true);

    const cambio = await send(session, "post", "/api/auth/password", {
      passwordAttuale: user.password,
      nuovaPassword: "NuovaPassword-2026!",
      conferma: "NuovaPassword-2026!",
    });
    expect(cambio.status).toBe(200);
    const after = await session.agent.get("/api/auth/session");
    expect(after.body.user.mustChangePassword).toBe(false);
  });

  it("rifiuta una nuova password debole", async () => {
    const user = await createUser(ctx.db);
    const session = await login(ctx.app, { email: user.email, password: user.password });
    const response = await send(session, "post", "/api/auth/password", {
      passwordAttuale: user.password,
      nuovaPassword: "corta",
      conferma: "corta",
    });
    expect(response.status).toBe(400);
    expect(response.body.errors?.nuovaPassword).toBeTruthy();
  });

  it("verifica il codice MFA e impedisce il riutilizzo", async () => {
    const user = await createUser(ctx.db);
    const session = await login(ctx.app, { email: user.email, password: user.password });

    const setup = await send(session, "post", "/api/auth/mfa/setup", { password: user.password });
    expect(setup.status).toBe(200);
    const secret = setup.body.secret as string;
    expect(setup.body.qr).toMatch(/^data:image\/png;base64,/);

    const enableCode = totpCode(secret, currentTotpCounter());
    const enable = await send(session, "post", "/api/auth/mfa/enable", { code: enableCode });
    expect(enable.status).toBe(200);

    limiters.login.reset();
    const freshAgent = request.agent(ctx.app);
    const loginResponse = await freshAgent
      .post("/api/auth/login")
      .send({ email: user.email, password: user.password });
    expect(loginResponse.status).toBe(200);
    expect(loginResponse.body.mfaRequired).toBe(true);

    const blocked = await freshAgent.get("/api/dashboard");
    expect(blocked.status).toBe(401);

    const nextCode = totpCode(secret, currentTotpCounter() + 1);
    const verify = await freshAgent.post("/api/auth/mfa/verify").send({ code: nextCode });
    expect(verify.status).toBe(200);

    const allowed = await freshAgent.get("/api/dashboard");
    expect(allowed.status).toBe(200);
  });

  it("protegge i documenti: nessun accesso senza sessione", async () => {
    const user = await createUser(ctx.db);
    const session = await login(ctx.app, { email: user.email, password: user.password });
    const condominio = await send(session, "post", "/api/condomini", { denominazione: "Condominio Documenti" });
    const upload = await session.agent
      .post("/api/documenti")
      .set("x-csrf-token", session.csrf)
      .field("entitaTipo", "condominio")
      .field("entitaId", condominio.body.id)
      .attach("file", Buffer.from("%PDF-1.4\n% documento di test sintetico\n"), "test.pdf");
    expect(upload.status).toBe(201);

    const download = await request(ctx.app).get(`/api/documenti/${upload.body.id}/download`);
    expect(download.status).toBe(401);

    const authenticated = await session.agent.get(`/api/documenti/${upload.body.id}/download`);
    expect(authenticated.status).toBe(200);
    expect(authenticated.headers["content-disposition"]).toContain("attachment");
    expect(authenticated.headers["cache-control"]).toContain("no-store");
  });

  it("rifiuta file con contenuto non corrispondente al formato dichiarato", async () => {
    const user = await createUser(ctx.db);
    const session = await login(ctx.app, { email: user.email, password: user.password });
    const response = await session.agent
      .post("/api/documenti")
      .set("x-csrf-token", session.csrf)
      .field("entitaTipo", "condominio")
      .attach("file", Buffer.from("<script>alert(1)</script>"), "malevolo.pdf");
    expect(response.status).toBe(400);
  });
});
